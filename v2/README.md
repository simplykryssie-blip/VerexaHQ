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
  roles) and `engagement_shares` (a PTIN shares one Engagement at a time with
  a connected ERO; renamed from `case_shares` in the Revision Sprint below).
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

## Revision Sprint (complete)

Non-destructive refactor on top of Phases 0 and 2 -- no table was rebuilt,
no data was lost. `supabase/migrations/0035`-`0043`,
`supabase/tests/revision_sprint_smoke_test.sql`.

- **Phase 1 -- Client & Identity Foundation** (new construction: Contacts
  was never actually built, so this is the real thing, not a migration off
  an old table): `clients`, universal and module-agnostic, strictly separate
  from `workspace_users`. SSN/EIN/ITIN encrypted via their own Vault key
  (`client_identity_vault_key`, distinct from the firm's own
  `firm_tax_profile_key`). `create_client()` runs automatic duplicate
  detection (SSN/EIN hash, normalized email/phone) before ever inserting;
  `merge_clients()` folds duplicates without deleting history.
  `reveal_client_ssn/ein/itin()` are permission-checked and audit-logged.
  Five new system roles alongside the original five --
  Reviewer, Compliance Officer, Manager, Administrative Staff, Receptionist
  -- since ERO is now purely a workspace capability, not a job function.
- **Terminology finalized**: Contacts -> Clients and Jobs -> Engagements
  across the permission catalog; `case_shares` renamed to
  `engagement_shares` (safe -- its `case_id`/`engagement_id` column has
  never had a real FK; the Jobs/Cases table was never built).
- **Phase 2 -- Sharing Engine expansion**: `config_object_shares` lets one
  workspace share any configuration object (blueprint, service, process,
  organizer, document request, engagement letter, pricing/billing rule,
  automation, email/SMS template) with a connected workspace over
  `firm_connections`, with Preview (RLS-safe, before accepting) / Accept
  (deep-copies via the existing `duplicate_config_object`) / Decline /
  Archive. `set_workspace_capabilities()` backs the onboarding wizard's
  "How do you operate?" step (Independent PTIN / ERO Office / Service
  Bureau / Service Bureau + ERO).
- **Phase 2.5 -- Security & Compliance Framework** (new module):
  `workspace_security_policies` (password/session/lockout/MFA, all
  configurable, nothing hardcoded), `login_history` +
  `record_login_attempt()` (server-side/auth-hook only -- a client-reported
  "success" flag can't be trusted), `trusted_devices`, `consent_records` +
  `record_consent()`, `workspace_retention_policies` (every window defaults
  to null/forever), and eight `compliance_*_view`s plus
  `compliance_inactive_users()` for the Compliance Dashboard.
- **Two real bugs caught by the smoke tests, not shipped**: all eight
  compliance views were silently running as security-definer (RLS-bypassing)
  views -- a plain `CREATE VIEW` checks permissions as the view owner unless
  `security_invoker = true` is set, which none of them had; fixed before
  any client could have read cross-workspace data through them. Separately,
  the same-workspace guard added to `duplicate_config_object()` to stop
  unauthorized cross-workspace copying also blocked the legitimate
  share-accept flow; narrowed to require a matching pending
  `config_object_shares` row instead of removing the guard.

## Applying migrations

Migrations were applied directly to the v2 project via the Supabase MCP
`apply_migration` tool, in filename order. If working from the CLI instead:

```
supabase link --project-ref daxpavvsotvsyqqntddc
supabase db push
```
