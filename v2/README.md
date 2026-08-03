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
  Notes originally lived in a per-client `client_notes` table here; Epic 3A
  below superseded it with a universal `notes` engine, so see that section
  for the current shape.
- **Documents**: originally a per-client `client_documents` table + a
  private `client-documents` storage bucket (unlike Phase 0's public
  `branding` bucket, client documents must never be reachable by an
  unauthenticated URL). Epic 3A below turned this into the universal
  `attachments` engine; the storage bucket keeps its original name.
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

## Epic 3A -- Engagement Foundation (complete)

`supabase/migrations/0048`-`0058`, `supabase/tests/epic_3a_smoke_test.sql`.
The Engagement becomes Verexa's primary work object -- every Client may
have unlimited Engagements, and every future module (Bookkeeping, Payroll,
Business Formation, Advisory) plugs into the same architecture.

- **Drift reconciliation**: before this epic's own build started, a
  process outside this git repo had already applied a partial Engagement
  Foundation directly to the live Supabase project -- `engagements`,
  `engagement_status_history`, `workflow_runs`, `workflow_stages`, `tasks`,
  `due_date_rules`, `automation_execution_logs`, 4 enum types, and several
  functions/views, none of it tracked in any migration file. Two real bugs
  were caught and fixed rather than shipped: **`public.tasks` had Row Level
  Security disabled entirely** (anon/authenticated could read and write
  every row via the API), and `generate_engagement_number()` counted
  engagements across *all* workspaces combined with no concurrency guard
  (a cross-tenant numbering bug plus a race condition). `0048`-`0049`
  capture the drifted objects idempotently for git parity, fix both bugs,
  add real RLS to every table that had none, and fix 3 views that were
  running as `SECURITY DEFINER` (an ERROR-level finding). A "Simulation
  Workspace" test row from the same drift was left in place per
  "preserve existing data," flagged in `0048`'s header for a human call on
  whether to remove it.
- **Engagement core**: `engagements` gained `service_id`, `engagement_type_id`,
  a top-level `status` (the spec's 12-state lifecycle -- distinct from the
  narrower `review_status` enum the drift had already added), and
  `updated_at`. `engagement_number` is now `ENG-YYYY-NNNNNN`, generated
  per-workspace-per-year with an advisory-lock guard against concurrent
  inserts. `engagement_types` is a lookup (workspace_id NULL = Verexa
  system type, same pattern as `roles`/`services`) seeded with the six tax
  types; a `module` column lets future modules register their own types
  without touching this table's shape.
- **Assignment Engine**: new Engagements default `assigned_staff_id` to the
  workspace owner; every change to `assigned_staff_id`/`reviewer_id`/
  `compliance_officer_id` is captured in `engagement_assignment_history`.
- **Status Engine**: a trigger auto-snapshots every `engagements.status`
  change into `engagement_status_history` (old/new/changed_by/timestamp)
  and auto-stamps `completed_date`/`archived_date` on the two terminal
  transitions -- status is never silently overwritten.
- **Universal Timeline**: no new table -- `activity_log` (Phase 0) already
  had exactly the right shape. Wired to fire on engagement creation, status
  changes, task completion, attachment uploads, automation execution, and
  blueprint application.
- **Universal Notes & Attachments**: `client_notes` and `client_documents`
  (Progressive Disclosure sprint) were already mid-transformation by the
  same external drift into polymorphic engines when this epic started --
  `entity_type`/`entity_id` columns existed, but the rename had left the
  original single-target foreign key in place, so neither could actually
  attach to anything but a Client yet. Finished rather than reverted:
  dropped the wrong FK, added a real `entity_type` check constraint
  (Client/Engagement/Task/Document/Invoice/Blueprint/Workflow, plus
  Message for attachments), and renamed the tables to `notes` and
  `attachments`. `notes` supports pinned/private/internal/rich content/
  mentions; `attachments` supports category/tags/version.
- **Review Engine**: `respond_to_engagement_share()` (Revision Sprint)
  covered Approve/Reject; this epic added Request Corrections/Comment/
  Withdraw and `engagement_review_actions` so full review history is
  stored, not just the current decision.
- **Notification Foundation**: `notification_queue` (Phase 0) already had
  `channels`/`event_type`/`priority` -- a `create_notification()` helper
  wraps it (its own INSERT policy is workspace-admin-only, since any user's
  action can now raise a notification for someone else) and is wired into
  engagement assignment and status-change events. Caught and fixed a
  channel-vocabulary mismatch the same drift had left behind: the legacy
  `channel` column only accepted lowercase `email/sms/portal/push` with no
  `In-App` option at all, while the newer `channels` array defaulted to
  `In-App` -- standardized both on the capitalized convention already used
  elsewhere in this drifted cluster (`engagement_priority`'s
  Low/Medium/High/Urgent, etc.), which in turn required a one-line fix to
  Phase 0's `invite_workspace_user()` (still hardcoded the old lowercase
  value).
- **Global Search prep**: generated `tsvector` + GIN index on `clients`,
  `engagements`, `attachments`, and `notes` -- indexes only, no search
  UI/RPC yet.
- **Client/Engagement Workspace, remaining work before Epic 3B**: no new
  schema needed for the Client/Engagement Workspace tab structures
  themselves -- every tab (Contacts, Relationships, Documents, Timeline,
  Notes, Tasks, Review, etc.) is already backed by an existing table or
  view from this epic or earlier ones. Not built: the actual Workflow
  Execution Engine (Epic 3B, explicitly out of scope here), billing/
  invoicing (referenced by `attachments`' `invoice` entity type and the
  Notification spec's "Waiting On Payment" status, but no `invoices` table
  exists yet), and any frontend at all -- this remains a pure backend
  project.

## Applying migrations

Migrations were applied directly to the v2 project via the Supabase MCP
`apply_migration` tool, in filename order. If working from the CLI instead:

```
supabase link --project-ref daxpavvsotvsyqqntddc
supabase db push
```
