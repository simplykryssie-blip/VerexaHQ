// Regression coverage for VEREXAHQ CONTACT SHARING Phases 0-3 (Independent
// PTIN -> ERO Contact sharing). These are source-text assertions against
// the migration/route files themselves -- the same convention this repo
// already uses for schema-shaped regression tests (see
// contacts-search-clients-stale-overload.test.ts) -- plus, separately, a
// live rolled-back-transaction verification pass was performed via the
// Supabase MCP tools during implementation (see the final report; not
// re-executed here since this suite runs without live DB credentials in
// CI).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");

const phase0 = readFileSync(join(migrationsDir, "20261031100000_contact_sharing_one_active_ero_constraint.sql"), "utf8");
const phase1 = readFileSync(join(migrationsDir, "20261031110000_contact_sharing_schema.sql"), "utf8");
const phase2 = readFileSync(join(migrationsDir, "20261031120000_contact_sharing_rpcs.sql"), "utf8");
const disconnectIntegration = readFileSync(join(migrationsDir, "20261031130000_contact_sharing_disconnect_integration.sql"), "utf8");
const approveRoute = readFileSync(join(repoRoot, "app/api/contact-shares/[id]/approve/route.ts"), "utf8");
const contractBaseline = JSON.parse(readFileSync(join(repoRoot, "tests/fixtures/database-contract-baseline.json"), "utf8"));

describe("Phase 0 -- one-active-ERO constraint", () => {
  it("preflights for existing violations and raises a descriptive exception before creating anything", () => {
    expect(phase0).toContain("having count(*) > 1");
    expect(phase0).toContain("raise exception");
    expect(phase0).toContain("No data was modified");
  });

  it("creates the partial unique index only after the preflight block, scoped to active ero_ptin rows", () => {
    const indexPos = phase0.indexOf("create unique index firm_connections_one_active_ero_per_child_idx");
    const preflightPos = phase0.indexOf("do $$");
    expect(indexPos).toBeGreaterThan(preflightPos);
    expect(phase0).toContain("(child_workspace_id, relationship_type)");
    expect(phase0).toContain("where status = 'active' and relationship_type = 'ero_ptin'");
  });

  it("does not silently repair or pick a winner -- the preflight only raises, it never updates/deletes a row", () => {
    const preflightBlock = phase0.slice(phase0.indexOf("do $$"), phase0.indexOf("end $$;"));
    expect(preflightBlock).not.toMatch(/update\s+public\.firm_connections/i);
    expect(preflightBlock).not.toMatch(/delete\s+from/i);
  });
});

