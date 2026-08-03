# Verexa Tax Office v2

Brand-new backend build for Verexa Tax Office v2, isolated from the existing
VerexaHQ (v1) application at the repository root. This directory owns its
own Supabase project and does not share schema, migrations, or data with v1.

- Supabase project: **Verexa Tax Office v2** (`daxpavvsotvsyqqntddc`, us-east-2)
- v1's project ("VerexaHQ Tax Office", `aewqbffscdrziiwfomyf`) is untouched by
  anything in this directory.

## Layout

```
v2/
  supabase/
    migrations/   -- numbered, applied in order via the Supabase MCP/CLI
    tests/         -- SQL smoke tests, safe to run directly (self-rollback)
  types/
    database.types.ts -- generated via the Supabase MCP `generate_typescript_types` tool
```

## Phase 0 -- Platform Foundation (complete)

Multi-tenant core: `workspaces`, global `user_profiles`, RBAC (`roles` /
`permissions` / `role_permissions` / `workspace_users`), `office_locations`,
`branding`, `system_settings`, feature flags (`feature_flags` /
`workspace_feature_flags`), and the audit/activity/notification tables
(`audit_log`, `activity_log`, `notification_queue`). Every table is
workspace-isolated with RLS; `create_workspace()` is the only sanctioned way
to provision a tenant. See `supabase/migrations/0001`-`0013` for the full
build and `supabase/tests/phase0_smoke_test.sql` for verification.

## Phase 2 -- Firm Configuration Engine (complete)

Everything a tax office configures about how it operates, built so nothing
is hardcoded and Verexa's own templates are never mutated in place:

- **Org network**: `firm_connections` (Service Bureau <-> ERO <-> PTIN
  relationships, with `workspaces.is_ero` / `is_service_bureau` /
  `is_ptin_preparer` capability flags so one workspace can hold several
  roles) and `case_shares` (a PTIN shares one Case at a time with a
  connected ERO; the case table itself arrives in Phase 3).
- **Brand Center**: `branding` extended with DBA, logos, contact info, and
  theme; the favicon and core UI are deliberately not configurable (no
  column exists for them).
- **Firm tax profile**: `firm_tax_profile` stores EIN/EFIN/PTIN encrypted
  via Supabase Vault + pgcrypto, with `reveal_firm_*` audit-logged RPCs.
- **Onboarding**: `firm_onboarding` tracks the 6-step first-login wizard.
- **Template/Blueprint Library**: every configuration table (`services`,
  `service_categories`, `processes` + stages/tasks, `pipelines` + stages,
  `organizer_templates` + fields, `document_request_templates` + items,
  `engagement_letter_templates`, `email_templates`, `sms_templates`,
  `pricing_rules`, `billing_rules`, `automations` + steps, `dashboards` +
  widgets) uses the same `workspace_id NULL = Verexa system template`
  pattern as Phase 0's roles. `blueprints` + `blueprint_components` bundle
  a full offering; `apply_blueprint()` deep-copies one into a workspace and
  rewires the copied service's cross-references to the copies.
- **Generic lifecycle**: `duplicate_config_object()`, `set_config_object_status()`
  (draft/published/archived), and `config_object_versions` (auto-snapshotted
  on every UPDATE) plus `compare_config_object_versions()` give every one of
  the tables above Preview/Duplicate/Publish/Archive/Version History/Compare
  for free, instead of bespoke logic per object type.
- **Seed data**: six system blueprints -- Individual Tax Preparation,
  Business Tax Preparation, Amended Return, Extension Filing, IRS Notice
  Response, Tax Planning -- each with a working process, pipeline, pricing/
  billing rule, engagement letter, and email/SMS templates.

See `supabase/migrations/0014`-`0034` and `supabase/tests/phase2_smoke_test.sql`.

## Applying migrations

Migrations were applied directly to the v2 project via the Supabase MCP
`apply_migration` tool, in filename order. If working from the CLI instead:

```
supabase link --project-ref daxpavvsotvsyqqntddc
supabase db push
```
