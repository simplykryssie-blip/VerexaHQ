// VEREXA-ENV-001: Preview must never be able to reach Production's
// Supabase project (or vice versa), and a service-role key must never be
// paired with the wrong project's URL. These tests exercise the
// fail-closed checks in lib/env.ts directly, plus that the middleware
// wiring can't swallow a mismatch into a normal request continuing.
import { describe, it, expect, vi } from "vitest";
import {
  assertSupabaseProjectMatchesEnvironment,
  assertServiceRoleKeyMatchesProject,
  __ENV_ISOLATION_TEST_ONLY__,
} from "@/lib/env";

const { PRODUCTION_SUPABASE_PROJECT_REF, STAGING_SUPABASE_PROJECT_REF } = __ENV_ISOLATION_TEST_ONLY__;
const PRODUCTION_URL = `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`;
const STAGING_URL = `https://${STAGING_SUPABASE_PROJECT_REF}.supabase.co`;

function fakeServiceRoleJwt(ref: string | null): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64");
  const payloadObj: Record<string, unknown> = { role: "service_role", iss: "supabase" };
  if (ref !== null) payloadObj.ref = ref;
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64");
  return `${header}.${payload}.fakesignature`;
}

describe("assertSupabaseProjectMatchesEnvironment (VEREXA-ENV-001)", () => {
  it("A: production env + production URL -> PASS", () => {
    expect(() => assertSupabaseProjectMatchesEnvironment(PRODUCTION_URL, "production")).not.toThrow();
  });

  it("A: production URL with a trailing slash also PASSes (matches real Vercel-displayed value)", () => {
    expect(() => assertSupabaseProjectMatchesEnvironment(`${PRODUCTION_URL}/`, "production")).not.toThrow();
  });

  it("B: staging env + staging URL -> PASS", () => {
    expect(() => assertSupabaseProjectMatchesEnvironment(STAGING_URL, "staging")).not.toThrow();
  });

  it("C: staging env + production URL -> FAIL", () => {
    expect(() => assertSupabaseProjectMatchesEnvironment(PRODUCTION_URL, "staging")).toThrow(/production/i);
  });

  it("C variant: development env + production URL -> FAIL (same rule, not just 'staging')", () => {
    expect(() => assertSupabaseProjectMatchesEnvironment(PRODUCTION_URL, "development")).toThrow(/production/i);
  });

  it("D: production env + staging URL -> FAIL", () => {
    expect(() => assertSupabaseProjectMatchesEnvironment(STAGING_URL, "production")).toThrow(/non-production/i);
  });

  it("E: malformed URL -> FAIL", () => {
    expect(() => assertSupabaseProjectMatchesEnvironment("not-a-url", "production")).toThrow(/not a valid Supabase project URL/i);
    expect(() => assertSupabaseProjectMatchesEnvironment("https://example.com", "production")).toThrow(/not a valid Supabase project URL/i);
  });

  it("F: missing/empty URL -> FAIL", () => {
    expect(() => assertSupabaseProjectMatchesEnvironment(undefined, "production")).toThrow(/missing/i);
    expect(() => assertSupabaseProjectMatchesEnvironment("", "production")).toThrow(/missing/i);
    expect(() => assertSupabaseProjectMatchesEnvironment(null, "staging")).toThrow(/missing/i);
  });
});

describe("assertServiceRoleKeyMatchesProject (VEREXA-ENV-001)", () => {
  it("G: matching service-role JWT ref + URL ref -> PASS", () => {
    const key = fakeServiceRoleJwt(STAGING_SUPABASE_PROJECT_REF);
    expect(() => assertServiceRoleKeyMatchesProject(STAGING_URL, key)).not.toThrow();
  });

  it("H: mismatched service-role JWT ref + URL ref -> FAIL", () => {
    const key = fakeServiceRoleJwt(PRODUCTION_SUPABASE_PROJECT_REF);
    expect(() => assertServiceRoleKeyMatchesProject(STAGING_URL, key)).toThrow(/belongs to Supabase project/i);
  });

  it("I: missing service-role credential -> FAIL", () => {
    expect(() => assertServiceRoleKeyMatchesProject(STAGING_URL, undefined)).toThrow(/missing/i);
    expect(() => assertServiceRoleKeyMatchesProject(STAGING_URL, "")).toThrow(/missing/i);
  });

  it("I: malformed service-role credential -> FAIL", () => {
    expect(() => assertServiceRoleKeyMatchesProject(STAGING_URL, "not-a-jwt")).toThrow(/malformed/i);
  });

  it("I: service-role JWT with no ref claim -> FAIL", () => {
    const key = fakeServiceRoleJwt(null);
    expect(() => assertServiceRoleKeyMatchesProject(STAGING_URL, key)).toThrow(/malformed/i);
  });

  it("never includes the key value itself in a thrown message", () => {
    const key = fakeServiceRoleJwt(PRODUCTION_SUPABASE_PROJECT_REF);
    try {
      assertServiceRoleKeyMatchesProject(STAGING_URL, key);
      throw new Error("expected a throw");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(key);
    }
  });
});

describe("J: middleware cannot swallow an environment mismatch", () => {
  it("escapes the existing 'never throw from middleware' catch instead of returning a normal response", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({
      assertSupabaseProjectMatchesEnvironment: vi.fn(() => {
        throw new Error("VEREXA-ENV-001 test: simulated environment mismatch");
      }),
      getAppEnvironment: vi.fn(() => "staging"),
    }));

    const { NextRequest } = await import("next/server");
    const { updateSession } = await import("@/lib/supabase/middleware");

    const request = new NextRequest("https://app.example.test/dashboard");

    // If the mismatch were (incorrectly) checked inside the try/catch, this
    // would resolve to a NextResponse (the "never throw" fallback) instead
    // of rejecting -- that's exactly the regression this test guards against.
    await expect(updateSession(request)).rejects.toThrow("VEREXA-ENV-001 test: simulated environment mismatch");

    vi.doUnmock("@/lib/env");
  });
});
