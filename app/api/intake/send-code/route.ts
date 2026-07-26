import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/serverAuth";
import { isEmailConfigured, isSmsConfigured } from "@/lib/providerStatus";
import { isRateLimited, requestIp } from "@/lib/intakeRateLimit";
import { publicIntakeErrorMessage } from "@/lib/publicIntakeError";

// Public, unauthenticated endpoint. The only thing that stands in for auth
// here is the intake return-link token, re-validated on every call by
// resume_public_intake (never trusted just because the request has one).
//
// generate_intake_verification_code is REVOKEd from anon/authenticated at
// the database level -- this route, running with the service-role key, is
// the only place in the system that ever sees a raw verification code, and
// only for the instant it takes to hand it to Resend/Twilio. It is never
// echoed back to the browser in production.
function isProduction() {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV === "production";
  return process.env.NODE_ENV === "production";
}

export async function POST(req: NextRequest) {
  const ip = requestIp(req);
  if (isRateLimited(`send-code:${ip}`, 8, 10 * 60 * 1000)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  const payload = (await req.json().catch(() => null)) as
    | { token?: string; channel?: string; destination?: string }
    | null;
  const token = payload?.token?.trim();
  const channel = payload?.channel?.trim();
  const destination = payload?.destination?.trim();

  if (!token || (channel !== "email" && channel !== "sms") || !destination) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: intake, error: resumeError } = await service.rpc("resume_public_intake", {
    p_token: token,
  });
  if (resumeError || !intake) {
    return NextResponse.json(
      { ok: false, error: "This link is invalid or has expired." },
      { status: 400 },
    );
  }

  const intakeId = (intake as { id: string }).id;

  if (isRateLimited(`send-code:intake:${intakeId}`, 6, 10 * 60 * 1000)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  const { data: codeRows, error: genError } = await service.rpc(
    "generate_intake_verification_code",
    { p_intake_id: intakeId, p_channel: channel, p_destination: destination },
  );
  if (genError) {
    console.error("[public-intake] generate_intake_verification_code", genError.code, genError.message);
    return NextResponse.json(
      { ok: false, error: publicIntakeErrorMessage(genError, "We couldn't send a code right now. Please try again.") },
      { status: 400 },
    );
  }
  const row = Array.isArray(codeRows) ? codeRows[0] : codeRows;
  const rawCode = row?.raw_code as string | undefined;
  const expiresAt = row?.expires_at as string | undefined;
  if (!rawCode) {
    return NextResponse.json({ ok: false, error: "Could not generate a code." }, { status: 500 });
  }

  const devPreview = !isProduction() ? { devCode: rawCode } : {};

  if (channel === "email") {
    if (!isEmailConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          reason:
            "Email delivery is not configured for this workspace yet. Please contact our office to verify your intake, or ask staff to configure email delivery.",
          ...devPreview,
        },
        { status: 503 },
      );
    }
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM_ADDRESS as string,
        to: destination,
        subject: "Your verification code",
        html: `<p>Your verification code is <strong>${rawCode}</strong>. It expires in 10 minutes.</p>`,
      });
      if (error) {
        return NextResponse.json({ ok: false, sent: false, error: "Could not send the email." }, { status: 502 });
      }
    } catch {
      return NextResponse.json({ ok: false, sent: false, error: "Could not send the email." }, { status: 500 });
    }
  } else {
    if (!isSmsConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          reason:
            "Text-message delivery is not configured for this workspace yet. Please contact our office to verify your intake, or ask staff to configure SMS delivery.",
          ...devPreview,
        },
        { status: 503 },
      );
    }
    try {
      const twilioModule = await import("twilio");
      const client = twilioModule.default(
        process.env.TWILIO_ACCOUNT_SID as string,
        process.env.TWILIO_AUTH_TOKEN as string,
      );
      await client.messages.create({
        to: destination,
        from: process.env.TWILIO_FROM_NUMBER as string,
        body: `Your verification code is ${rawCode}. It expires in 10 minutes.`,
      });
    } catch {
      return NextResponse.json({ ok: false, sent: false, error: "Could not send the text message." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, sent: true, expiresAt, ...devPreview });
}
