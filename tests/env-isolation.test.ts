// VEREXA-ENV-001: Preview must never be able to reach Production's
// Supabase project (or vice versa), and a service-role key must never be
// paired with the wrong project's URL. These tests exercise the
// fail-closed checks in lib/env.ts directly, plus that the middleware
// wiring can't swallow a mismatch into a normal request continuing.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertSupabaseProjectMatchesEnvironment,
  assertServiceRoleKeyMatchesProject,
  getBrowserAppEnvironment,
  getEdgeAppEnvironment,
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

describe("getEdgeAppEnvironment (Edge-safe, VEREXA-ENV-001 Session 38)", () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalVercelTargetEnv = process.env.VERCEL_TARGET_ENV;

  it("maps VERCEL_ENV=production to \"production\"", () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.VERCEL_TARGET_ENV;
    expect(getEdgeAppEnvironment()).toBe("production");
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.VERCEL_TARGET_ENV = originalVercelTargetEnv;
  });

  it("maps VERCEL_ENV=preview to \"staging\"", () => {
    process.env.VERCEL_ENV = "preview";
    delete process.env.VERCEL_TARGET_ENV;
    expect(getEdgeAppEnvironment()).toBe("staging");
    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.VERCEL_TARGET_ENV = originalVercelTargetEnv;
  });

  it("falls closed to \"development\" (never \"production\") when unset or unrecognized", () => {
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_TARGET_ENV;
    expect(getEdgeAppEnvironment()).toBe("development");

    process.env.VERCEL_ENV = "some-unexpected-value";
    expect(getEdgeAppEnvironment()).toBe("development");

    process.env.VERCEL_ENV = originalVercelEnv;
    process.env.VERCEL_TARGET_ENV = originalVercelTargetEnv;
  });
});

describe("getBrowserAppEnvironment (VEREXA-ENV-001)", () => {
  const original = process.env.NEXT_PUBLIC_VERCEL_ENV;

  it("maps NEXT_PUBLIC_VERCEL_ENV=production to \"production\"", () => {
    process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
    expect(getBrowserAppEnvironment()).toBe("production");
    process.env.NEXT_PUBLIC_VERCEL_ENV = original;
  });

  it("maps NEXT_PUBLIC_VERCEL_ENV=preview to \"staging\"", () => {
    process.env.NEXT_PUBLIC_VERCEL_ENV = "preview";
    expect(getBrowserAppEnvironment()).toBe("staging");
    process.env.NEXT_PUBLIC_VERCEL_ENV = original;
  });

  it("falls closed to \"development\" when unset", () => {
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    expect(getBrowserAppEnvironment()).toBe("development");
    process.env.NEXT_PUBLIC_VERCEL_ENV = original;
  });
});

describe("Edge/browser import-graph safety (VEREXA-ENV-001 Session 38 build regression)", () => {
  // Static source check, not a module-resolution test: Vitest runs under
  // Node, where @vercel/functions resolves fine, so actually importing
  // these files here would NOT reproduce the Edge/browser webpack failure
  // either way. What broke the real build was their *source* statically
  // importing something that pulls in @vercel/functions -- first via
  // lib/supabase/middleware.ts (Edge), then via lib/supabase/client.ts
  // (browser) -- so this asserts both sources stay clean, mirroring the
  // existing source-string-check pattern already used elsewhere in this
  // test suite (e.g. tests/contact-sharing-schema.test.ts).
  function readSource(relativePath: string): string {
    return readFileSync(join(process.cwd(), relativePath), "utf8");
  }

  // Checks for an actual import/require of the package, not just the
  // string "@vercel/functions" appearing anywhere -- several files below
  // legitimately mention it by name in explanatory comments.
  function importsPackage(source: string, pkg: string): boolean {
    return new RegExp(`from\\s+["']${pkg}["']|require\\(["']${pkg}["']\\)`).test(source);
  }

  it("lib/supabase/middleware.ts does not import \"@/lib/env\" or \"@vercel/functions\"", () => {
    const source = readSource("lib/supabase/middleware.ts");
    expect(importsPackage(source, "@/lib/env")).toBe(false);
    expect(importsPackage(source, "@vercel/functions")).toBe(false);
    expect(source).toContain('from "@/lib/supabaseEnvIsolation"');
  });

  it("root middleware.ts does not import \"@/lib/env\" or \"@vercel/functions\" (directly or via a re-export it pulls in)", () => {
    const source = readSource("middleware.ts");
    expect(importsPackage(source, "@/lib/env")).toBe(false);
    expect(importsPackage(source, "@vercel/functions")).toBe(false);
  });

  it("lib/supabase/client.ts (the browser bundle) does not import \"@/lib/env\" or \"@vercel/functions\"", () => {
    const source = readSource("lib/supabase/client.ts");
    expect(importsPackage(source, "@/lib/env")).toBe(false);
    expect(importsPackage(source, "@vercel/functions")).toBe(false);
    expect(source).toContain('from "@/lib/supabaseEnvIsolation"');
  });

  it("lib/supabaseEnvIsolation.ts itself never imports @vercel/functions", () => {
    const source = readSource("lib/supabaseEnvIsolation.ts");
    expect(importsPackage(source, "@vercel/functions")).toBe(false);
  });

  it("lib/env.ts still imports @vercel/functions for its own (Node-only) getAppEnvironment()", () => {
    // Confirms the fix didn't remove this for service.ts/server.ts's sake --
    // it must still be here, just not reachable from Edge middleware or the
    // browser bundle.
    const source = readSource("lib/env.ts");
    expect(importsPackage(source, "@vercel/functions")).toBe(true);
  });
});

describe("J: middleware cannot swallow an environment mismatch", () => {
  it("escapes the existing 'never throw from middleware' catch instead of returning a normal response", async () => {
    vi.resetModules();
    // middleware.ts imports from "@/lib/supabaseEnvIsolation" directly
    // (not "@/lib/env" -- see the Edge import-graph tests above), so that's
    // the module to mock here.
    vi.doMock("@/lib/supabaseEnvIsolation", () => ({
      assertSupabaseProjectMatchesEnvironment: vi.fn(() => {
        throw new Error("VEREXA-ENV-001 test: simulated environment mismatch");
      }),
      getEdgeAppEnvironment: vi.fn(() => "staging"),
    }));

    const { NextRequest } = await import("next/server");
    const { updateSession } = await import("@/lib/supabase/middleware");

    const request = new NextRequest("https://app.example.test/dashboard");

    // If the mismatch were (incorrectly) checked inside the try/catch, this
    // would resolve to a NextResponse (the "never throw" fallback) instead
    // of rejecting -- that's exactly the regression this test guards against.
    await expect(updateSession(request)).rejects.toThrow("VEREXA-ENV-001 test: simulated environment mismatch");

    vi.doUnmock("@/lib/supabaseEnvIsolation");
  });
});
