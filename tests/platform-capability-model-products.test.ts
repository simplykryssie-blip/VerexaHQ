// Capability Model + Products V1 -- regression coverage.
//
// Source-text assertions against the migration files themselves, the same
// convention this repo already uses for schema-shaped regression tests
// (see contact-sharing-schema.test.ts, aal2-migration.test.ts) rather than
// requiring a live database connection this sandbox doesn't have. A live
// verification pass against the staging project (uzdlqioslnqqikiouksg) was
// performed via the Supabase MCP tools during implementation -- see the
// final report -- and is not re-executed here since this suite runs
// without live DB credentials in CI.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");

const foundation = readFileSync(join(migrationsDir, "20261007025746_platform_capability_model_v1.sql"), "utf8");
const eroWriteAccess = readFileSync(join(migrationsDir, "20261007032640_firm_packages_digital_product_ero_write_access.sql"), "utf8");
const finish = readFileSync(join(migrationsDir, "20261108000000_finish_capability_model_products_v1.sql"), "utf8");
const capabilitiesLib = readFileSync(join(repoRoot, "lib/capabilities.ts"), "utf8");
const productsPage = readFileSync(join(repoRoot, "app/(app)/settings/products/page.tsx"), "utf8");
const packagesPage = readFileSync(join(repoRoot, "app/(app)/settings/packages/page.tsx"), "utf8");
const packageDetailPage = readFileSync(join(repoRoot, "app/(app)/settings/packages/[id]/page.tsx"), "utf8");
const productsManager = readFileSync(join(repoRoot, "components/settings/ProductsManager.tsx"), "utf8");
const triggerFields = readFileSync(join(repoRoot, "components/workflows/TriggerFields.tsx"), "utf8");

describe("workspace_tier_rank() -- cumulative PTIN -> ERO -> Service Bureau tiers", () => {
  it("maps independent_ptin to 1, ero_office/multi_office_firm to 2, service_bureau to 3", () => {
    const fnStart = foundation.indexOf("create or replace function public.workspace_tier_rank");
    const fnBody = foundation.slice(fnStart, foundation.indexOf("$$;", fnStart));
    expect(fnBody).toMatch(/when 'independent_ptin' then 1/);
    expect(fnBody).toMatch(/when 'ero_office' then 2/);
    expect(fnBody).toMatch(/when 'multi_office_firm' then 2/);
    expect(fnBody).toMatch(/when 'service_bureau' then 3/);
  });

  it("fails closed to tier 1 (lowest) for an unrecognized workspace_type, not an error or unlimited access", () => {
    const fnStart = foundation.indexOf("create or replace function public.workspace_tier_rank");
    const fnBody = foundation.slice(fnStart, foundation.indexOf("$$;", fnStart));
    expect(fnBody).toMatch(/else 1/);
  });

  it("is immutable and granted to authenticated only", () => {
    const fnStart = foundation.indexOf("create or replace function public.workspace_tier_rank");
    const fnBody = foundation.slice(fnStart, foundation.indexOf("$$;", fnStart) + 3);
    expect(fnBody).toMatch(/immutable/);
    expect(foundation).toMatch(/grant execute on function public\.workspace_tier_rank\(text\) to authenticated;/);
  });
});

