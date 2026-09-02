import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Exercises the 4 critical paths (auth/permissions, billing/payments,
// document upload + public e-signature link, portal access isolation)
// against a real, live Supabase project via run_critical_path_smoke_tests()
// (see migration critical_path_smoke_tests_fix_role) -- that RPC creates its
// own fixtures and cleans them up, so this is safe to run repeatedly.
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
// environment, pointed at an isolated test project (never production) --
// see .env.local.example. If either is missing, this suite fails loudly
// rather than skipping: a silently-skipped critical-path suite is a false
// green in CI, which is worse than no suite at all.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(supabaseUrl && serviceRoleKey);

describe("critical path smoke tests", () => {
  it("passes every critical-path check the backend certifies", async () => {
    if (!canRun) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are not set. " +
          "This suite requires an isolated Supabase test project to run against -- " +
          "set both env vars (see .env.local.example) rather than letting this skip silently."
      );
    }

    const supabase = createClient(supabaseUrl!, serviceRoleKey!);
    const { data, error } = await supabase.rpc("run_critical_path_smoke_tests");

    expect(error).toBeNull();
    expect(data).toBeTruthy();

    const failures = (data ?? []).filter((row: { passed: boolean }) => !row.passed);
    if (failures.length > 0) {
      throw new Error(`Critical-path checks failed:\n${JSON.stringify(failures, null, 2)}`);
    }

    expect((data ?? []).length).toBeGreaterThan(0);
  });
});
