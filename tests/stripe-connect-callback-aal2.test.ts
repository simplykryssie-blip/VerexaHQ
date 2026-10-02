// VEREXA-AAL-001 follow-up (Session 62/63): app/api/stripe/connect/callback
// was the one hasAal2() call site that never called supabase.auth.getUser()
// first -- every other protected route does, which is what makes trusting
// hasAal2()'s un-revalidated getSession() read safe elsewhere. These tests
// prove the fix: a session whose getUser() comes back empty (simulating a
// stale/revoked session whose cached JWT still happens to carry an aal2
// claim) must be rejected before ever reaching workspaces.update(), and a
// genuinely valid authenticated + AAL2 session must still complete the
// callback exactly as before.
import { describe, it, expect, vi, beforeEach } from "vitest";

function base64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fakeAccessToken(payload: Record<string, unknown>): string {
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url(payload)}.fakesignature`;
}

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  accessToken: null as string | null,
  updateEq: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => (name === "stripe_oauth_state" ? { value: "same-state-value:ws-1" } : undefined),
    delete: vi.fn(),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: state.user } }),
      getSession: () =>
        Promise.resolve({
          data: { session: state.accessToken ? { access_token: state.accessToken } : null },
        }),
    },
    from: () => ({
      update: () => ({
        eq: state.updateEq,
      }),
    }),
  }),
}));

vi.mock("@/lib/stripe/client", () => ({
  exchangeOAuthCode: () => Promise.resolve({ ok: true, data: { stripeUserId: "acct_123" } }),
  fetchAccount: () =>
    Promise.resolve({ ok: true, data: { charges_enabled: true, payouts_enabled: true, details_submitted: true } }),
  deriveConnectStatus: () => "connected",
}));

function request() {
  return new Request("https://app.example.test/api/stripe/connect/callback?code=abc&state=same-state-value:ws-1");
}

beforeEach(() => {
  vi.resetModules();
  state.user = null;
  state.accessToken = null;
  state.updateEq = vi.fn(() => Promise.resolve({ error: null }));
});

describe("GET /api/stripe/connect/callback (VEREXA-AAL-001)", () => {
  it("a stale/revoked session -- getUser() returns no user even though the cached session still carries an aal2 claim -- is rejected before workspaces.update() is ever called", async () => {
    state.user = null;
    state.accessToken = fakeAccessToken({ aal: "aal2", sub: "user-1" });

    const { GET } = await import("@/app/api/stripe/connect/callback/route");
    const response = await GET(request());

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).not.toContain("stripe_connected=1");
    expect(state.updateEq).not.toHaveBeenCalled();
  });

  it("a valid authenticated user with a genuine aal2 session completes the callback exactly as before", async () => {
    state.user = { id: "user-1" };
    state.accessToken = fakeAccessToken({ aal: "aal2", sub: "user-1" });

    const { GET } = await import("@/app/api/stripe/connect/callback/route");
    const response = await GET(request());

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("stripe_connected=1");
    expect(state.updateEq).toHaveBeenCalledWith("id", "ws-1");
  });

  it("a valid authenticated user whose session is only aal1 is still rejected -- getUser() alone is not sufficient, the existing AAL2 check still applies", async () => {
    state.user = { id: "user-1" };
    state.accessToken = fakeAccessToken({ aal: "aal1", sub: "user-1" });

    const { GET } = await import("@/app/api/stripe/connect/callback/route");
    const response = await GET(request());

    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).not.toContain("stripe_connected=1");
    expect(state.updateEq).not.toHaveBeenCalled();
  });
});