describe("workspace_has_capability() -- single platform-level capability entry point", () => {
  const fnStart = foundation.indexOf("create or replace function public.workspace_has_capability");
  const fnBody = foundation.slice(fnStart, foundation.indexOf("grant execute on function public.workspace_tier_rank"));

  it("is SECURITY DEFINER and STABLE, same convention as other callable-by-authenticated entry points", () => {
    expect(fnBody).toMatch(/stable security definer/);
    expect(fnBody).toMatch(/set search_path = public/);
  });

  it("fails closed when the workspace does not exist (no row in workspaces -> return false, not an error or true)", () => {
    const lookup = fnBody.indexOf("select workspace_type into v_workspace_type from public.workspaces where id = p_workspace_id;");
    const guard = fnBody.slice(lookup, lookup + 200);
    expect(guard).toMatch(/if v_workspace_type is null then\s*\n\s*return false;/);
  });

  it("fails closed when the capability key does not exist (no row in feature_flags -> return false, not an error or true)", () => {
    const lookup = fnBody.indexOf("where key = p_capability_key;");
    const guard = fnBody.slice(lookup, lookup + 120);
    expect(guard).toMatch(/if v_flag\.id is null then\s*\n\s*return false;/);
  });

  it("denies a workspace below the capability's min_workspace_tier before ever consulting the override/default", () => {
    const tierCheckIdx = fnBody.indexOf("if v_flag.min_workspace_tier is not null");
    const overrideIdx = fnBody.indexOf("select is_enabled into v_override");
    expect(tierCheckIdx).toBeGreaterThan(-1);
    expect(overrideIdx).toBeGreaterThan(-1);
    expect(tierCheckIdx).toBeLessThan(overrideIdx);
    const tierCheckBlock = fnBody.slice(tierCheckIdx, overrideIdx);
    expect(tierCheckBlock).toMatch(/public\.workspace_tier_rank\(v_workspace_type\) < public\.workspace_tier_rank\(v_flag\.min_workspace_tier\)/);
    expect(tierCheckBlock).toMatch(/return false;/);
  });

  it("a workspace at or above the required tier is not rejected by the tier branch (strict less-than, not less-or-equal)", () => {
    // workspace_tier_rank(workspace) < workspace_tier_rank(min_tier) is the
    // only rejection condition -- equal tiers, and every higher tier, fall
    // through to the override/default branch instead of being denied here.
    expect(fnBody).toMatch(/< public\.workspace_tier_rank\(v_flag\.min_workspace_tier\)/);
    expect(fnBody).not.toMatch(/<= public\.workspace_tier_rank\(v_flag\.min_workspace_tier\)/);
  });

  it("a per-workspace workspace_feature_flags override takes precedence over feature_flags.default_enabled in both directions", () => {
    const overrideIdx = fnBody.indexOf("select is_enabled into v_override");
    const overrideBlock = fnBody.slice(overrideIdx);
    expect(overrideBlock).toMatch(/if v_override\.is_enabled is not null then\s*\n\s*return v_override\.is_enabled;/);
    expect(overrideBlock).toMatch(/return coalesce\(v_flag\.default_enabled, false\);/);
  });

  it("is scoped per-workspace in the override lookup -- cannot read or be influenced by another workspace's override row", () => {
    const overrideIdx = fnBody.indexOf("select is_enabled into v_override");
    const overrideBlock = fnBody.slice(overrideIdx, overrideIdx + 200);
    expect(overrideBlock).toMatch(/where workspace_id = p_workspace_id and feature_flag_id = v_flag\.id/);
  });

  it("is granted to authenticated (callable without direct table select on feature_flags/workspace_feature_flags)", () => {
    expect(foundation).toMatch(/grant execute on function public\.workspace_has_capability\(uuid, text\) to authenticated;/);
  });
});

describe("platform-level vs workspace capabilities stay structurally separate", () => {
  it("every new capability row in this phase is keyed by workspace tier, never by a workspace id, email, or tenant literal", () => {
    const insertStart = foundation.indexOf("insert into public.feature_flags");
    const insertBlock = foundation.slice(insertStart, foundation.indexOf("on conflict (key) do nothing;", insertStart));
    expect(insertBlock).not.toMatch(/@/); // no email literal
    expect(insertBlock).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i); // no uuid literal
  });

  it("workspace_has_capability only ever resolves eligibility from workspaces/feature_flags/workspace_feature_flags -- no hardcoded workspace/customer identifier anywhere in its body", () => {
    const fnBody = foundation.slice(
      foundation.indexOf("create or replace function public.workspace_has_capability"),
      foundation.indexOf("grant execute on function public.workspace_tier_rank")
    );
    expect(fnBody).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(fnBody).not.toMatch(/@\w+\.\w+/); // no email literal
  });
});

describe("lib/capabilities.ts -- client wrapper", () => {
  it("thinly wraps the workspace_has_capability RPC, coercing null/undefined to false (fail closed on a missing/errored row too)", () => {
    expect(capabilitiesLib).toMatch(/supabase\.rpc\("workspace_has_capability", \{ p_workspace_id: workspaceId, p_capability_key: capabilityKey \}\)/);
    expect(capabilitiesLib).toMatch(/return Boolean\(data\);/);
  });

  it("includes the new digital_product_sales key alongside the existing tiered capability keys", () => {
    expect(capabilitiesLib).toMatch(/"third_party_product_distribution"/);
    expect(capabilitiesLib).toMatch(/"digital_product_sales"/);
  });
});

describe("finish_capability_model_products_v1 migration -- digital_product_sales flag", () => {
  it("adds digital_product_sales gated at ero_office tier (distinct capability/tier from third_party_product_distribution's service_bureau tier)", () => {
    const insertStart = finish.indexOf("insert into public.feature_flags");
    const insertBlock = finish.slice(insertStart, finish.indexOf("on conflict (key) do nothing;", insertStart));
    expect(insertBlock).toMatch(/'digital_product_sales'/);
    expect(insertBlock).toMatch(/'ero_office'/);
  });

  it("is idempotent (on conflict do nothing) so re-running the migration never duplicates or clobbers the row", () => {
    expect(finish).toMatch(/on conflict \(key\) do nothing;/);
  });
});

