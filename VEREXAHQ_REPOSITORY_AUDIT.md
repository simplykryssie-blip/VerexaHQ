# VerexaHQ Repository Audit — 2026-07-21

Required output per PRD §22.2, produced before any further implementation
work on the Product Blueprint/PRD or Canonical Backend Contract. Every claim
below was checked directly against the live repo and the live Supabase
project (`euxfopzgdmlmgcmmjvic`) this session — see
`VEREXAHQ_CLAUDE_CODE_HANDOFF.md`'s "Corrections applied this session"
section for how several contract claims turned out to be wrong on
inspection. Treat that discipline as standing practice, not a one-time pass.

## 1. Current-state map

**Stack:** Next.js 14 (App Router), Supabase (Postgres + Auth + Storage),
Tailwind, deployed to Vercel. No separate backend server — the browser talks
to Supabase directly via RLS-gated queries and RPCs, plus a handful of
Next.js API routes for provider secrets that can't live in the browser
(`app/api/email/send`, `app/api/sms/send`, `app/api/stripe/*`).

**Existing routes** (37 pages):

| Area | Routes |
|---|---|
| Auth/onboarding | `/login`, `/signup`, `/forgot-password`, `/update-password`, `/setup` |
| Staff app shell | `/dashboard`, `/clients`, `/clients/[id]`, `/messages`, `/services`, `/pipeline`, `/tasks`, `/deadlines`, `/calendar`, `/tax`, `/tax/[id]`, `/tax/organizers`, `/tax/organizers/[id]`, `/bookkeeping`, `/bookkeeping/[id]`, `/bookkeeping/periods/[periodId]`, `/payroll`, `/payroll/[id]`, `/payroll/runs/[runId]`, `/documents`, `/forms`, `/billing`, `/billing/[id]`, `/billing/recurring`, `/reports`, `/notifications`, `/settings`, `/admin` |
| Client portal | `/portal`, `/portal/login`, `/portal/documents`, `/portal/messages`, `/portal/todos`, `/portal/organizer/[assignmentId]`, `/portal/accept/[invitationId]` |

**Current nav structure** (`app/(app)/layout.tsx`) vs. PRD §4.1 required nav:

| PRD nav item | Current equivalent | Gap |
|---|---|---|
| Home | Dashboard | Naming only |
| Clients | Clients, Messages (grouped together) | Messages should likely move under Communication |
| Work | Services, Workflows (pipeline), Tasks, Deadlines, Calendar (spread across 2 groups) | No unified "Work" section; Tax/Bookkeeping/Payroll live in a separate "Practice" group not in the PRD nav at all |
| Documents | Documents, Forms (separate items) | No unified Documents section with Requests/Signatures/Templates sub-views |
| Communication | Messages only | No standalone Communication nav item; no email/SMS/announcements views |
| Billing | Billing | Present, matches |
| Calendar | Calendar | Present, matches |
| Reports | Reports | Present, matches |
| Templates | *(none)* | Does not exist as a nav concept at all |
| Settings | Settings | Present, matches |

**Data model in active use today** (confirmed by reading the actual
queries in each page, not assumed from schema): `clients`, `contacts`,
`account_contacts`, `client_tags`, `client_tag_assignments`,
`client_team_members`, `client_identity_vault` (via RPC),
`workspace_members`, `workspace_brand_profiles`, `workspace_settings`
(setup fields only), `services`, `tasks`, `deadlines`, `documents`,
`document_folders`, `invoices`, `invoice_line_items`, `client_tax_years`
(tax organizer flow), `portal_invitations`, `client_portal_access`. Every
other table listed in the Canonical Backend Contract exists in the
database but has **zero frontend code touching it** — see Gap Analysis.

**Auth model:** Supabase Auth with a `WorkspaceProvider` React context
resolving the active workspace via `list_my_active_workspaces()` RPC.
Single-workspace-per-user in practice today (1 workspace, 1 member, real
production data). RLS is the sole enforcement layer for staff-vs-staff and
staff-vs-portal isolation — verified largely correct this session and last
(see Security Report), not merely assumed.

## 2. Gap analysis (PRD requirements vs. what exists)

Ordered roughly by how much of the PRD's promised behavior is missing.

**Present and materially matches the PRD:**
- Client Profile as durable relationship record (`clients` table, now with
  `account_name`/`account_type` separated from the legacy `client_type`)
- Personal/business contact separation is partially there:
  `account_contacts`/`contacts` support a linked contact distinct from the
  client record; multi-address (`client_addresses`) and multi-contact-method
  (`client_contact_methods`) tables exist but have no UI
- Masked sensitive data: real, working (Identity Vault — AES-256, HMAC
  fingerprint, password+reason-gated reveal, audited)
- Basic services-per-client, tasks, deadlines, documents, billing exist and
  are wired to real Supabase tables — no mock data found in these flows
- Brand Center is real and correctly wired (`workspace_brand_profiles`,
  `workspace-brand-assets` bucket)
- Client portal exists with real invitation flow (`portal_invitations`,
  `client_portal_access`)

