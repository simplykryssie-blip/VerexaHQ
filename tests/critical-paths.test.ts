import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Exercises the 4 critical paths (auth/permissions, billing/payments,
// document upload + public e-signature link, portal access isolation)
// against a real, live Supabase project via run_critical_path_smoke_tests()
// (see migration critical_path_smoke_tests_fix_role) -- that RPC creates its
// own fixtures and cleans them up, so this is safe to run repeatedly.
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
// environment (the same service-role key the app's webhook/cron routes use
// -- see .env.local.example). Neither is present in this dev container, so
// the suite skips with a clear message rather than failing hard; set both
// in CI or a local .env.local to actually run it.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(supabaseUrl && serviceRoleKey);

describe.skipIf(!canRun)("critical path smoke tests", () => {
  it("passes every critical-path check the backend certifies", async () => {
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

if (!canRun) {
  describe("critical path smoke tests", () => {
    it.skip("skipped: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run against the live database", () => {});
  });
}
