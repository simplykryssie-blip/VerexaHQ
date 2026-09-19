import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

// Regression guard for the least-privilege SECURITY DEFINER cleanup
// (supabase/migrations/20261031000000_least_privilege_security_definer_cleanup.sql).
// Connects with the real anon key -- exactly the role PostgREST uses for an
// unauthenticated request -- against a live project, so this is the only way
// to actually verify a GRANT/REVOKE took effect (there is nothing to mock:
// the behavior under test is Postgres's own privilege system, not app code).
//
// Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the
// environment, pointed at an isolated test project (never production) -- see
// .env.local.example. If either is missing, this suite fails loudly rather
// than skipping: a silently-skipped privilege suite is a false green in CI,
// which is worse than no suite at all. Matches tests/critical-paths.test.ts's
// own convention for exactly this reason.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const canRun = Boolean(supabaseUrl && anonKey);

function requireEnv() {
  if (!canRun) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. " +
        "This suite requires an isolated Supabase test project to run against -- " +
        "set both env vars (see .env.local.example) rather than letting this skip silently."
    );
  }
}

// A permission-denied RPC call surfaces as a PostgREST 42501 error -- the
// anon-key equivalent of "this function exists but you may not call it",
// as opposed to a 42883 "function does not exist" (wrong name/signature) or
// a domain error surfaced by the function's own body (wrong argument value).
// Asserting on the code, not just "error is truthy", is what actually proves
// the REVOKE took effect rather than the call merely failing some other way.
function expectPermissionDenied(error: { code?: string; message?: string } | null) {
  expect(error).not.toBeNull();
  expect(error?.code).toBe("42501");
}

