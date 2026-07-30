# Verexa Tax Office

A secure tax-office operations platform for independent preparers, EROs, tax offices, and service
bureaus, with a companion client portal. Verexa currently tracks e-file statuses and external
tax-software references — it does not transmit tax returns.

This app is **independent** from the root `VerexaHQ` app in this repository. It has its own
`package.json`, its own environment variables, and connects only to its own Supabase project
(`aewqbffscdrziiwfomyf`). Nothing here reads from, writes to, or shares types with the root app or its
Supabase project.

See also: [`ARCHITECTURE.md`](./ARCHITECTURE.md) (how it's built and why), [`DEPLOYMENT.md`](./DEPLOYMENT.md)
(shipping it), [`DEVELOPMENT.md`](./DEVELOPMENT.md) (local setup, conventions, common tasks).

## Stack

Next.js 14 (App Router) · TypeScript (strict) · Tailwind CSS · hand-authored shadcn/ui-style
components · Supabase (`@supabase/ssr`) · React Hook Form + Zod · TanStack Table/Query · date-fns ·
Lucide icons.

## Setup

```bash
cd apps/verexa-tax-office
npm ci
cp .env.example .env.local   # fill in the Supabase values below
npm run dev
```

See [`DEVELOPMENT.md`](./DEVELOPMENT.md) for the full local setup walkthrough (Supabase project access,
seeding a portal test user, running the checks). `.env.example` lists every variable the app reads,
including the deferred provider credentials described below.

The anon key is safe to use client-side — every read/write goes through the signed-in user's session
so Postgres Row Level Security stays active. The service-role key (`SUPABASE_SERVICE_ROLE_KEY`) is
server-only and is used in exactly three places, each gated by an authorization check against the
caller's own session before it's touched: `/api/team/invite`, `/api/portal/invite`, and
`/api/portal/sign/*` (see [`ARCHITECTURE.md`](./ARCHITECTURE.md#service-role-usage)).

## Regenerating types

Database types live in `types/database.ts`, generated from the live `aewqbffscdrziiwfomyf` project.
Regenerate after any schema change — never hand-edit this file:

```bash
supabase gen types typescript --project-id aewqbffscdrziiwfomyf > types/database.ts
```

## What's built

**Foundation (Phase 1):** Supabase browser/server clients, session-refresh middleware, sign-in/sign-up/
forgot-password/reset-password, email confirmation handling, workspace resolution, a role-aware app
shell (collapsible sidebar, mobile nav, workspace switcher, header search/notifications/help/user
menu), and unauthorized/suspended/trial-expired/error/not-found states.

**Onboarding:** a 10-step flow that creates a real workspace, owner membership, professional profile,
starter services, and a trialing subscription.

**Core operations (Phase 2):** dashboard, leads (table + pipeline, convert to client), clients (search/
filter/sort/paginate, detail with Overview/Contacts/Services/Engagements/Notes/Intake/Documents/Tasks/
Activity tabs), households, services, tax engagements (creation wizard, detail, status/activity
history), and a work queue.

**Intake, compliance, documents, tasks (Phase 3):** a dynamic organizer form renderer driven entirely by
`form_sections`/`form_fields`/`form_conditions`/`form_calculations`, staff review workflow
(`begin_intake_review` → `review_intake_section`/clarifications → `complete_intake_review` →
`approve_and_lock_intake`/`reopen_intake`), compliance cases/flags/checklists, document upload with
signed-URL downloads and version replacement, document requests with per-item accept/reject/waive, and
a tasks module (list/board/calendar, comments).

**Messages, notifications, appointments (Phase 4):** secure per-client conversations with read
receipts and attachments (existing document or new upload), a workspace-wide notification center,
communication history (outbox + delivery events), and a Month/Week/Day/Agenda calendar built on
`appointments`/`appointment_types`/`staff_availability_rules`/`staff_blackout_periods`. Zoom is
optional — when no `zoom_meetings` row exists for an appointment, the UI shows "Zoom not connected"
and never fabricates a join link.

**Billing, signatures, return release, e-file (Phase 5):** invoices with line items, manual payment
recording and refunds, printable receipts, and outstanding-balance rollups (no payment processor —
`external_processor`/`external_invoice_id` columns exist for one, but nothing is wired to Stripe or
similar); e-signature requests with signing order, resend (auto-revokes the prior token via
`issue_signature_token`), signer-progress timeline, and a completion certificate
(`create_signature_certificate`); return-release gating (`evaluate_return_release` /
`release_completed_return`) that won't unlock until payment/signature/review requirements are met, with
an explicit non-transmission disclosure; e-file event tracking that only ever logs status history —
never a transmission action.

**Templates, workflows, team, relationships, reports, settings (Phase 6):** a generic template system
(forms, document requests, engagement letters, email/SMS/portal messages) with versioning and
publish/draft state; a workflow builder (nodes, connections, manual trigger, run detail with
steps/events/approvals/wait-states/automation-job outbox, and a personal "my approvals" queue); team
invites via the Supabase Admin API (gated by the caller's own owner/admin role, never exposed
client-side); workspace-to-workspace relationships (request/activate/cancel, matching the schema's
real source-only RLS — there is no accept/decline on the target side); reports (revenue, client growth,
task completion, engagements by status); office/branding/integrations/subscription settings; and a
read-only audit log viewer.

**Client portal (Phase 7):** a fully separate `/portal` surface with its own auth (`clients.portal_user_id`
or an active `client_contacts` row — never the staff `workspace_members` model), covering Dashboard,
Organizer (the same `OrganizerForm` component staff use, in client-fill mode), Documents, Document
Requests (with upload), Messages, Appointments (view-only — there is no client-insert policy on
`appointments`), Invoices (view-only, no online payment), Signatures (status/progress — see below for
why the actual signing page is separate and unauthenticated), Completed Returns (released engagements
and their client-visible documents), Notifications, and Profile (phone/contact method/mailing address
via the two portal-scoped `SECURITY DEFINER` RPCs built for exactly this).

Signing itself happens at a public, unauthenticated `/portal/sign/[token]` magic link, not inside the
authenticated portal: `redeem_signature_token` and `complete_signature` are both granted to
`service_role` only (not `anon`/`authenticated`), so the two `/api/portal/sign/*` routes broker the
whole flow server-side using the service-role client, gated purely by possession of a valid,
unexpired, unrevoked token — never a portal session. See
[`ARCHITECTURE.md`](./ARCHITECTURE.md#e-signature-magic-links) for the full mechanics.

Portal users can never reach: internal notes on any record, `tasks`/`compliance_cases`/
`compliance_flags`, `audit_logs`, `workspace_members` (no staff-roster leakage), or any other
workspace's data — enforced by RLS, and spot-checked live (see Testing below).

## Known simplifications

- The engagement wizard is a single screen rather than a full multi-step wizard.
- The work queue has a table view only; kanban/calendar/deadline views are not built.
- The workflow builder is a structured list-based node/connection editor, not a drag-and-drop visual
  canvas (no canvas/graph library is installed).
- `intake_income_sources`/`intake_deductions_credits` are a staff-maintained reconciliation checklist,
  not auto-derived from the dynamic form — there's no trigger or RPC in the live schema for that.
- Compliance has no RPC in the live schema, so case/flag/checklist mutations are direct RLS-scoped
  table writes gated to staff roles.
- Portal "Completed Returns" shows every client-visible document on a released engagement — there is
  no dedicated "final return" document category/flag in the schema to filter on more narrowly.
- Portal Signatures is a status/progress viewer only (no document preview or download) — the
  `signature-documents` storage bucket's RLS only grants read access to workspace members, so an
  authenticated (non-token) portal session cannot fetch a signed URL for it. The actual signing
  experience — where the document *is* shown — is the separate magic-link flow described above.
- Client-list pagination is client-side over the filtered result set.

## Deferred integrations

The only things not wired to a real provider — by design, since no credentials exist yet:

- **Twilio** (SMS) — `settings/integrations` shows "Not Connected" until `TWILIO_*` env vars are set.
- **Resend** (email) — same pattern for `RESEND_*`.
- **Zoom** — appointments never fabricate a join link; `zoom_meetings` rows are created by an external
  integration this app doesn't implement yet.
- **A payment processor** — invoices/payments are recorded manually; `invoices.external_processor` /
  `payments.processor` columns exist for a future Stripe-style integration.
- **A tax-transmission integration** — e-file tracking is status logging only; Verexa never transmits
  returns.

Everything else in the product is real, live, and backed by the actual Supabase project — no mocked
data, no stubbed endpoints, no placeholder screens.

## Backend additions made during this build

**Phase 1/2:** `create_workspace_with_owner` RPC (workspace bootstrapping — see git history for the
exact SQL) and seeded `subscription_plans` (three baseline plans; no schema change).

**Phase 3 through Phase 8:** none. Every table, enum, RPC, storage bucket, and RLS policy the frontend
uses across intake, compliance, documents, messages, notifications, appointments, billing, signatures,
return release, e-file, templates, workflows, team, relationships, reports, settings, audit logs, and
the entire client portal already existed live in the schema before this work began. No tables were
duplicated, no RLS policy was bypassed, and no backend logic was reimplemented in the frontend.

## A real bug this build found and fixed

Live RLS verification (see Testing) surfaced a reproducible PostgreSQL/RLS interaction that predates
this work: `INSERT ... RETURNING` against `conversations`, `documents`, or `intake_submissions` fails
RLS for every caller — staff and portal alike — even when the caller is fully authorized. Each of
those three tables' SELECT policy resolves only through a self-referential access function
(`can_access_conversation(id)`, `can_access_document(id)`, `can_access_intake_submission(id)`) that
re-queries the same table by its own primary key; a row inserted by the current statement isn't yet
visible to that nested self-query, so PostgreSQL's RETURNING-time SELECT-policy check always fails.
Tables whose policy has a non-self-referential branch (`is_workspace_member(workspace_id)`,
`can_access_client_record(...)` — column-based or joined to a *different* table) are unaffected;
confirmed live for `invoices`, `tax_engagements`, and `intake_answers`.

This silently broke "start a new conversation" and "upload a document" for every user of the app.
Fixed at all 7 call sites by generating the row's `id` client-side (`crypto.randomUUID()`) and
skipping the chained `.select()` — the caller already knows the id it just inserted, so no RETURNING
round-trip is needed.

## Testing

Automated tests aren't in place yet. RLS is verified live against the real Supabase project using
`SET ROLE authenticated` + simulated JWT claims inside a transaction that is always rolled back —
never a permanent write, never an RLS bypass. This pass (Phase 4-8) additionally verified, for a
simulated portal client:

- Full read access to their own client record, intake submissions, documents, document requests,
  conversations/messages, appointments, invoices, and notifications.
- **Zero** rows returned for another client in the same workspace (cross-client isolation).
- **Zero** rows returned for `tasks`, `compliance_cases`, `compliance_flags`, `workspace_members`,
  `audit_logs`, and `signature_access_tokens` (the last is deny-all-by-policy-count — RPC only, even
  for staff).
- A legitimate write (inserting their own `intake_answers` row) succeeds under RLS.

Phase 3's original fixture (two workspaces, owner + preparer + portal client in each, one row per
core Phase 3 table) remains valid and is summarized in git history; its conclusions — cross-workspace
isolation, role-gated staff writes, no `getPublicUrl` usage anywhere in the codebase, and every
`intake_submissions` lifecycle transition going through an RPC rather than a direct status update —
were re-confirmed by grep during this pass.
