// Regression coverage for VEREXAHQ CONTACTS PASS 6 (Client -> Lead lifecycle
// reversion). RevertToLeadButton is a "use client" component calling
// useRouter()/useState() outside a render tree, the same constraint every
// other Contacts pass's component tests have hit -- source-text assertion,
// same as the rest of this suite.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BULK_STATUS_OPTIONS, isEligibleForBulkStatus } from "@/app/(app)/clients/bulkContactActions";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const revertSource = readFileSync(join(repoRoot, "app/(app)/clients/[id]/RevertToLeadButton.tsx"), "utf8");
const convertSource = readFileSync(join(repoRoot, "app/(app)/clients/[id]/ConvertLeadButton.tsx"), "utf8");
const workspaceSource = readFileSync(join(repoRoot, "app/(app)/clients/[id]/ClientWorkspace.tsx"), "utf8");
const drawerSource = readFileSync(join(repoRoot, "app/(app)/clients/[id]/ClientQuickViewDrawer.tsx"), "utf8");
const baselineSchema = readFileSync(
  join(repoRoot, "supabase/migrations/00000000000000_baseline_schema_snapshot_for_fresh_projects.sql"),
  "utf8"
);

describe("RevertToLeadButton -- Client -> Lead reversion", () => {
  it("only offers reversion for active/inactive (already-converted Client statuses), never lead/lost/archived", () => {
    expect(revertSource).toContain('if (lifecycleStatus !== "active" && lifecycleStatus !== "inactive") return null;');
  });

  it("writes lifecycle_status back to 'lead' and nothing else -- no cascading update to any other field", () => {
    const updateCall = revertSource.slice(revertSource.indexOf(".update("), revertSource.indexOf(".eq(\"id\""));
    expect(updateCall).toBe('.update({ lifecycle_status: "lead" })');
  });

  it("goes through a bare table update via the standard authenticated client -- no new RPC, no service-role bypass", () => {
    expect(revertSource).toContain('import { createClient } from "@/lib/supabase/client"');
    expect(revertSource).not.toContain("supabase.rpc(");
    expect(revertSource).not.toContain("service_role");
    expect(revertSource).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("never deletes or archives anything -- no .delete(, no hard-delete RPC, no engagement/invoice/document mutation", () => {
    expect(revertSource).not.toContain(".delete(");
    expect(revertSource).not.toMatch(/hard_delete|permanently_delete/i);
    expect(revertSource).not.toContain('.from("engagements")');
    expect(revertSource).not.toContain('.from("invoices")');
    expect(revertSource).not.toContain('.from("documents")');
    expect(revertSource).not.toContain('.from("attachments")');
    expect(revertSource).not.toContain('.from("notes")');
    expect(revertSource).not.toContain('.from("messages")');
  });

  it("requires explicit confirmation before reverting (a modal, not a one-click action)", () => {
    expect(revertSource).toContain('import { Modal } from "@/components/Modal"');
    expect(revertSource).toContain("{open &&");
  });
});

describe("ConvertLeadButton (Lead -> Client) is unchanged by this pass", () => {
  it("still converts a lead straight to active, and only active", () => {
    expect(convertSource).toContain('if (lifecycleStatus !== "lead") return null;');
    expect(convertSource).toContain('.update({ lifecycle_status: "active" })');
  });
});

describe("RevertToLeadButton is wired in next to the other lifecycle actions, both surfaces", () => {
  it("full Contact record page (ClientWorkspace)", () => {
    expect(workspaceSource).toContain('import { RevertToLeadButton } from "./RevertToLeadButton"');
    expect(workspaceSource).toMatch(/<ConvertLeadButton[^/]*\/>\s*<RevertToLeadButton/);
  });

  it("Quick-View flyout (ClientQuickViewDrawer)", () => {
    expect(drawerSource).toContain('import { RevertToLeadButton } from "./RevertToLeadButton"');
    expect(drawerSource).toMatch(/<ConvertLeadButton[^/]*\/>\s*<RevertToLeadButton/);
  });
});

describe("Authorization -- reuses the existing clients_update RLS policy, no new/weaker access path introduced", () => {
  it("clients_update still requires has_permission(workspace_id, 'clients.edit') for both direction and reverse -- unmodified by this pass", () => {
    expect(baselineSchema).toContain(
      "CREATE POLICY clients_update ON public.clients AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'clients.edit'::text)) WITH CHECK (has_permission(workspace_id, 'clients.edit'::text));"
    );
  });

  it("validate_client_lifecycle_status's allowed value set is unchanged -- no new lifecycle_status value was invented for this feature", () => {
    expect(baselineSchema).toContain("if new.lifecycle_status in ('lead', 'active', 'inactive', 'archived', 'lost') then");
  });
});

describe("Consistency with the pre-existing bulk status action (Contacts list) -- same eligible set, not a parallel rule", () => {
  it("bulk status already allows reverting active/inactive contacts to lead -- this pass adds the single-Contact-page equivalent of an already-existing capability, not a new authorization rule", () => {
    expect(BULK_STATUS_OPTIONS.some((o) => o.value === "lead")).toBe(true);
    expect(isEligibleForBulkStatus("active")).toBe(true);
    expect(isEligibleForBulkStatus("inactive")).toBe(true);
    expect(isEligibleForBulkStatus("lost")).toBe(false);
    expect(isEligibleForBulkStatus("archived")).toBe(false);
  });
});