describe("least-privilege SECURITY DEFINER cleanup -- anon-key behavior", () => {
  describe("A/B/C. Public website, public organizer, and engagement-letter workflows remain anon-callable", () => {
    it("get_public_platform_plans still works for anon (no auth required to see pricing)", async () => {
      requireEnv();
      const supabase = createClient(supabaseUrl!, anonKey!);
      const { error } = await supabase.rpc("get_public_platform_plans");
      expect(error).toBeNull();
    });

    it("check_login_lockout still works for anon (called from the login page before any session exists)", async () => {
      requireEnv();
      const supabase = createClient(supabaseUrl!, anonKey!);
      const { error } = await supabase.rpc("check_login_lockout", { p_email: "nobody@example.com" });
      expect(error).toBeNull();
    });

    it("get_public_site_page still works for anon (the public marketing site itself)", async () => {
      requireEnv();
      const supabase = createClient(supabaseUrl!, anonKey!);
      const { error } = await supabase.rpc("get_public_site_page", { p_workspace_slug: "no-such-workspace", p_website_slug: "no-such-site", p_page_slug: "home" });
      // A real, permission-scoped null result for a nonexistent page -- not a 42501.
      expect(error).toBeNull();
    });
  });

  describe("D. Token signing -- a token-scoped RPC stays anon-callable regardless of token validity", () => {
    it("get_signature_request_by_token does not reject anon outright for an invalid/expired token", async () => {
      requireEnv();
      const supabase = createClient(supabaseUrl!, anonKey!);
      const { error } = await supabase.rpc("get_signature_request_by_token", { p_token: "00000000-0000-0000-0000-000000000000" });
      // The function itself is reachable; whether that specific token resolves
      // to a row is a separate, already-covered business-logic concern.
      expect(error === null || error.code !== "42501").toBe(true);
    });
  });

  describe("E/F. Internal workspace/CRM/network/admin/automation RPCs are no longer anon-callable", () => {
    it("search_clients is rejected for anon", async () => {
      requireEnv();
      const supabase = createClient(supabaseUrl!, anonKey!);
      const { error } = await supabase.rpc("search_clients", {
        p_workspace_id: "00000000-0000-0000-0000-000000000000",
        p_lifecycle_statuses: ["active"],
        p_limit: 1,
        p_offset: 0,
      });
      expectPermissionDenied(error as { code?: string } | null);
    });

    it("create_engagement is rejected for anon", async () => {
      requireEnv();
      const supabase = createClient(supabaseUrl!, anonKey!);
      const { error } = await supabase.rpc("create_engagement", {
        p_workspace_id: "00000000-0000-0000-0000-000000000000",
        p_client_id: "00000000-0000-0000-0000-000000000000",
        p_service_id: "00000000-0000-0000-0000-000000000000",
      });
      expectPermissionDenied(error as { code?: string } | null);
    });

    it("delete_workflow_pipeline is rejected for anon", async () => {
      requireEnv();
      const supabase = createClient(supabaseUrl!, anonKey!);
      const { error } = await supabase.rpc("delete_workflow_pipeline", { p_process_id: "00000000-0000-0000-0000-000000000000" });
      expectPermissionDenied(error as { code?: string } | null);
    });

    it("set_platform_ai_operator is rejected for anon", async () => {
      requireEnv();
      const supabase = createClient(supabaseUrl!, anonKey!);
      const { error } = await supabase.rpc("set_platform_ai_operator", { p_user_email: "nobody@example.com", p_is_platform_ai_operator: true });
      expectPermissionDenied(error as { code?: string } | null);
    });

    it("reveal_firm_caf is rejected for anon", async () => {
      requireEnv();
      const supabase = createClient(supabaseUrl!, anonKey!);
      const { error } = await supabase.rpc("reveal_firm_caf", { p_workspace_id: "00000000-0000-0000-0000-000000000000" });
      expectPermissionDenied(error as { code?: string } | null);
    });

    it("fire_invoice_paid_automations (a trigger-only function) is rejected for anon as a direct RPC call", async () => {
      requireEnv();
      const supabase = createClient(supabaseUrl!, anonKey!);
      const { error } = await supabase.rpc("fire_invoice_paid_automations");
      expectPermissionDenied(error as { code?: string } | null);
    });

    it("sync_client_primary_email (a trigger-only function) is rejected for anon as a direct RPC call", async () => {
      requireEnv();
      const supabase = createClient(supabaseUrl!, anonKey!);
      const { error } = await supabase.rpc("sync_client_primary_email");
      expectPermissionDenied(error as { code?: string } | null);
    });

    it("_maybe_enter_review (a private underscore-prefixed helper) is rejected for anon", async () => {
      requireEnv();
      const supabase = createClient(supabaseUrl!, anonKey!);
      const { error } = await supabase.rpc("_maybe_enter_review", { p_onboarding_id: "00000000-0000-0000-0000-000000000000" });
      expectPermissionDenied(error as { code?: string } | null);
    });
  });

  describe("I. RLS-policy-dependency helpers are NOT touched by this migration", () => {
    it("is_client_portal_window_active stays anon-executable (embedded in RLS policies evaluated for every role)", async () => {
      requireEnv();
      const supabase = createClient(supabaseUrl!, anonKey!);
      const { error } = await supabase.rpc("is_client_portal_window_active", { p_workspace_id: "00000000-0000-0000-0000-000000000000" });
      expect(error?.code).not.toBe("42501");
    });
  });

  describe("J. Five service-side tables reject direct anon access", () => {
    for (const table of ["rate_limit_hits", "workspace_ghl_connections", "workspace_jotform_connections", "workspace_partner_purchase_webhooks"] as const) {
      it(`${table} rejects a direct anon select`, async () => {
        requireEnv();
        const supabase = createClient(supabaseUrl!, anonKey!);
        const { error } = await supabase.from(table).select("*").limit(1);
        // RLS already default-denied rows here; after this migration the table
        // grant itself is gone too, so the failure mode is a permission error,
        // not merely an empty (but successful) result set.
        expect(error).not.toBeNull();
      });
    }

    it("appointment_external_events rejects a direct anon select (already had no anon grant before this migration)", async () => {
      requireEnv();
      const supabase = createClient(supabaseUrl!, anonKey!);
      const { error } = await supabase.from("appointment_external_events").select("*").limit(1);
      expect(error).not.toBeNull();
    });
  });
});
