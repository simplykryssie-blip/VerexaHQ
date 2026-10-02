// VEREXA-AAL-001: focused tests for the one function that decides whether
// the CURRENT session has actually completed its AAL2 (MFA) challenge.
import { describe, it, expect } from "vitest";
import { hasAal2 } from "@/lib/auth/requireAal2";

function base64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fakeAccessToken(payload: Record<string, unknown>): string {
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url(payload)}.fakesignature`;
}

function fakeSupabase(accessToken: string | null) {
  return {
    auth: {
      getSession: () =>
        Promise.resolve({
          data: { session: accessToken ? { access_token: accessToken } : null },
        }),
    },
    // Only the subset hasAal2 actually touches -- intentionally not a full
    // SupabaseClient mock.
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

describe("hasAal2 (VEREXA-AAL-001)", () => {
  it("missing session -> false", async () => {
    expect(await hasAal2(fakeSupabase(null))).toBe(false);
  });

  it("aal1 session -> false", async () => {
    const token = fakeAccessToken({ aal: "aal1", sub: "user-1" });
    expect(await hasAal2(fakeSupabase(token))).toBe(false);
  });

  it("aal2 session -> true", async () => {
    const token = fakeAccessToken({ aal: "aal2", sub: "user-1" });
    expect(await hasAal2(fakeSupabase(token))).toBe(true);
  });

  it("malformed/missing aal claim -> false (fail closed)", async () => {
    expect(await hasAal2(fakeSupabase(fakeAccessToken({ sub: "user-1" })))).toBe(false);
    expect(await hasAal2(fakeSupabase("not-a-jwt"))).toBe(false);
    expect(await hasAal2(fakeSupabase("a.b.c"))).toBe(false);
  });

  it("does not accept nextLevel as proof -- only reads the JWT's own aal claim, never the separate nextLevel signal", async () => {
    // This fixture represents exactly the bypass scenario: a password-only
    // session (aal claim = aal1) where the ACCOUNT happens to have a
    // verified factor enrolled (which is what would make
    // supabase.auth.mfa.getAuthenticatorAssuranceLevel()'s nextLevel report
    // "aal2" even though this session never completed a challenge for it).
    // hasAal2() must still return false here, because it only decodes the
    // session's own `aal` claim and never calls getAuthenticatorAssuranceLevel()
    // or inspects factors/nextLevel at all.
    const token = fakeAccessToken({ aal: "aal1", sub: "user-1", amr: [{ method: "password", timestamp: 1 }] });
    expect(await hasAal2(fakeSupabase(token))).toBe(false);
  });

  it("is deterministic for the same token", async () => {
    const token = fakeAccessToken({ aal: "aal2" });
    const supabase = fakeSupabase(token);
    expect(await hasAal2(supabase)).toBe(await hasAal2(supabase));
  });
});
