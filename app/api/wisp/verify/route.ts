import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.WISP_FROM_EMAIL || "notifications@monarchtaxsuite.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, "0");
}

function randomToken() {
  const values = new Uint8Array(32);
  crypto.getRandomValues(values);
  return Buffer.from(values).toString("base64url");
}

async function supabase(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("WISP data service is not configured.");
  }

  const result = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  const text = await result.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!result.ok) {
    const message =
      typeof data === "object" && data && "message" in data
        ? String((data as { message?: unknown }).message)
        : "Supabase request failed.";
    throw new Error(message);
  }

  return data;
}

async function sendEmail(to: string, code: string) {
  if (!RESEND_API_KEY) {
    throw new Error("Email service is not configured.");
  }

  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: "Your Monarch WISP verification code",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#111">
          <h2 style="font-family:Georgia,serif">Verify Your Email</h2>
          <p>Use the verification code below to continue your Monarch Tax Suite WISP assessment.</p>
          <div style="font-size:34px;letter-spacing:10px;font-weight:700;padding:18px 0">${code}</div>
          <p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
        </div>
      `,
    }),
  });

  const text = await result.text();
  if (!result.ok) {
    let message = "The email provider rejected the message.";
    try {
      message = JSON.parse(text)?.message || message;
    } catch {}
    throw new Error(message);
  }
}

async function sendVerification(email: string) {
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email) || email.length > 254) {
    throw new Error("Please enter a valid email address.");
  }

  const existing = (await supabase(
    `/rest/v1/wisp_email_verifications?select=id,last_sent_at&email=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=1`,
  )) as Array<{ id: string; last_sent_at: string }>;

  if (existing[0]?.last_sent_at) {
    const elapsed = Date.now() - new Date(existing[0].last_sent_at).getTime();
    if (elapsed < 45_000) {
      throw new Error("Please wait a few seconds before requesting another code.");
    }
  }

  const code = randomCode();
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();

  await supabase("/rest/v1/wisp_email_verifications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      email,
      code_hash: await sha256(code),
      verification_token_hash: await sha256(token),
      expires_at: expiresAt,
      verified_at: null,
      attempts: 0,
      last_sent_at: now.toISOString(),
    }),
  });

  try {
    await sendEmail(email, code);
  } catch (error) {
    // Do not leave the user waiting on a successful-looking request if delivery fails.
    throw error;
  }

  return { sent: true };
}

async function verifyCode(email: string, code: string) {
  const rows = (await supabase(
    `/rest/v1/wisp_email_verifications?select=id,code_hash,expires_at,attempts&email=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=1`,
  )) as Array<{
    id: string;
    code_hash: string;
    expires_at: string;
    attempts: number;
  }>;

  const row = rows[0];
  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error("That code has expired. Please request a new code.");
  }

  if ((row.attempts ?? 0) >= 5) {
    throw new Error("Too many attempts. Please request a new code.");
  }

  if ((await sha256(code)) !== row.code_hash) {
    await supabase(`/rest/v1/wisp_email_verifications?id=eq.${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ attempts: (row.attempts ?? 0) + 1 }),
    });
    throw new Error("That code is incorrect.");
  }

  const token = randomToken();
  await supabase(`/rest/v1/wisp_email_verifications?id=eq.${encodeURIComponent(row.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      verification_token_hash: await sha256(token),
      verified_at: new Date().toISOString(),
    }),
  });

  return { verified: true, verification_token: token };
}

async function captureLead(email: string, verificationToken: string, payload: unknown) {
  if (!email || !verificationToken) {
    throw new Error("Email verification is required.");
  }

  return supabase("/rest/v1/rpc/capture_verified_wisp_lead_no_auth", {
    method: "POST",
    body: JSON.stringify({
      p_payload: payload,
      p_verification_token: verificationToken,
    }),
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body?.action || "");

    if (action === "send") {
      return response(await sendVerification(String(body.email || "").trim().toLowerCase()));
    }

    if (action === "verify") {
      return response(
        await verifyCode(
          String(body.email || "").trim().toLowerCase(),
          String(body.code || "").trim(),
        ),
      );
    }

    if (action === "capture") {
      return response(
        await captureLead(
          String(body.email || "").trim().toLowerCase(),
          String(body.verification_token || ""),
          body.payload || {},
        ),
      );
    }

    return response({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("WISP verification route error", error);
    return response(
      { error: error instanceof Error ? error.message : "Request failed." },
      400,
    );
  }
}