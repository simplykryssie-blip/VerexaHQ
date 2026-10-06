// VEREXA-AAL-001: behavioral tests for the actual middleware redirect
// logic (not just source-string checks) -- executes updateSession()
// against a mocked Supabase client, the same vi.doMock + dynamic-import
// pattern already used by tests/env-isolation.test.ts's test J for this
// exact file. @/lib/supabaseEnvIsolation is mocked to a no-op so these
// tests exercise only the MFA/AAL logic, not VEREXA-ENV-001's own checks.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

function chainable(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "limit", "order", "maybeSingle", "single"];
  for (const m of methods) {
    builder[m] = vi.fn(() => builder);
  }
  builder.then = (onFulfilled: (value: typeof result) => unknown) => Promise.resolve(result).then(onFulfilled);
  return builder;
}

function makeFakeSupabase(opts: {
  user?: { id: string } | null;
  aal?: { currentLevel: string | null; nextLevel: string | null } | null;
  memberships?: { workspace_id: string }[];
  mfaRequiredPolicies?: { workspace_id: string }[];
}) {
  const tableResponses: Record<string, { data: unknown; error: unknown }> = {
    workspace_users: { data: opts.memberships ?? [], error: null },
    workspace_security_policies: { data: opts.mfaRequiredPolicies ?? [], error: null },
  };

  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: opts.user ?? null }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: opts.aal ?? { currentLevel: null, nextLevel: null }, error: null }),
      },
    },
    from: (table: string) => chainable(tableResponses[table] ?? { data: null, error: null }),
  };
}

// Every request below carries an sb_remember cookie so middleware's
// unrelated "remember me" enforcement (which runs before the MFA block and
// would otherwise try to sign the fake session out for lacking that
// cookie, calling supabase.auth.signOut() -- not part of this mock) never
// interferes with these MFA-focused tests.
const REMEMBER_ME_HEADERS = { cookie: "sb_remember=1" };

async function loadUpdateSession(fakeSupabase: ReturnType<typeof makeFakeSupabase>) {
  vi.resetModules();
  vi.doMock("@/lib/supabaseEnvIsolation", () => ({
    assertSupabaseProjectMatchesEnvironment: vi.fn(() => {}),
    getEdgeAppEnvironment: vi.fn(() => "staging"),
  }));
  vi.doMock("@supabase/ssr", () => ({
    createServerClient: vi.fn(() => fakeSupabase),
  }));
  const { NextRequest } = await import("next/server");
  const { updateSession } = await import("@/lib/supabase/middleware");
  return { NextRequest, updateSession };
}

