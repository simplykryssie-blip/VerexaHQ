// Guards against the exact class of migration-discipline regression that
// produced two confirmed vulnerabilities in this project: a SECURITY
// DEFINER function (bypasses RLS) that ends up authenticated- or
// anon-executable, mutates data, accepts a workspace/resource identifier,
// and has no internal authorization check -- provision_phone_number_record/
// bill_and_pause_phone_numbers (a missed revoke of a default grant) and
// resolve_organizer_response_service (a deliberate-but-unnecessary grant,
// SD-1). See supabase/migrations/20260925000000_database_contract_guard.sql
// for the read-only introspection RPC this pulls facts from, and
// lib/databaseContractGuard.ts for the policy/comparison logic against
// tests/fixtures/database-contract-baseline.json.
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
// environment, pointed at an isolated test project (never production) --
// see .env.local.example. If either is missing, this suite fails loudly
// rather than skipping, matching tests/critical-paths.test.ts's own
// reasoning: a silently-skipped guard is a false green in CI.
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { evaluateContractGuard, type ContractGuardBaseline, type ContractGuardRow } from "@/lib/databaseContractGuard";
import baselineJson from "./fixtures/database-contract-baseline.json";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(supabaseUrl && serviceRoleKey);

const baseline = baselineJson as unknown as ContractGuardBaseline;

function row(overrides: Partial<ContractGuardRow>): ContractGuardRow {
  return {
    function_name: "example_fn",
    args: "p_workspace_id uuid",
    overload_count: 1,
    is_security_definer: true,
    authenticated_exec: false,
    anon_exec: false,
    service_role_exec: true,
    is_mutation: true,
    has_identifier_arg: true,
    has_recognized_auth: false,
    has_token_lookup: false,
    ...overrides,
  };
}

describe("database contract guard -- live database", () => {
  it("has no unreviewed authorization drift on the tracked SECURITY DEFINER surface", async () => {
    if (!canRun) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are not set. " +
          "This guard requires an isolated Supabase test project to run against -- " +
          "set both env vars (see .env.local.example) rather than letting this skip silently."
      );
    }

    const supabase = createClient(supabaseUrl!, serviceRoleKey!);
    const alwaysInclude = [...baseline.serviceOnlyFunctions.names, ...Object.keys(baseline.trackedSignatures.functions)];

    const { data, error } = await supabase.rpc("run_database_contract_guard", { p_always_include: alwaysInclude });
    expect(error).toBeNull();

    const rows = (data ?? []) as ContractGuardRow[];
    const result = evaluateContractGuard(rows, baseline);

    if (result.reviews.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        "DATABASE CONTRACT CHECK -- review required (not blocking):\n" +
          result.reviews.map((r) => `- [${r.functionName}] ${r.message}`).join("\n")
      );
    }

    if (result.failures.length > 0) {
      throw new Error(
        "DATABASE CONTRACT CHECK FAILED:\n" + result.failures.map((f) => `- [${f.functionName}] ${f.message}`).join("\n")
      );
    }
  });
});

