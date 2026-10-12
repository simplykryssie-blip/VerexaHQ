// Partner-purchase / partner-onboarding runs have no contact or engagement, so
// the Runs list showed "--" for who they were for, and {{client_name}} rendered
// empty ("Verify Payment Success for ", "Welcome to Tax Avenue Pro-!").
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("workflow Runs list names partner runs", () => {
  const page = read("app/(app)/workflows/[id]/page.tsx");
  const builder = read("components/workflows/WorkflowBuilder.tsx");

  it("loads the partner behind a run via its onboarding's firm connection", () => {
    expect(page).toMatch(/partner_onboardings\(firm_connections\(manual_name, manual_owner_name, workspaces!firm_connections_child_workspace_id_fkey\(name\)\)\)/);
  });

  it("maps owner and business name into partner_name", () => {
    expect(page).toMatch(/partner_name: partnerLabelFor\(/);
    expect(page).toMatch(/`\$\{owner\} \(\$\{name\}\)`/);
  });

  it("shows the partner when there is no client, before falling back to --", () => {
    expect(builder).toMatch(/r\.client_name \?\? r\.partner_name \?\? r\.engagement_number \?\? "--"/);
    expect(builder).toMatch(/Engagement \/ client \/ partner/);
  });
});

describe("automation merge context falls back to the partner's name", () => {
  const sql = read("supabase/migrations/20261109000100_automation_context_partner_name_fallback.sql");

  it("only fills client_name when the contact/engagement name is empty", () => {
    expect(sql).toMatch(/'client_name', coalesce\(nullif\(btrim\(coalesce\(v_eng\.first_name, ''\)/);
  });

  it("uses the firm connection identity and covers first-name keys", () => {
    expect(sql).toMatch(/resolve_firm_connection_identity\(v_connection_id\)->>'owner_name'/);
    expect(sql).toMatch(/'first_name', coalesce\(v_eng\.first_name, split_part/);
    expect(sql).toMatch(/'client_first_name', coalesce\(v_eng\.first_name, split_part/);
  });

  it("refuses to apply if the anchor is missing", () => {
    expect(sql).toMatch(/if v_new = v_def then\s+raise exception/);
  });
});
