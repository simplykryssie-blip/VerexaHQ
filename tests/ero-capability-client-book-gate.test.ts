// Phase 3.2 security gate: Service Bureau + ERO capability client/engagement
// creation gate. Closes the RLS/RPC gap found in the Phase 3.2 security-gate
// audit -- clients had no INSERT policy at all (RLS already denied direct
// PostgREST inserts for every workspace type), and neither engagements_insert
// nor the six SECURITY DEFINER functions that create clients/engagements ever
// checked workspace_type, so a plain service_bureau workspace could operate
// an ERO client/engagement book through these RPCs with nothing to stop it
// (Doucet Financial Group did, with 2,005 real client rows, before this
// migration).
//
// INSERT-only by design: a service_bureau workspace with
// ero_capability_enabled=false is blocked from CREATING new clients/
// engagements, but every existing row it already has remains exactly as
// readable/editable as before, under its normal permissions.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  join(repoRoot, "supabase/migrations/20261102000000_ero_capability_client_book_gate.sql"),
  "utf8"
);

describe("ero_capability_enabled column", () => {
  it("is additive: boolean, not null, default false", () => {
    expect(source).toMatch(/add column ero_capability_enabled boolean not null default false/);
  });
});

describe("can_operate_client_book() helper", () => {
  it("returns true unconditionally for any workspace_type other than service_bureau", () => {
    const fnStart = source.indexOf("function public.can_operate_client_book(");
    const fnBody = source.slice(fnStart, source.indexOf("$$;", fnStart));
    expect(fnBody).toMatch(/workspace_type\s*<>\s*'service_bureau'\s*or\s*w\.ero_capability_enabled/);
  });

  it("is SECURITY DEFINER so it can be safely reused inside RLS policies and other SECURITY DEFINER functions", () => {
    const fnStart = source.indexOf("function public.can_operate_client_book(");
    const fnHeader = source.slice(fnStart, source.indexOf("as $$", fnStart));
    expect(fnHeader).toMatch(/security definer/);
  });
});