**Missing entirely — schema exists, zero frontend:**
- Service Workspaces (PRD §7) — the core "center of work" concept. Today a
  service is a flat row (`services` table) with no workspace, no tabs
  (Overview/Workflow/Requests/Forms/Documents/Messages/Billing/Notes/Settings),
  no milestones, no completion rules.
- Workflow Engine (PRD §8) — no milestone, action-item, completion-rule,
  dependency, review-gate, or automation-recipe concept anywhere in the
  schema or frontend. This is one of the largest undertakings in the PRD
  and does not exist in any form yet, not even as unused tables.
- Automation engine (PRD §8.4) — same as above; `platform_backend_contract`
  mentions "automation execution logs" and there are worker RPCs
  (`process_database_automation_actions`, `enqueue_automation_actions`,
  `generate_due_recurring_engagements`) that exist and are properly
  locked to `service_role`, but nothing populates or consumes them from the
  application layer today.
- Document requests with standardized catalog + multi-select + status
  lifecycle (PRD §9.2) — `documents`/`document_folders` support raw
  upload/request today, not the structured request-catalog model.
- Document template editor (PRD §9.3) — `document_templates`/
  `document_template_versions`/`document_template_fields` exist as tables,
  zero editor UI.
- E-signatures (PRD §9.4) — `signature_requests` table exists, no provider
  connected (`integration_connections` at 0 rows), no UI.
- Smart Forms (PRD §10) — no builder, no conditional logic, no rollover.
  The existing `/tax/organizers` flow is a fixed questionnaire, not a
  general-purpose form builder.
- Communication Center (PRD §12) — `secure_message_threads`/
  `secure_messages` exist; `/messages` and `/portal/messages` pages exist
  but **it hasn't been verified whether they actually read/write these
  tables or something else** — flagged as an open question, not confirmed
  either way.
- Templates nav section (PRD §4.1, §14) — `service_templates` table exists,
  no template management UI of any kind.
- Reporting beyond the existing `/reports` page's current scope — PRD §15
  wants revenue/WIP/risk/capacity/turnaround; current `/reports` page's
  actual contents not audited in this pass.
- Contractor/seasonal role with expiration (PRD §3.1) — `workspace_members`
  has no expiration field; role model is a flat text column with no
  permission-mechanics enforcement beyond the RLS helper functions found
  this session (`can_staff_write`, `can_reveal_secure_client_data`, etc.),
  which check role membership but not field-level or time-bounded access.

**Partially present, needs reconciliation:**
- `client_type` (legacy, 3 values) vs `account_type` (7 values) vs the
  contract's client status registry (6 values including `prospect`, which
  doesn't exist in the live `status` check constraint) — three overlapping
  "what kind of client is this" concepts that don't agree with each other.
- `status` vs `lifecycle_status` — both exist on `clients`, only `status` is
  read by the frontend, `lifecycle_status` is silently kept in sync by a
  trigger but never surfaced.
- Legacy/canonical table pairs (`client_business_details` vs
  `business_entities`, `document_request_templates` vs `document_templates`)
  — legacy ones are what's actually wired up today; canonical ones are
  empty and unused. Migrating live usage from legacy to canonical is
  unstarted, not "in progress."

## 3. Duplication report

| Concept | Legacy (currently used) | Canonical (unused, empty) | Recommendation |
|---|---|---|---|
| Business entity details | `client_business_details` | `business_entities` | New business-detail UI should target `business_entities`; do not add more fields to the legacy table. No existing frontend code writes to `client_business_details` today (confirmed by grep), so there's no live migration burden yet — this is a clean cutover, not a hard one. |
| Document request templates | `document_request_templates` / `document_request_template_items` | `document_templates` / `document_template_versions` / `document_template_fields` | No frontend code reads either pair today (confirmed by grep) — build the document template editor against the canonical tables from scratch; nothing to migrate. |
| Client "kind" | `client_type` (3 values, still written for backward compat) | `account_type` (7 values, what the UI actually uses) | Already reconciled in `ClientModal.tsx` via a derive-on-write shim (documented inline in the code). ~15 other files still branch on `client_type === "business"` directly — those keep working because the shim keeps `client_type` populated correctly, but a full migration to reading `account_type` everywhere is still open. |
| Client lifecycle status | `status` (what's read/written everywhere) | `lifecycle_status` (silently synced by trigger, never read) | Contract's status registry (§6.1) assumes `lifecycle_status`-style values including `prospect`, which the live `status` constraint doesn't allow. Needs an explicit decision, not just documentation — see Implementation Plan. |
| Storage bucket for client documents | `firmflow-client-documents` | — | **Resolved this session** — renamed in place to `verexahq-client-documents`, 0 objects existed so no data migration was needed. |

## 4. Security report

Full detail in `VEREXAHQ_CLAUDE_CODE_HANDOFF.md`. Summary:

**Fixed this session:**
- 5 client-contract RPCs had a residual `PUBLIC` execute grant (functionally
  equal to `anon` access) despite the contract claiming it was revoked —
  closed, `authenticated`-only now.
- 9 worker/financial/maintenance RPCs had the same residual `PUBLIC` grant
  gap — closed, `service_role`-only now.
- `encrypt_sensitive_text`/`decrypt_sensitive_text` had an **explicit**
  `anon` grant (not just inherited) — closed. Not an active exploit (the
  functions take the key as a parameter rather than fetching one
  server-side), but a real violation of the contract's own "encryption
  functions remain server-side" rule.

**Verified correct, no action needed:**
- `client_identity_vault` (SSN/EIN/ITIN storage): zero table grants for
  `authenticated`/`anon`, RLS restricted to `service_role`, all 5 vault RPCs
  correctly `authenticated`-only with no `anon`, internal function bodies
  actually enforce auth + permission + rate-limit + reason-length + audit
  logging (traced line by line, not just grant-checked).
- `contacts`/`account_contacts`/`client_tags`/`client_tag_assignments`: raw
  table grants include `anon` SELECT, which looks alarming at a glance, but
  the RLS policies underneath (`user_has_workspace_access`,
  `can_staff_write`) correctly key off `auth.uid()` and reject unauthenticated
  callers — verified by simulating an anonymous request against the actual
  policy logic, not just reading the policy text.
- `clients` table INSERT/UPDATE/DELETE policies (`can_staff_write`) and the
  chain of triggers on `clients` (7 total, found and read in full — audit
  logging, plan-limit enforcement, business-write-status enforcement,
  write-permission enforcement, status-field sync) all behave as intended
  for the one real account in the database, verified by simulating the
  exact authenticated request server-side.

**Not yet checked, flagged for next pass:**
- Internal authorization logic inside the 14 canonical RPCs beyond grants —
  only `get_identity_vault_value`'s logic was fully traced (last session,
  found and fixed a real bug in it). The other 13 have confirmed grants but
  unverified internal permission checks.