describe("database contract guard -- rule logic (synthetic rows, no live database)", () => {
  it("1. safe existing function: authenticated + mutation + identifier + recognized auth -> no findings", () => {
    const rows = [
      row({
        function_name: "claim_pending_paid_seat",
        args: "p_workspace_id uuid",
        authenticated_exec: true,
        has_recognized_auth: true,
      }),
    ];
    const result = evaluateContractGuard(rows, baseline);
    expect(result.failures).toHaveLength(0);
  });

  it("2. expected grant change: a service-only function correctly shows no authenticated/anon EXECUTE -> no findings", () => {
    const rows = [
      row({
        function_name: "resolve_organizer_response_service",
        args: "p_response_id uuid",
        authenticated_exec: false,
        anon_exec: false,
        has_identifier_arg: false,
      }),
    ];
    const result = evaluateContractGuard(rows, baseline);
    expect(result.failures).toHaveLength(0);
  });

  it("3. unexpected authenticated EXECUTE on a service-only function -> hard failure", () => {
    const rows = [
      row({
        function_name: "provision_phone_number_record",
        args: "p_workspace_id uuid, p_phone_number text, p_twilio_sid text",
        authenticated_exec: true,
      }),
    ];
    const result = evaluateContractGuard(rows, baseline);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures[0].functionName).toBe("provision_phone_number_record");
    expect(result.failures[0].message).toMatch(/authenticated/i);
  });

  it("4. unexpected anon EXECUTE on a service-only function -> hard failure", () => {
    const rows = [
      row({
        function_name: "bill_and_pause_phone_numbers",
        args: "p_workspace_id uuid",
        anon_exec: true,
      }),
    ];
    const result = evaluateContractGuard(rows, baseline);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures[0].message).toMatch(/anon/i);
  });

  it("5. new overload on a function with no accepted overload -> hard failure", () => {
    const rows = [
      row({ function_name: "archive_client", args: "p_client_id uuid", overload_count: 2, authenticated_exec: true, has_recognized_auth: true }),
    ];
    const result = evaluateContractGuard(rows, baseline);
    expect(result.failures.some((f) => f.functionName === "archive_client")).toBe(true);
  });

  it("5b. the already-accepted overload does not itself trigger a failure", () => {
    const rows = [
      row({
        function_name: "_get_or_create_partner_onboarding",
        args: "p_workspace_id uuid, p_firm_connection_id uuid, p_package_id uuid, p_firm_package_purchase_id uuid, p_partner_prospect_id uuid",
        overload_count: 2,
        authenticated_exec: false,
      }),
    ];
    const result = evaluateContractGuard(rows, baseline);
    expect(result.failures).toHaveLength(0);
  });

  it("6. signature change on a tracked function -> review required, not a hard failure", () => {
    const rows = [
      row({
        function_name: "release_paid_seat",
        args: "p_workspace_id uuid, p_seat_id uuid, p_reason text", // extra param vs. baseline
        authenticated_exec: true,
        has_recognized_auth: true,
      }),
    ];
    const result = evaluateContractGuard(rows, baseline);
    expect(result.failures).toHaveLength(0);
    expect(result.reviews.some((r) => r.functionName === "release_paid_seat")).toBe(true);
  });

  it("6b. SECURITY DEFINER flipping to INVOKER on a tracked function -> hard failure, not just review", () => {
    const rows = [
      row({
        function_name: "set_platform_admin",
        args: "p_user_email text, p_is_platform_admin boolean",
        authenticated_exec: true,
        has_recognized_auth: true,
        is_security_definer: false,
      }),
    ];
    const result = evaluateContractGuard(rows, baseline);
    expect(result.failures.some((f) => f.functionName === "set_platform_admin")).toBe(true);
  });

  it("7. SECURITY DEFINER mutation function, authenticated, identifier arg, no recognized auth -> hard failure (the phone-number/SD-1 shape)", () => {
    const rows = [
      row({
        function_name: "totally_new_workspace_rpc",
        args: "p_workspace_id uuid, p_amount numeric",
        authenticated_exec: true,
        is_mutation: true,
        has_identifier_arg: true,
        has_recognized_auth: false,
        has_token_lookup: false,
      }),
    ];
    const result = evaluateContractGuard(rows, baseline);
    expect(result.failures.some((f) => f.functionName === "totally_new_workspace_rpc")).toBe(true);
  });

  it("8. legitimate public token-based function is not treated as vulnerable", () => {
    const rows = [
      row({
        function_name: "sign_public_engagement_letter",
        args: "p_token uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_typed_name text, p_signature_type text, p_signature_image_path text",
        authenticated_exec: false,
        anon_exec: true,
        is_mutation: true,
        has_identifier_arg: true,
        has_recognized_auth: false,
        has_token_lookup: true, // the token-row-lookup heuristic caught it
      }),
      row({
        // exercises the acceptedPublicFunctions allowlist path (neither heuristic fires)
        function_name: "capture_public_lead_from_site_page",
        args: "p_page_id uuid, p_section_id uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_service_ids uuid[]",
        anon_exec: true,
        has_identifier_arg: true,
        has_recognized_auth: false,
        has_token_lookup: false,
      }),
    ];
    const result = evaluateContractGuard(rows, baseline);
    expect(result.failures).toHaveLength(0);
  });
});