describe("RLS: exactly two INSERT policies changed, nothing else", () => {
  it("adds a new clients_insert policy (none existed before) requiring clients.create + operational + capability", () => {
    const policyStart = source.indexOf("create policy clients_insert");
    const policyBody = source.slice(policyStart, source.indexOf(");", policyStart));
    expect(policyBody).toContain("has_permission(workspace_id, 'clients.create')");
    expect(policyBody).toContain("is_workspace_operational(workspace_id)");
    expect(policyBody).toContain("public.can_operate_client_book(workspace_id)");
  });

  it("amends engagements_insert via ALTER POLICY, preserving the existing engagements.manage check", () => {
    const policyStart = source.indexOf("alter policy engagements_insert");
    const policyBody = source.slice(policyStart, source.indexOf(");", policyStart));
    expect(policyBody).toContain("has_permission(workspace_id, 'engagements.manage')");
    expect(policyBody).toContain("is_workspace_operational(workspace_id)");
    expect(policyBody).toContain("public.can_operate_client_book(workspace_id)");
  });

  it("never touches clients_select/update/delete or engagements_select/update/delete -- existing rows stay governed by their normal permissions regardless of the flag", () => {
    expect(source).not.toMatch(/create policy clients_select/);
    expect(source).not.toMatch(/alter policy clients_select/);
    expect(source).not.toMatch(/create policy clients_update/);
    expect(source).not.toMatch(/alter policy clients_update/);
    expect(source).not.toMatch(/create policy clients_delete/);
    expect(source).not.toMatch(/alter policy clients_delete/);
    expect(source).not.toMatch(/create policy engagements_select/);
    expect(source).not.toMatch(/alter policy engagements_select/);
    expect(source).not.toMatch(/create policy engagements_update/);
    expect(source).not.toMatch(/alter policy engagements_update/);
    expect(source).not.toMatch(/create policy engagements_delete/);
    expect(source).not.toMatch(/alter policy engagements_delete/);
  });

  it("never modifies the shared authorization primitives every other workspace type depends on", () => {
    expect(source).not.toMatch(/create or replace function public\.has_permission\(/i);
    expect(source).not.toMatch(/create or replace function public\.is_workspace_member\(/i);
    expect(source).not.toMatch(/create or replace function public\.is_workspace_operational\(/i);
  });
});

describe("the six modified RPCs each gain exactly one new check, positioned correctly", () => {
  it("create_client: check added after the existing clients.create + operational checks, before the duplicate-match lookup", () => {
    const fnStart = source.indexOf("FUNCTION public.create_client(");
    const fnBody = source.slice(fnStart, source.indexOf("$function$;", fnStart));
    const permIdx = fnBody.indexOf("has_permission(p_workspace_id, 'clients.create')");
    const opIdx = fnBody.indexOf("is_workspace_operational(p_workspace_id)");
    const capIdx = fnBody.indexOf("can_operate_client_book(p_workspace_id)");
    const dupIdx = fnBody.indexOf("p_client_type not in");
    expect(permIdx).toBeGreaterThan(-1);
    expect(capIdx).toBeGreaterThan(opIdx);
    expect(dupIdx).toBeGreaterThan(capIdx);
  });

  it("create_engagement: check added after the existing engagements.manage + operational checks, before service/process resolution", () => {
    const fnStart = source.indexOf("FUNCTION public.create_engagement(");
    const fnBody = source.slice(fnStart, source.indexOf("$function$;", fnStart));
    const opIdx = fnBody.indexOf("is_workspace_operational(p_workspace_id)");
    const capIdx = fnBody.indexOf("can_operate_client_book(p_workspace_id)");
    const serviceIdx = fnBody.indexOf("if p_service_id is not null then");
    expect(capIdx).toBeGreaterThan(opIdx);
    expect(serviceIdx).toBeGreaterThan(capIdx);
  });

  it("find_or_create_public_lead: check added right after the operational check, before the dedupe lookup -- this is the shared choke point for both unauthenticated public-capture wrappers", () => {
    const fnStart = source.indexOf("FUNCTION public.find_or_create_public_lead(");
    const fnBody = source.slice(fnStart, source.indexOf("$function$;", fnStart));
    const opIdx = fnBody.indexOf("is_workspace_operational(p_workspace_id)");
    const capIdx = fnBody.indexOf("can_operate_client_book(p_workspace_id)");
    const dedupeIdx = fnBody.indexOf("select id into v_client_id");
    expect(capIdx).toBeGreaterThan(opIdx);
    expect(dedupeIdx).toBeGreaterThan(capIdx);
  });

  it("accept_quote: check guards only the engagement-insert branch, keyed on the quote's own workspace_id, not the top-level function entry", () => {
    const fnStart = source.indexOf("FUNCTION public.accept_quote(");
    const fnBody = source.slice(fnStart, source.indexOf("$function$;", fnStart));
    const capIdx = fnBody.indexOf("can_operate_client_book(v_quote.workspace_id)");
    const caseTypeIdx = fnBody.indexOf("v_case_type := case v_category_slug");
    const engagementInsertIdx = fnBody.indexOf("insert into public.engagements");
    const invoiceInsertIdx = fnBody.indexOf("insert into public.invoices");
    expect(capIdx).toBeGreaterThan(caseTypeIdx);
    expect(engagementInsertIdx).toBeGreaterThan(capIdx);
    // The invoice insert (unconditional in this function) is never gated --
    // only engagement creation is.
    expect(invoiceInsertIdx).toBeGreaterThan(engagementInsertIdx);
  });

  it("copy_shared_engagement: check added after the approved-status check, keyed on the *receiving* workspace, before either the client or engagement copy", () => {
    const fnStart = source.indexOf("FUNCTION public.copy_shared_engagement(");
    const fnBody = source.slice(fnStart, source.indexOf("$function$;", fnStart));
    const statusIdx = fnBody.indexOf("v_share.status <> 'approved'");
    const capIdx = fnBody.indexOf("can_operate_client_book(v_share.shared_with_workspace_id)");
    const clientInsertIdx = fnBody.indexOf("insert into public.clients select");
    const engagementInsertIdx = fnBody.indexOf("insert into public.engagements select");
    expect(capIdx).toBeGreaterThan(statusIdx);
    expect(clientInsertIdx).toBeGreaterThan(capIdx);
    expect(engagementInsertIdx).toBeGreaterThan(capIdx);
  });

  it("execute_automation_step: gains exactly two checks, one per action branch (create_engagement, create_client), each positioned immediately before its insert", () => {
    const fnStart = source.indexOf("FUNCTION public.execute_automation_step(");
    const fnBody = source.slice(fnStart, source.indexOf("$function$;", fnStart));
    const occurrences = fnBody.split("can_operate_client_book(v_run.workspace_id)").length - 1;
    expect(occurrences).toBe(2);

    const createEngagementBranch = fnBody.indexOf("action_type = 'create_engagement' then");
    const firstCapIdx = fnBody.indexOf("can_operate_client_book(v_run.workspace_id)", createEngagementBranch);
    const engagementInsertIdx = fnBody.indexOf("insert into public.engagements (workspace_id, client_id, service_id)", createEngagementBranch);
    expect(firstCapIdx).toBeGreaterThan(createEngagementBranch);
    expect(engagementInsertIdx).toBeGreaterThan(firstCapIdx);

    const createClientBranch = fnBody.indexOf("action_type = 'create_client' then");
    const nullCheckIdx = fnBody.indexOf("if v_new_client_id is null then", createClientBranch);
    const secondCapIdx = fnBody.indexOf("can_operate_client_book(v_run.workspace_id)", nullCheckIdx);
    const clientInsertIdx = fnBody.indexOf("insert into public.clients (workspace_id, client_type, first_name", nullCheckIdx);
    expect(secondCapIdx).toBeGreaterThan(nullCheckIdx);
    expect(clientInsertIdx).toBeGreaterThan(secondCapIdx);
  });
});

describe("transitively-protected functions are NOT modified by this migration", () => {
  it("never redefines create_client_from_ghl_import, capture_public_lead_from_contact_step, or capture_public_mkb_business_inquiry -- they inherit the gate through create_client / find_or_create_public_lead", () => {
    expect(source).not.toMatch(/create or replace function public\.create_client_from_ghl_import\(/i);
    expect(source).not.toMatch(/create or replace function public\.capture_public_lead_from_contact_step\(/i);
    expect(source).not.toMatch(/create or replace function public\.capture_public_mkb_business_inquiry\(/i);
  });
});

describe("Doucet Financial Group backfill", () => {
  it("backfills ero_capability_enabled=true for exactly the known Doucet workspace id, scoped to service_bureau", () => {
    const backfillStart = source.indexOf("update public.workspaces\nset ero_capability_enabled = true");
    const backfillBody = source.slice(backfillStart, source.indexOf(";", backfillStart) + 1);
    expect(backfillBody).toContain("0867bbc5-e62b-4217-8bad-11351c24def5");
    expect(backfillBody).toContain("workspace_type = 'service_bureau'");
  });

  it("is the only UPDATE statement in the migration -- no other workspace row is touched by the backfill", () => {
    const updateStatements = source.match(/^update /gim) ?? [];
    expect(updateStatements.length).toBe(1);
  });
});
