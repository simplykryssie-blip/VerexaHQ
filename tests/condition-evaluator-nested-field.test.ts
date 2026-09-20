// Regression test for the automation condition evaluator's nested-field
// fallback (see migration partner_purchase_stripe_mapping_and_purpose,
// section 4). Runs the real SQL self-check RPC
// (test_condition_evaluator_nested_field_resolution) against a live
// Supabase project -- same pattern as tests/critical-paths.test.ts -- rather
// than reimplementing the condition evaluator's logic in TypeScript, which
// would test a reimplementation instead of the actual PL/pgSQL fix.
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(supabaseUrl && serviceRoleKey);

describe("automation condition evaluator: nested-field resolution", () => {
  it("resolves package_purchase.package_name whether the context nests it as an object or stores it as a flat literal-dotted key", async () => {
    if (!canRun) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are not set. " +
          "This suite requires an isolated Supabase test project to run against -- " +
          "set both env vars (see .env.local.example) rather than letting this skip silently."
      );
    }

    const supabase = createClient(supabaseUrl!, serviceRoleKey!);
    const { data, error } = await supabase.rpc("test_condition_evaluator_nested_field_resolution");

    expect(error).toBeNull();
    expect(data).toBeTruthy();

    const failures = (data ?? []).filter((row: { passed: boolean }) => !row.passed);
    if (failures.length > 0) {
      throw new Error(`Condition evaluator nested-field checks failed:\n${JSON.stringify(failures, null, 2)}`);
    }

    expect((data ?? []).length).toBe(5);
  });
});
