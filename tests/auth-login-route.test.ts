// P0 #2: record_login_result used to be anon/authenticated-callable with a
// caller-supplied success/failure boolean, so an unauthenticated attacker
// who knew a user's email could lock that account out without ever
// attempting the real password. The fix moves the actual
// supabase.auth.signInWithPassword call server-side (this route) and
// reports only what it just observed -- never anything from the request
// body -- via the service role, which is the only role record_login_result
// is now granted to. These tests exercise that this route (a) never lets
// the caller supply the success/failure outcome itself, and (b) still
// performs the legitimate rate-limit/lockout/record flow.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  rateLimitAllowed: true,
  lockout: { locked: false } as { locked: boolean; locked_until?: string },
  signInError: null as { message: string } | null,
  serviceRpc: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve(state.rateLimitAllowed)),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: state.serviceRpc,
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { signInWithPassword: state.signInWithPassword },
  }),
}));

function request(body: unknown) {
  return new Request("https://app.example.test/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  state.rateLimitAllowed = true;
  state.lockout = { locked: false };
  state.signInError = null;
  state.serviceRpc = vi.fn((name: string) => {
    if (name === "check_login_lockout") return Promise.resolve({ data: state.lockout, error: null });
    if (name === "record_login_result") return Promise.resolve({ data: null, error: null });
    throw new Error(`unexpected rpc: ${name}`);
  });
  state.signInWithPassword = vi.fn(() => Promise.resolve({ error: state.signInError }));
});

describe("POST /api/auth/login", () => {
  it("rejects a missing email/password before touching rate limiting, lockout, or auth", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(request({ email: "" }));

    expect(res.status).toBe(400);
    expect(state.signInWithPassword).not.toHaveBeenCalled();
    expect(state.serviceRpc).not.toHaveBeenCalled();
  });

  it("blocks a rate-limited caller without ever calling Supabase Auth or recording a result", async () => {
    state.rateLimitAllowed = false;
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(request({ email: "victim@example.com", password: "whatever" }));

    expect(res.status).toBe(429);
    expect(state.signInWithPassword).not.toHaveBeenCalled();
    expect(state.serviceRpc).not.toHaveBeenCalled();
  });

  it("blocks a locked account before ever attempting Supabase Auth", async () => {
    state.lockout = { locked: true, locked_until: "2026-09-17T11:00:00Z" };
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(request({ email: "victim@example.com", password: "whatever" }));

    expect(res.status).toBe(423);
    expect(state.signInWithPassword).not.toHaveBeenCalled();
    expect(state.serviceRpc).toHaveBeenCalledWith("check_login_lockout", { p_email: "victim@example.com" });
    expect(state.serviceRpc).not.toHaveBeenCalledWith("record_login_result", expect.anything());
  });

  it("records a real failure exactly as observed from the actual signInWithPassword call -- not from request body", async () => {
    state.signInError = { message: "Invalid login credentials" };
    const { POST } = await import("@/app/api/auth/login/route");
    // The request body has no "success"/"p_success" field at all -- there is
    // nothing for an attacker to set to force a false failure report.
    const res = await POST(request({ email: "victim@example.com", password: "wrong-guess" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Incorrect email or password.");
    expect(state.signInWithPassword).toHaveBeenCalledWith({ email: "victim@example.com", password: "wrong-guess" });
    expect(state.serviceRpc).toHaveBeenCalledWith("record_login_result", { p_email: "victim@example.com", p_success: false });
  });

  it("records a real success exactly as observed, and returns ok", async () => {
    state.signInError = null;
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(request({ email: "owner@example.com", password: "correct-password" }));

    expect(res.status).toBe(200);
    expect(state.serviceRpc).toHaveBeenCalledWith("record_login_result", { p_email: "owner@example.com", p_success: true });
  });
});