describe("firm_packages write/update/delete RLS -- both product_type branches go through workspace_has_capability()", () => {
  it("the package branch now calls workspace_has_capability(..., 'third_party_product_distribution') instead of the legacy is_service_bureau_workspace() raw tier check", () => {
    expect(finish).toMatch(/product_type = 'package' and public\.workspace_has_capability\(workspace_id, 'third_party_product_distribution'\)/);
    // The capability-model finish migration's write/update/delete bodies no
    // longer reference the old literal tier-rank check this phase replaced.
    const writePolicy = finish.slice(finish.indexOf("alter policy firm_packages_write"), finish.indexOf("alter policy firm_packages_update"));
    expect(writePolicy).not.toMatch(/is_service_bureau_workspace/);
    expect(writePolicy).not.toMatch(/workspace_tier_rank\(.*>= 2/);
  });

  it("the digital_product branch now calls workspace_has_capability(..., 'digital_product_sales') instead of the raw workspace_tier_rank(...) >= 2 literal", () => {
    expect(finish).toMatch(/product_type = 'digital_product' and public\.workspace_has_capability\(workspace_id, 'digital_product_sales'\)/);
    expect(finish).not.toMatch(/workspace_tier_rank\(\(select w\.workspace_type/);
  });

  it("confirms the pre-finish migration actually had the raw literal this phase was tasked with replacing (regression baseline)", () => {
    expect(eroWriteAccess).toMatch(/workspace_tier_rank\(\(select w\.workspace_type from public\.workspaces w where w\.id = firm_packages\.workspace_id\)\) >= 2/);
  });

  it("every one of the three policies (write/update/delete) requires is_workspace_admin(workspace_id) -- a non-admin, or an admin of a different workspace, cannot pass regardless of capability", () => {
    for (const policy of ["firm_packages_write", "firm_packages_update", "firm_packages_delete"]) {
      const start = finish.indexOf(`alter policy ${policy} on public.firm_packages`);
      const end = finish.indexOf("alter policy", start + 1) === -1 ? finish.length : finish.indexOf("alter policy", start + 1);
      const block = finish.slice(start, end);
      expect(block).toMatch(/is_workspace_admin\(workspace_id\)/);
    }
  });

  it("restores is_workspace_operational(workspace_id) on all three policies -- the Phase 4A suspension check the prior migration's full ALTER POLICY replacement silently dropped", () => {
    for (const policy of ["firm_packages_write", "firm_packages_update", "firm_packages_delete"]) {
      const start = finish.indexOf(`alter policy ${policy} on public.firm_packages`);
      const end = finish.indexOf("alter policy", start + 1) === -1 ? finish.length : finish.indexOf("alter policy", start + 1);
      const block = finish.slice(start, end);
      expect(block).toMatch(/is_workspace_operational\(workspace_id\)/);
    }
  });

  it("confirms is_workspace_operational was absent from the pre-finish (regression) migration's replacement clauses -- proving this was a real dropped check, not a no-op restoration", () => {
    expect(eroWriteAccess).not.toMatch(/is_workspace_operational/);
  });

  it("a package-type row can never satisfy the digital_product branch and vice versa -- the two branches are mutually exclusive on product_type, not an OR that ignores type", () => {
    const writePolicy = finish.slice(finish.indexOf("alter policy firm_packages_write"), finish.indexOf("alter policy firm_packages_update"));
    const packageBranchIdx = writePolicy.indexOf("(product_type = 'package' and");
    const digitalBranchIdx = writePolicy.indexOf("(product_type = 'digital_product' and");
    expect(packageBranchIdx).toBeGreaterThan(-1);
    expect(digitalBranchIdx).toBeGreaterThan(packageBranchIdx);
    expect(writePolicy.slice(packageBranchIdx, digitalBranchIdx)).toMatch(/\)\s*\n\s*or\s*$/);
  });
});

describe("firm_packages tenant isolation (pre-existing, unaffected by this phase)", () => {
  const baseline = readFileSync(join(migrationsDir, "20260906220000_firms_packages_bank_products_payouts.sql"), "utf8");

  it("firm_packages_select scopes to the owning workspace or an actively connected child workspace -- never a global/all-workspaces read", () => {
    const start = baseline.indexOf("create policy firm_packages_select");
    const block = baseline.slice(start, baseline.indexOf("create policy firm_packages_write"));
    expect(block).toMatch(/is_workspace_member\(workspace_id\)/);
    expect(block).toMatch(/fc\.status = 'active'/);
  });
});

describe("services RLS -- tenant isolation preserved, no duplicate Service system introduced", () => {
  const baseline = readFileSync(join(repoRoot, "supabase/migrations/00000000000000_baseline_schema_snapshot_for_fresh_projects.sql"), "utf8");

  it("services writes (insert/update/delete) require is_workspace_admin of the owning workspace, same shape as firm_packages", () => {
    expect(baseline).toMatch(/CREATE POLICY services_insert ON public\.services[\s\S]*?is_workspace_admin\(workspace_id\)/);
    expect(baseline).toMatch(/CREATE POLICY services_update ON public\.services[\s\S]*?is_workspace_admin\(workspace_id\)/);
    expect(baseline).toMatch(/CREATE POLICY services_delete ON public\.services[\s\S]*?is_workspace_admin\(workspace_id\)/);
  });

  it("this phase does not touch services RLS or add a competing services table -- Services keep using their existing functionality", () => {
    expect(finish).not.toMatch(/\bservices\b/);
    expect(foundation).not.toMatch(/create table.*services/i);
  });
});

describe("platform_products -- unified read-side Product model, RLS-respecting", () => {
  it("declares security_invoker = true so the view cannot bypass the underlying tables' RLS via an owner-bypassrls role", () => {
    const start = foundation.indexOf("create or replace view public.platform_products");
    const block = foundation.slice(start, foundation.indexOf("grant select on public.platform_products"));
    expect(block).toMatch(/with \(security_invoker = true\)/);
  });

  it("unions firm_packages (package/digital_product) and services (service) rather than introducing a new backing table", () => {
    const start = foundation.indexOf("create or replace view public.platform_products");
    const block = foundation.slice(start, foundation.indexOf("grant select on public.platform_products"));
    expect(block).toMatch(/from public\.firm_packages fp/);
    expect(block).toMatch(/from public\.services s/);
    expect(block).toMatch(/union all/);
  });

  it("grants select only to authenticated, not anon -- read access still gated behind a real session", () => {
    expect(foundation).toMatch(/grant select on public\.platform_products to authenticated;/);
    expect(foundation).not.toMatch(/grant select on public\.platform_products to (public|anon)/);
  });
});

describe("Products pages use the capability model, not a raw/duplicate tier check", () => {
  it("/settings/products gates package vs digital-product creation on the two distinct capabilities, not a hardcoded tier number", () => {
    expect(productsPage).toMatch(/hasCapability\(supabase, workspace\.id, "third_party_product_distribution"\)/);
    expect(productsPage).toMatch(/hasCapability\(supabase, workspace\.id, "digital_product_sales"\)/);
    expect(productsPage).not.toMatch(/isServiceBureauTier|isEroManagementTier/);
  });

  it("/settings/packages redirects non-capable workspaces before querying firm_packages at all", () => {
    const gateIdx = packagesPage.indexOf('hasCapability(supabase, workspace.id, "third_party_product_distribution")');
    const queryIdx = packagesPage.indexOf('.from("firm_packages")');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(queryIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(queryIdx);
    expect(packagesPage).toMatch(/redirect\("\/settings\/products"\)/);
  });

  it("/settings/packages scopes its query to product_type = 'package' only, never surfacing a digital_product row on the Service-Bureau-only page", () => {
    expect(packagesPage).toMatch(/\.eq\("product_type", "package"\)/);
  });

  it("/settings/packages/[id] gates per-row on the fetched product_type's own required capability, not a single blanket tier check for both types", () => {
    expect(packageDetailPage).toMatch(/const requiredCapability = isPackageType \? "third_party_product_distribution" : "digital_product_sales";/);
  });

  it("every Products-area page file imports hasCapability from the capability model, not lib/workspaceCapabilities' raw tier helpers", () => {
    for (const file of [productsPage, packagesPage, packageDetailPage]) {
      expect(file).toMatch(/from "@\/lib\/capabilities"/);
      expect(file).not.toMatch(/from "@\/lib\/workspaceCapabilities"/);
    }
  });
});

describe("Workflow separation -- Products do not own automation/onboarding", () => {
  it("ProductsManager's product-creation form stores only sellable-product fields -- no automation id, workflow id, or onboarding config field", () => {
    expect(productsManager).not.toMatch(/automation_id|automationId|workflow_id|workflowId|onboarding/i);
  });

  it("product.purchased / product.canceled are registered as Workflow trigger types -- Products emit events, Workflows own the reaction, confirming the intended direction of the boundary", () => {
    expect(triggerFields).toMatch(/product\.purchased/);
    expect(triggerFields).toMatch(/product\.canceled/);
  });

  it("the capability-model and Products-foundation migrations introduce no workflow/automation/onboarding engine tables or columns", () => {
    for (const migration of [foundation, eroWriteAccess, finish]) {
      expect(migration).not.toMatch(/create table.*(automation|workflow|onboarding)/i);
      expect(migration).not.toMatch(/alter table.*add column.*(automation_id|workflow_id)/i);
    }
  });
});
