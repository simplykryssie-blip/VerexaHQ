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

## Progressive Disclosure -- Verexa UX Standard #001 (backend, complete)

Backend support for "only show what exists, let users add more when
needed" across the Client Profile, plus a generic auto-save mechanism --
no rebuild, no duplicated structures, no schema redesign.
`supabase/migrations/0044`-`0047`,
`supabase/tests/progressive_disclosure_smoke_test.sql`.

- **Client satellite tables**: `clients` (built in the prior revision)
  stores exactly one embedded primary email/phone/address -- there was
  never a repeating structure for a second contact, a seasonal address, or
  an extra phone. `client_contacts`, `client_addresses`, `client_phones`,
  and `client_emails` hold only records ADDITIONAL to that primary, so the
  UI can render "one primary by default, + Add Another" honestly without
  touching `clients`' existing columns or migrating any data. A partial
  unique index (`where is_primary`) enforces at most one primary row per
  client on each of the four tables.
- **Relationships, not a second "Related Businesses" table**:
  `client_relationships` covers Spouse/Dependent/Parent/Child/Business/
  Trust/Estate/Partner/Owner/Officer/Other, optionally pointing at another
  `clients` row (`related_client_id`) or a bare name (`related_name`) when
  the related party isn't itself a client -- a check constraint requires
  one or the other. The UI's "Related Businesses" section is this same
  table filtered to business-ish relationship types; per the explicit "no
  duplicate structures" requirement, it does not get its own table.
- **Portal roster & notes**: `client_portal_users` tracks invite/active/
  revoked status for "one Primary Portal User, + Invite Additional" (real
  portal authentication is a later phase -- this is roster tracking only).
  `client_notes` is free-form, author-or-admin-editable; "recent notes
  only" is a query-side `ORDER BY created_at desc LIMIT`, not a schema
  constraint.
- **Documents**: `client_documents` + a new private `client-documents`
  storage bucket (unlike Phase 0's public `branding` bucket, client
  documents must never be reachable by an unauthenticated URL). Lean by
  design -- no folders/categories/versioning; that's Phase 4. Gated by the
  existing `documents.view`/`documents.upload`/`documents.delete`
  permission keys from Phase 0, both on the table and on the storage
  objects (folder-prefix-by-workspace_id, same pattern as `branding`).
- **Draft auto-save**: one generic `draft_saves` table instead of nine
  bespoke ones, covering Client/Engagement/Workflow/Blueprint/Organizer/
  Document Request/Engagement Letter/Automation/Settings editing. Keyed by
  `(workspace_id, user_id, draft_type, entity_id)`; `entity_id` is null
  while editing something not yet created, and Postgres's distinct-NULLs
  behavior lets two concurrent "new X" drafts coexist without colliding.
  RLS is owner-only (`user_id = auth.uid()`) -- no RPCs needed, the client
  upserts and reads directly.
- **No table needed for**: Engagements/Tasks/Timeline/Dashboard/Reports
  progressive disclosure -- those are pure "query only what exists, render
  nothing for an empty result set" UI behavior against tables (or, for
  Engagements, a future table) that already return exactly the real rows;
  no schema changes were required or made for them.

## Applying migrations

Migrations were applied directly to the v2 project via the Supabase MCP
`apply_migration` tool, in filename order. If working from the CLI instead:

```
supabase link --project-ref daxpavvsotvsyqqntddc
supabase db push
```