- RLS policies on the newly-confirmed canonical tables (`business_entities`,
  `document_templates` and friends, `platform_backend_contract`,
  `platform_canonical_statuses`) — existence confirmed, policies not yet
  read.
- Whether the Supabase project's dashboard-level settings (display name,
  API settings) have any drift from the intended configuration beyond the
  display-name issue noted below — not checked, no tool access to Supabase
  project-level (non-database) settings in this session.
- Vercel environment variables — could not verify they point only at
  `euxfopzgdmlmgcmmjvic` and not the do-not-use legacy ref
  (`aewqbffscdrziiwfomyf`); no Vercel MCP connector was available in this
  session to check. Needs manual confirmation or a future session with that
  connector enabled.

**Known, not fixable from here:** the Supabase project's dashboard display
name is still "FirmFlow CRM" per the contract doc — this is a project-level
setting with no SQL or API path found; needs to be changed manually in the
Supabase dashboard.

## 5. Implementation plan

Given the PRD describes a multi-quarter SaaS platform (workflow engine,
automation, e-signatures, Smart Forms, Communication Center are each
substantial subsystems on their own), this is not a single-session build.
Proposed sequencing, following the PRD's own Phase 0/1 boundary:

**Phase 0 (mostly done this session):**
- ✅ Repository audit (this document)
- ✅ RLS/grant security pass on the newly-discovered canonical RPCs
- ✅ FirmFlow branding elimination in application code
- ✅ Storage bucket rename
- ⬜ Decide `status`/`lifecycle_status` and `client_type`/`account_type`
  once and for all — recommend keeping `status` and `account_type` as the
  single sources of truth (they're what's actually wired up), formally
  deprecating the others, since redoing the reverse would touch far more
  files
- ⬜ Fix broken routes — not yet audited page-by-page for dead buttons or
  incomplete states; PRD §1.2 explicitly forbids "static demo pages with
  buttons that do not complete real database actions," worth a dedicated
  pass before adding new surface area

**Phase 1 candidates, in an order that minimizes rework:**
1. Nav/IA reconciliation (PRD §4.1) — cheapest, unblocks everything else
   being findable
2. Service Workspace as a real object (PRD §7) — the biggest structural
   gap; other Phase 1 items (documents, billing linkage) plug into it
   rather than the other way around
3. Document requests with a real catalog + status lifecycle (PRD §9.2)
4. Communication Center reconciliation — first confirm whether `/messages`
   already uses `secure_message_threads`/`secure_messages` or needs
   rewiring, before building more on top of either
5. Billing linkage to Service Workspaces (PRD §13.3)

**Explicitly not recommended to start yet:** Workflow Engine/Automation
Recipes (PRD §8) and Smart Forms (PRD §10) are large enough, and depend
enough on Service Workspaces existing first, that starting them before
item 2 above would very likely mean rebuilding them once the Service
Workspace shape is settled.

## 6. Deployment report

- `npm run typecheck` and `npm run build` both pass clean as of this
  commit.
- All schema/grant changes this session applied via `apply_migration`
  directly to the live project and mirrored into
  `supabase/migrations/20260721090000_close_public_execute_gaps_and_rename_bucket.sql`
  for the repo's history.
- No new environment variables introduced.
- Not yet verified: a live click-through of the app as an authenticated
  user — this session has no browser/login access to the deployed app (same
  limitation noted in every prior session). Vercel deployment status for
  this commit has not been checked (no Vercel connector available this
  session — see Security Report).