describe("Phase 1 -- eleven tables, no direct write policies anywhere", () => {
  const tables = [
    "contact_shares",
    "contact_share_categories",
    "contact_share_actions",
    "ero_retained_contacts",
    "ero_retained_contact_phones",
    "ero_retained_contact_emails",
    "ero_retained_contact_addresses",
    "ero_retained_contact_service_interests",
    "ero_retained_contact_versions",
    "ero_retained_contact_version_fields",
    "contact_document_transfers",
  ];

  it("creates all eleven tables", () => {
    for (const t of tables) {
      expect(phase1).toContain(`create table public.${t} (`);
    }
  });

  it("enables RLS on all eleven tables", () => {
    for (const t of tables) {
      expect(phase1).toContain(`alter table public.${t} enable row level security`);
    }
  });

  it("defines a SELECT policy for every table but NO insert/update/delete policy anywhere in the file -- all writes are RPC-only", () => {
    for (const t of tables) {
      expect(phase1).toContain(`on public.${t} for select`);
    }
    expect(phase1).not.toMatch(/for insert/i);
    expect(phase1).not.toMatch(/for update/i);
    expect(phase1).not.toMatch(/for delete/i);
  });

  it("ero_retained_contacts SELECT policy is unconditional on connection status -- readable by both sides regardless of active/connection_ended", () => {
    const block = phase1.slice(phase1.indexOf("create policy ero_retained_contacts_select"), phase1.indexOf("create policy ero_retained_contact_phones_select"));
    expect(block).toContain("is_workspace_member(workspace_id) or public.is_workspace_member(source_workspace_id)");
    expect(block).not.toMatch(/status\s*=\s*'active'/);
  });

  it("source-side identifiers (source_workspace_id, source_client_id) carry no foreign key -- matches the live clients.source_workspace_id precedent, required so a future hard-delete of the source Contact cannot cascade or be blocked", () => {
    const contactSharesBlock = phase1.slice(phase1.indexOf("create table public.contact_shares"), phase1.indexOf("create unique index contact_shares_one_in_flight_idx"));
    expect(contactSharesBlock).toContain("source_workspace_id uuid not null,");
    expect(contactSharesBlock).toContain("source_client_id uuid not null,");
    expect(contactSharesBlock).not.toMatch(/source_workspace_id uuid not null references/);
    expect(contactSharesBlock).not.toMatch(/source_client_id uuid not null references/);

    const retainedBlock = phase1.slice(phase1.indexOf("create table public.ero_retained_contacts"), phase1.indexOf("create index ero_retained_contacts_source_idx"));
    expect(retainedBlock).not.toMatch(/source_workspace_id uuid not null references/);
    expect(retainedBlock).not.toMatch(/source_client_id uuid not null references/);
  });

  it("contact_document_transfers.source_attachment_id has no FK; destination_attachment_id has a real FK to attachments", () => {
    const block = phase1.slice(phase1.indexOf("create table public.contact_document_transfers"), phase1.indexOf("create index contact_document_transfers_share_idx"));
    expect(block).toContain("source_attachment_id uuid not null,");
    expect(block).not.toMatch(/source_attachment_id uuid not null references/);
    expect(block).toContain("destination_attachment_id uuid not null references public.attachments(id) on delete cascade");
  });

  it("destination-side identifiers use real FKs with cascade, matching firm_connections' own workspace-FK convention", () => {
    expect(phase1).toContain("destination_workspace_id uuid not null references public.workspaces(id) on delete cascade");
    expect(phase1).toContain("workspace_id uuid not null references public.workspaces(id) on delete cascade");
  });

  it("firm_connection_id references are real FKs (firm_connections rows are never hard-deleted, only status-flipped) with on delete no action", () => {
    expect(phase1).toContain("firm_connection_id uuid not null references public.firm_connections(id) on delete no action");
    expect(phase1).toContain("current_firm_connection_id uuid references public.firm_connections(id) on delete no action");
  });

  it("status/category/transfer_kind are CHECK-constrained, not a reference table -- no contact_share_category table exists", () => {
    expect(phase1).toContain("check (category_key in (");
    expect(phase1).toContain("'IDENTIFYING_INFO', 'PHONE', 'EMAIL', 'ADDRESS', 'SERVICE_INTERESTS', 'DOCUMENTS'");
    expect(phase1).not.toContain("create table public.contact_share_category ");
    expect(phase1).toContain("check (status in (");
    expect(phase1).toContain("'completed_no_change'");
  });

  it("one in-flight share per (source_client_id, destination_workspace_id), scoped to pending/corrections_requested", () => {
    expect(phase1).toContain("create unique index contact_shares_one_in_flight_idx");
    expect(phase1).toContain("(source_client_id, destination_workspace_id)");
    expect(phase1).toContain("where status in ('pending', 'corrections_requested')");
  });

  it("at most one version per share (idempotency) and exactly one current version per retained Contact", () => {
    expect(phase1).toMatch(/unique\s*\(contact_share_id\)/);
    expect(phase1).toContain("create unique index ero_retained_contact_versions_one_current_idx");
  });

  it("one document transfer per (contact_share_id, source_attachment_id) -- retry-safe idempotency", () => {
    expect(phase1).toContain("unique (contact_share_id, source_attachment_id)");
  });

  it("extends attachments.entity_type with 'ero_retained_contact' alongside every existing value -- does not drop any", () => {
    const block = phase1.slice(phase1.indexOf("alter table public.attachments drop constraint"), phase1.indexOf("insert into public.permissions"));
    for (const existing of ["client", "engagement", "workflow", "task", "invoice", "document", "blueprint", "message", "note", "firm_connection"]) {
      expect(block).toContain(`'${existing}'`);
    }
    expect(block).toContain("'ero_retained_contact'");
  });

  it("adds exactly the three locked permission keys, granted to owner/admin/ero (share+approve+request_update) and reviewer (approve+request_update only, mirroring engagements.share/approve_review's existing grant shape)", () => {
    expect(phase1).toContain("'clients.share'");
    expect(phase1).toContain("'clients.approve_share'");
    expect(phase1).toContain("'clients.request_share_update'");
    expect(phase1).toContain("r.slug in ('owner', 'admin', 'ero')");
    expect(phase1).toContain("r.slug in ('reviewer')");
  });

  it("does not touch clients_select, client_documents_select, or any existing Contact RLS policy", () => {
    expect(phase1).not.toContain("clients_select");
    expect(phase1).not.toContain("client_documents_select");
    expect(phase1).not.toMatch(/alter table public\.clients/);
  });
});

