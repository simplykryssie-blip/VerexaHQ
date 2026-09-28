// Regression coverage for VEREXAHQ -- CONTACTS COMPLETION PASS, Phase 6
// (GHL import automation guard, Contacts Reconciliation Audit item #9).
// import-contacts/route.ts already pauses automations-table rows
// (PAUSE_TRIGGER_TYPES) for lead.created/client.tag_added during an import
// run, but that mechanism only touches the automations table -- it had no
// effect on trg_auto_start_lead_pipeline_on_create, a DB-level AFTER INSERT
// trigger that unconditionally drops every new lead-status client onto the
// workspace's default lead pipeline. Fixed with a transaction-local GUC
// (app.suppress_lead_pipeline_autostart) set by a new
// create_client_from_ghl_import wrapper, so create_client itself and every
// other caller of it are completely unaffected.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("app/api/ghl/import-contacts/route.ts -- automation guard wiring", () => {
  const source = readFileSync(join(repoRoot, "app/api/ghl/import-contacts/route.ts"), "utf8");

  it("creates clients via create_client_from_ghl_import, not the plain create_client RPC", () => {
    expect(source).toMatch(/supabase\.rpc\("create_client_from_ghl_import"/);
    expect(source).not.toMatch(/supabase\.rpc\("create_client",/);
  });

  it("still pauses automations-table rows for the run (PAUSE_TRIGGER_TYPES) -- the two mechanisms are complementary, not a replacement for each other", () => {
    expect(source).toMatch(/PAUSE_TRIGGER_TYPES = \["lead\.created", "client\.tag_added"\]/);
    expect(source).toMatch(/body\.phase === "start"/);
    expect(source).toMatch(/body\.phase === "finish"/);
  });

  it("passes through the same client fields create_client itself expects -- no field added or dropped by switching RPCs", () => {
    const callStart = source.indexOf('supabase.rpc("create_client_from_ghl_import"');
    const callEnd = source.indexOf("});", callStart);
    const call = source.slice(callStart, callEnd);
    for (const field of [
      "p_workspace_id",
      "p_client_type",
      "p_first_name",
      "p_last_name",
      "p_business_name",
      "p_primary_email",
      "p_primary_phone",
      "p_force_create",
    ]) {
      expect(call).toContain(field);
    }
  });
});

describe("ghl_import_lead_pipeline_guard migration -- shape invariants", () => {
  const source = readFileSync(
    join(repoRoot, "supabase/migrations/20261031040000_ghl_import_lead_pipeline_guard.sql"),
    "utf8"
  );

  it("never drops create_client or changes its signature -- every other caller is unaffected", () => {
    // The migration's own comments explain *why* DROP FUNCTION was
    // avoided (mentioning the phrase in prose), so this checks for an
    // actual uncommented DDL statement, not the word appearing at all.
    expect(source).not.toMatch(/^\s*drop function/im);
    expect(source).not.toMatch(/^create or replace function public\.create_client\(/m);
  });

  it("the trigger function keeps its existing zero-arg trigger signature (safe under CREATE OR REPLACE)", () => {
    expect(source).toMatch(/create or replace function public\.auto_start_lead_pipeline_on_create\(\)\s*\nreturns trigger/);
  });

  it("the trigger function checks the suppression GUC before doing anything else", () => {
    const fnStart = source.indexOf("function public.auto_start_lead_pipeline_on_create()");
    const guardIndex = source.indexOf("current_setting('app.suppress_lead_pipeline_autostart'", fnStart);
    const lifecycleCheckIndex = source.indexOf("new.lifecycle_status <> 'lead'", fnStart);
    expect(guardIndex).toBeGreaterThan(fnStart);
    expect(lifecycleCheckIndex).toBeGreaterThan(guardIndex);
  });

  it("create_client_from_ghl_import sets the GUC transaction-locally (is_local = true) so it can never leak across statements", () => {
    expect(source).toMatch(/set_config\('app\.suppress_lead_pipeline_autostart', 'true', true\)/);
  });

  it("create_client_from_ghl_import has the identical parameter list to create_client, so it's a drop-in replacement at the call site", () => {
    const wrapperStart = source.indexOf("function public.create_client_from_ghl_import(");
    const wrapperParams = source.slice(wrapperStart, source.indexOf(")", source.indexOf("returns jsonb", wrapperStart)));
    for (const param of [
      "p_workspace_id uuid",
      "p_client_type text",
      "p_first_name text default null",
      "p_last_name text default null",
      "p_business_name text default null",
      "p_date_of_birth date default null",
      "p_primary_email text default null",
      "p_primary_phone text default null",
      "p_ssn text default null",
      "p_ein text default null",
      "p_itin text default null",
      "p_force_create boolean default false",
    ]) {
      expect(wrapperParams).toContain(param);
    }
  });
});