describe("VEREXA-AAL-001 middleware MFA enforcement (executed, not source-only)", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    vi.doUnmock("@supabase/ssr");
    vi.doUnmock("@/lib/supabaseEnvIsolation");
    // middleware.ts bails out early (before ever reaching the MFA block
    // under test) if either env var is unset -- these tests are about the
    // MFA logic specifically, not that guard, so both are stubbed here.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://staging-project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
  });

  it("a verified-factor session with a pending challenge (aal1/aal2) is redirected to /mfa-challenge from /settings/security -- the exact bypass this finding closes", async () => {
    const fake = makeFakeSupabase({ user: { id: "u1" }, aal: { currentLevel: "aal1", nextLevel: "aal2" } });
    const { NextRequest, updateSession } = await loadUpdateSession(fake);
    const response = await updateSession(new NextRequest("https://app.example.test/settings/security", { headers: REMEMBER_ME_HEADERS }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/mfa-challenge");
  });

  it("the same pending-challenge session is still redirected from an ordinary staff page too", async () => {
    const fake = makeFakeSupabase({ user: { id: "u1" }, aal: { currentLevel: "aal1", nextLevel: "aal2" } });
    const { NextRequest, updateSession } = await loadUpdateSession(fake);
    const response = await updateSession(new NextRequest("https://app.example.test/dashboard", { headers: REMEMBER_ME_HEADERS }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/mfa-challenge");
  });

  it("/mfa-challenge itself remains reachable at aal1 with a pending challenge -- never redirected to itself", async () => {
    const fake = makeFakeSupabase({ user: { id: "u1" }, aal: { currentLevel: "aal1", nextLevel: "aal2" } });
    const { NextRequest, updateSession } = await loadUpdateSession(fake);
    const response = await updateSession(new NextRequest("https://app.example.test/mfa-challenge", { headers: REMEMBER_ME_HEADERS }));
    expect(response.headers.get("location")).toBeNull();
  });

  it("a fully-stepped-up (aal2) session reaches /settings/security normally, no redirect", async () => {
    const fake = makeFakeSupabase({ user: { id: "u1" }, aal: { currentLevel: "aal2", nextLevel: "aal2" } });
    const { NextRequest, updateSession } = await loadUpdateSession(fake);
    const response = await updateSession(new NextRequest("https://app.example.test/settings/security", { headers: REMEMBER_ME_HEADERS }));
    expect(response.headers.get("location")).toBeNull();
  });

  it("a no-factor-enrolled session (aal1/aal1) in a workspace that requires MFA is redirected to /settings/security to enroll", async () => {
    const fake = makeFakeSupabase({
      user: { id: "u1" },
      aal: { currentLevel: "aal1", nextLevel: "aal1" },
      memberships: [{ workspace_id: "ws-1" }],
      mfaRequiredPolicies: [{ workspace_id: "ws-1" }],
    });
    const { NextRequest, updateSession } = await loadUpdateSession(fake);
    const response = await updateSession(new NextRequest("https://app.example.test/dashboard", { headers: REMEMBER_ME_HEADERS }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/settings/security");
  });

  it("/settings/security itself is never redirected to itself for a no-factor-enrolled session (no loop)", async () => {
    const fake = makeFakeSupabase({
      user: { id: "u1" },
      aal: { currentLevel: "aal1", nextLevel: "aal1" },
      memberships: [{ workspace_id: "ws-1" }],
      mfaRequiredPolicies: [{ workspace_id: "ws-1" }],
    });
    const { NextRequest, updateSession } = await loadUpdateSession(fake);
    const response = await updateSession(new NextRequest("https://app.example.test/settings/security", { headers: REMEMBER_ME_HEADERS }));
    expect(response.headers.get("location")).toBeNull();
  });

  it("enrollment is forced when ANY active membership requires MFA, independent of which row the membership query returns first", async () => {
    // Two memberships; the one requiring MFA is NOT first in the array --
    // this is exactly the ordering this fix no longer depends on.
    const fake = makeFakeSupabase({
      user: { id: "u1" },
      aal: { currentLevel: "aal1", nextLevel: "aal1" },
      memberships: [{ workspace_id: "ws-no-mfa" }, { workspace_id: "ws-requires-mfa" }],
      mfaRequiredPolicies: [{ workspace_id: "ws-requires-mfa" }],
    });
    const { NextRequest, updateSession } = await loadUpdateSession(fake);
    const response = await updateSession(new NextRequest("https://app.example.test/dashboard", { headers: REMEMBER_ME_HEADERS }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/settings/security");
  });

  it("no redirect when no active membership requires MFA", async () => {
    const fake = makeFakeSupabase({
      user: { id: "u1" },
      aal: { currentLevel: "aal1", nextLevel: "aal1" },
      memberships: [{ workspace_id: "ws-1" }, { workspace_id: "ws-2" }],
      mfaRequiredPolicies: [],
    });
    const { NextRequest, updateSession } = await loadUpdateSession(fake);
    const response = await updateSession(new NextRequest("https://app.example.test/dashboard", { headers: REMEMBER_ME_HEADERS }));
    expect(response.headers.get("location")).toBeNull();
  });

  it("API routes are never subject to either MFA redirect, by design (application-layer AAL2 enforcement for sensitive APIs lives in lib/auth/requireAal2.ts instead)", async () => {
    const fake = makeFakeSupabase({ user: { id: "u1" }, aal: { currentLevel: "aal1", nextLevel: "aal2" } });
    const { NextRequest, updateSession } = await loadUpdateSession(fake);
    const response = await updateSession(new NextRequest("https://app.example.test/api/stripe/refund", { method: "POST", headers: REMEMBER_ME_HEADERS }));
    expect(response.headers.get("location")).toBeNull();
  });
});