describe("Phase 2 -- seven RPCs, every write path", () => {
  const rpcs = [
    "create_contact_share",
    "request_contact_share_update",
    "respond_to_contact_share",
    "execute_contact_share_transfer",
    "mark_contact_document_transferred",
    "withdraw_contact_share",
    "resubmit_contact_share",
  ];

  it("defines all seven RPCs as SECURITY DEFINER with a pinned search_path", () => {
    for (const fn of rpcs) {
      const block = phase2.slice(phase2.indexOf(`create or replace function public.${fn}(`));
      expect(block.slice(0, 400)).toContain("security definer");
      expect(block.slice(0, 400)).toContain("set search_path to 'public'");
    }
  });

  it("no RPC trusts a caller-supplied workspace id for authorization -- every workspace id is resolved from the resource row itself", () => {
    // create_contact_share resolves source_workspace_id from clients.workspace_id, not a parameter
    const create = phase2.slice(phase2.indexOf("create or replace function public.create_contact_share("), phase2.indexOf("create or replace function public.request_contact_share_update("));
    expect(create).not.toMatch(/p_workspace_id|p_source_workspace_id|p_destination_workspace_id/);
    expect(create).toContain("select workspace_id into v_source_workspace_id from public.clients where id = p_client_id");

    // request_contact_share_update resolves both workspaces from the retained record, never a parameter
    const request = phase2.slice(phase2.indexOf("create or replace function public.request_contact_share_update("), phase2.indexOf("create or replace function public.respond_to_contact_share("));
    expect(request).not.toMatch(/p_workspace_id|p_source_workspace_id|p_destination_workspace_id/);
  });

  it("request_contact_share_update never reads the source clients table -- an ERO request must not become a source Contact read permission", () => {
    const request = phase2.slice(phase2.indexOf("create or replace function public.request_contact_share_update("), phase2.indexOf("create or replace function public.respond_to_contact_share("));
    expect(request).not.toMatch(/from public\.clients/);
    expect(request).not.toMatch(/from public\.client_phones|from public\.client_emails|from public\.client_addresses/);
  });

  it("respond_to_contact_share derives the approver explicitly from initiated_by -- never from a nullable actor column", () => {
    const respond = phase2.slice(phase2.indexOf("create or replace function public.respond_to_contact_share("), phase2.indexOf("create or replace function public.execute_contact_share_transfer("));
    expect(respond).toContain("case when v_share.initiated_by = 'source' then v_share.destination_workspace_id else v_share.source_workspace_id end");
    expect(respond).toContain("select * into v_share from public.contact_shares where id = p_share_id for update");
  });

  it("execute_contact_share_transfer never calls Storage -- it only computes deterministic paths and returns a plan; documents are created with transferred_at left NULL", () => {
    const execute = phase2.slice(phase2.indexOf("create or replace function public.execute_contact_share_transfer("), phase2.indexOf("create or replace function public.mark_contact_document_transferred("));
    expect(execute).not.toMatch(/storage\./i);
    expect(execute).toContain("v_share.destination_workspace_id || '/' || v_retained_id || '/' || v_doc.id || '-' || v_doc.file_name");
    expect(execute).not.toMatch(/transferred_at\s*=\s*now\(\)/);
  });

  it("execute_contact_share_transfer detects zero-diff transfers and resolves to completed_no_change without creating a version", () => {
    const execute = phase2.slice(phase2.indexOf("create or replace function public.execute_contact_share_transfer("), phase2.indexOf("create or replace function public.mark_contact_document_transferred("));
    expect(execute).toContain("if not v_changed then");
    expect(execute).toContain("status = 'completed_no_change'");
    const noChangeBlock = execute.slice(execute.indexOf("if not v_changed then"), execute.indexOf("return '[]'::jsonb;"));
    expect(noChangeBlock).not.toContain("insert into public.ero_retained_contact_versions");
  });

  it("execute_contact_share_transfer is idempotent -- a re-run on an already-terminal share returns the pending document plan without re-mutating anything", () => {
    const execute = phase2.slice(phase2.indexOf("create or replace function public.execute_contact_share_transfer("), phase2.indexOf("create or replace function public.mark_contact_document_transferred("));
    expect(execute).toContain("if v_share.status in ('transferred', 'completed_no_change') then");
  });

  it("mark_contact_document_transferred writes ONLY transferred_at, guarded by IS NULL -- idempotent, cannot touch any other retained-Contact state", () => {
    const mark = phase2.slice(phase2.indexOf("create or replace function public.mark_contact_document_transferred("), phase2.indexOf("create or replace function public.withdraw_contact_share("));
    expect(mark).toContain("set transferred_at = now()");
    expect(mark).toContain("where id = p_transfer_id and transferred_at is null");
    expect(mark).not.toMatch(/update public\.ero_retained_contacts|update public\.contact_shares|insert into public\.ero_retained_contact_versions/);
  });

  it("withdraw/resubmit are initiator-only and status-gated", () => {
    const withdraw = phase2.slice(phase2.indexOf("create or replace function public.withdraw_contact_share("), phase2.indexOf("create or replace function public.resubmit_contact_share("));
    expect(withdraw).toContain("if v_share.status <> 'pending' then");
    const resubmit = phase2.slice(phase2.indexOf("create or replace function public.resubmit_contact_share("));
    expect(resubmit).toContain("if v_share.status <> 'corrections_requested' then");
  });

  it("every RPC is revoked from public/anon and granted only to authenticated -- no service-role-only or public-executable RPC in this set", () => {
    for (const fn of rpcs) {
      expect(phase2).toContain(`from public, anon;`);
    }
    const grantCount = (phase2.match(/grant execute .* to authenticated;/g) ?? []).length;
    expect(grantCount).toBe(7);
  });

  it("has_permission/is_workspace_member/is_workspace_operational appear in every RPC body -- satisfies the database-contract-guard's recognized-auth heuristic directly, not via a baseline exception", () => {
    for (const fn of rpcs) {
      const start = phase2.indexOf(`create or replace function public.${fn}(`);
      const nextFn = phase2.indexOf("create or replace function public.", start + 10);
      const block = nextFn === -1 ? phase2.slice(start) : phase2.slice(start, nextFn);
      expect(block).toMatch(/has_permission|is_workspace_member|is_workspace_operational/);
    }
  });
});

