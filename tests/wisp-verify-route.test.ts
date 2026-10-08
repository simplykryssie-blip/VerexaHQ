// WISP Step 5 fix: sendVerification()'s email check was
// /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/ -- a regex LITERAL with doubled
// backslashes, which matches a literal backslash character (not the
// intended whitespace-exclusion/dot-escape), so no real email could ever
// satisfy it. Every "send" call failed validation before ever reaching
// Supabase or Resend. This proves the fixed single-backslash regex
// accepts a normal email and still rejects a malformed one.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchCalls: { url: string; init?: RequestInit }[] = [];

function mockFetchImplementation(url: string, init?: RequestInit): Promise<Response> {
  fetchCalls.push({ url, init });

  if (url.includes("/rest/v1/wisp_email_verifications") && (!init || init.method === undefined)) {
    // existing-row lookup (GET-style select, no method specified)
    return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
  }
  if (url.includes("/rest/v1/wisp_email_verifications") && init?.method === "POST") {
    return Promise.resolve(new Response("", { status: 201 }));
  }
  if (url.includes("api.resend.com/emails")) {
    return Promise.resolve(new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));
  }
  return Promise.resolve(new Response(JSON.stringify({ message: "unexpected fetch in test" }), { status: 500 }));
}

function request(body: unknown) {
  return new Request("https://monarchtaxsuite.com/api/wisp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  fetchCalls.length = 0;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.RESEND_API_KEY = "test-resend-key";
  delete process.env.WISP_FROM_EMAIL;
  vi.stubGlobal("fetch", vi.fn(mockFetchImplementation));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/wisp/verify (action=send) -- email validation regex fix", () => {
  it("accepts a normal email address and reaches Resend -- the broken double-escaped regex rejected every real email", async () => {
    const { POST } = await import("@/app/api/wisp/verify/route");
    const res = await POST(request({ action: "send", email: "jane@example.com" }) as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ sent: true });
    expect(fetchCalls.some((c) => c.url.includes("api.resend.com/emails"))).toBe(true);
  });

  it("still rejects a malformed email (no @) with the intended validation message", async () => {
    const { POST } = await import("@/app/api/wisp/verify/route");
    const res = await POST(request({ action: "send", email: "not-an-email" }) as any);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("Please enter a valid email address.");
    expect(fetchCalls.some((c) => c.url.includes("api.resend.com/emails"))).toBe(false);
  });

  it("still rejects an email with no domain dot", async () => {
    const { POST } = await import("@/app/api/wisp/verify/route");
    const res = await POST(request({ action: "send", email: "jane@localhost" }) as any);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("Please enter a valid email address.");
  });

  it("uses the documented default sender when WISP_FROM_EMAIL is unset", async () => {
    const { POST } = await import("@/app/api/wisp/verify/route");
    await POST(request({ action: "send", email: "jane@example.com" }) as any);
    const resendCall = fetchCalls.find((c) => c.url.includes("api.resend.com/emails"));
    const sentBody = JSON.parse(resendCall!.init!.body as string);
    expect(sentBody.from).toBe("notifications@monarchtaxsuite.com");
  });
});
