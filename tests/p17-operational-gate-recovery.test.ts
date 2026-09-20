// Regression test for Migration Reconciliation Phase 1.7 (see migration
// p17_operational_gate_recovery_regression_tests). Runs the real SQL
// self-check RPC (test_p17_operational_gate_recovery) against a live
// Supabase project -- same pattern as tests/critical-paths.test.ts -- to
// prove the operational-gate property recovered in Phase 1.7 (batches 1-5
// + the RLS-policies batch, six recovered migration files) remains
// represented in production.
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(supabaseUrl && serviceRoleKey);

describe("Phase 1.7 operational-gate migration recovery", () => {
  it("keeps the recovered operational-gate security properties intact", async () => {
    if (!canRun) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are not set. " +
          "This suite requires an isolated Supabase test project to run against -- " +
          "set both env vars (see .env.local.example) rather than letting this skip silently."
      );
    }

    const supabase = createClient(supabaseUrl!, serviceRoleKey!);
    const { data, error } = await supabase.rpc("test_p17_operational_gate_recovery");

    expect(error).toBeNull();
    expect(data).toBeTruthy();

    const failures = (data ?? []).filter((row: { passed: boolean }) => !row.passed);
    if (failures.length > 0) {
      throw new Error(`Phase 1.7 operational-gate checks failed:\n${JSON.stringify(failures, null, 2)}`);
    }

    expect((data ?? []).length).toBe(2);
  });
});