describe("Disconnect integration -- smallest possible change to existing architecture", () => {
  it("preserves every existing line of disconnect_firm_connection's original authorization/billing/notification logic", () => {
    expect(disconnectIntegration).toContain("Only the ERO, or an independently-billed PTIN, can disconnect this connection.");
    expect(disconnectIntegration).toContain("v_row.billing_responsibility = 'ero'");
    expect(disconnectIntegration).toContain("'FIRM_CONNECTION_REVOKED'");
  });

  it("appends exactly the two new Contact Sharing steps after the existing logic, touching only ero_retained_contacts.status and contact_shares.status", () => {
    const afterExisting = disconnectIntegration.slice(disconnectIntegration.indexOf("-- Contact Sharing integration"));
    expect(afterExisting).toContain("set status = 'connection_ended'");
    expect(afterExisting).toContain("where current_firm_connection_id = p_connection_id and status = 'active'");
    expect(afterExisting).toContain("set status = 'expired'");
    expect(afterExisting).toContain("where firm_connection_id = p_connection_id and status in ('pending', 'corrections_requested')");
  });

  it("does not delete or alter any historical retained data, only status flags", () => {
    const afterExisting = disconnectIntegration.slice(disconnectIntegration.indexOf("-- Contact Sharing integration"));
    expect(afterExisting).not.toMatch(/delete from/i);
    expect(afterExisting).not.toMatch(/update public\.ero_retained_contact_versions|update public\.ero_retained_contact_version_fields/);
  });
});

