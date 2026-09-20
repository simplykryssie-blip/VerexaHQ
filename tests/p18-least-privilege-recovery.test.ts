// Regression test for Migration Reconciliation Phase 1.8 (see migration
// p18_least_privilege_recovery_regression_tests). Runs the real SQL
// self-check RPC (test_p18_least_privilege_recovery) against a live
// Supabase project -- same pattern as tests/critical-paths.test.ts -- to
// prove the least-privilege state recovered in this phase (99 authenticated
// -only functions, 86 service_role-only internal functions, 4 tables with
// no client-role grants) remains represented. search_clients is
// deliberately excluded from the group-A check -- see the migration file's
// header for the known, already-live, out-of-scope exception discovered
// during this phase.
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(supabaseUrl && serviceRoleKey);

describe("Phase 1.8 least-privilege migration recovery", () => {
  it("keeps the recovered least-privilege ACL state intact", async () => {
    if (!canRun) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are not set. " +
          "This suite requires an isolated Supabase test project to run against -- " +
          "set both env vars (see .env.local.example) rather than letting this skip silently."
      );
    }

    const supabase = createClient(supabaseUrl!, serviceRoleKey!);
    const { data, error } = await supabase.rpc("test_p18_least_privilege_recovery");

    expect(error).toBeNull();
    expect(data).toBeTruthy();

    const failures = (data ?? []).filter((row: { passed: boolean }) => !row.passed);
    if (failures.length > 0) {
      throw new Error(`Phase 1.8 least-privilege checks failed:\n${JSON.stringify(failures, null, 2)}`);
    }

    expect((data ?? []).length).toBe(3);
  });
});