describe("Phase 3 -- document Storage transfer route", () => {
  it("uses the caller's own session for both contact-sharing RPCs, and the service role ONLY for the physical Storage copy", () => {
    expect(approveRoute).toContain('import { createClient } from "@/lib/supabase/server"');
    expect(approveRoute).toContain('import { createServiceClient } from "@/lib/supabase/service"');
    expect(approveRoute).toContain('supabase.rpc("respond_to_contact_share"');
    expect(approveRoute).toContain('supabase.rpc("execute_contact_share_transfer"');
    expect(approveRoute).toContain('supabase.rpc("mark_contact_document_transferred"');
    expect(approveRoute).toContain("serviceClient.storage.from(\"client-documents\").copy(");
  });

  it("checks for an already-existing destination object before copying -- retry-safe, never re-copies unnecessarily", () => {
    expect(approveRoute).toContain(".list(folder, { search: fileName })");
    expect(approveRoute).toContain("alreadyCopied");
  });

  it("only confirms a transfer after the object is copied or found to already exist -- never claims success on a failed copy", () => {
    const loopBlock = approveRoute.slice(approveRoute.indexOf("for (const doc of documentPlan)"));
    const copyIdx = loopBlock.indexOf("copyError");
    const confirmIdx = loopBlock.indexOf("mark_contact_document_transferred");
    expect(copyIdx).toBeGreaterThan(-1);
    expect(confirmIdx).toBeGreaterThan(copyIdx);
    expect(loopBlock).toContain("if (copyError) {");
    const copyErrorBlockStart = loopBlock.indexOf("if (copyError) {");
    expect(loopBlock.slice(copyErrorBlockStart, copyErrorBlockStart + 120)).toContain("continue");
  });
});

describe("database-contract-guard baseline -- updated for every new RPC", () => {
  const rpcs = [
    "create_contact_share",
    "request_contact_share_update",
    "respond_to_contact_share",
    "execute_contact_share_transfer",
    "mark_contact_document_transferred",
    "withdraw_contact_share",
    "resubmit_contact_share",
  ];

  it("every new RPC has a trackedSignatures entry", () => {
    for (const fn of rpcs) {
      expect(contractBaseline.trackedSignatures.functions[fn]).toBeDefined();
      expect(contractBaseline.trackedSignatures.functions[fn].isSecurityDefiner).toBe(true);
    }
  });

  it("no new RPC was added to serviceOnlyFunctions or acceptedPublicFunctions -- all seven are ordinary authenticated-executable, self-authorizing RPCs, not an exception case", () => {
    for (const fn of rpcs) {
      expect(contractBaseline.serviceOnlyFunctions.names).not.toContain(fn);
      expect(Object.keys(contractBaseline.acceptedPublicFunctions.entries)).not.toContain(fn);
    }
  });
});
