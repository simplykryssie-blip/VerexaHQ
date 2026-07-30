# Verexa Tax Office

A secure tax-office operations platform for independent preparers, EROs, tax offices, and service
bureaus. Verexa currently tracks e-file statuses and external tax-software references — it does not
transmit tax returns.

This app is **independent** from the root `VerexaHQ` app in this repository. It has its own
`package.json`, its own environment variables, and connects only to its own Supabase project
(`aewqbffscdrziiwfomyf`). Nothing here reads from, writes to, or shares types with the root app or its
Supabase project (`euxfopzgdmlmgcmmjvic`).

## Stack

Next.js 14 (App Router) · TypeScript (strict) · Tailwind CSS · hand-authored shadcn/ui-style
components · Supabase (`@supabase/ssr`) · React Hook Form + Zod · TanStack Table/Query · Recharts ·
date-fns · Lucide icons.

## Setup

```bash
cd apps/verexa-tax-office
npm ci
cp .env.example .env.local   # fill in the Supabase values below
npm run dev
```

### Required environment variables

```
NEXT_PUBLIC_SUPABASE_URL=https://aewqbffscdrziiwfomyf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon/publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service role key — server-only, never sent to the browser>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The anon key is safe to use client-side — every read/write goes through the signed-in user's session
so Postgres Row Level Security stays active. The service-role key is only ever meant to be used from
secure server-side code (none of the code in this initial build uses it yet).

### Deferred provider variables

These are documented for later and never block normal navigation. Every dependent feature shows an
explicit "not connected" state instead of failing.

```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
RESEND_WEBHOOK_SECRET=
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_USER_ID=
ZOOM_WEBHOOK_SECRET_TOKEN=
```

## Regenerating types

Database types live in `types/database.ts`, generated from the live `aewqbffscdrziiwfomyf` project.
Regenerate after any schema change — never hand-edit this file:

```bash
supabase gen types typescript --project-id aewqbffscdrziiwfomyf > types/database.ts
```

## What's built so far

**Foundation:** Supabase browser/server clients, session-refresh middleware, sign-in/sign-up/forgot-
password/reset-password, email confirmation handling, workspace resolution (single workspace
auto-selects, multiple workspaces show a chooser, cookie-persisted selection), a role-aware app shell
(collapsible sidebar, mobile nav, workspace switcher, header search/notifications/help/user menu), and
unauthorized/suspended/trial-expired/error/not-found states.

**Onboarding:** a 10-step flow (welcome → workspace type → business info → professional role → office
structure → branding → services → team setup → trial plan → completion) that creates a real workspace,
owner membership, professional profile, starter services, and a trialing subscription.

**Core operations:** dashboard (real Supabase views), leads (table + pipeline, add/edit, convert to
client), clients (search/filter/sort/paginate, create, detail with Overview/Contacts/Services/
Engagements/Notes/Intake/Documents/Tasks/Activity tabs), households (create, add/remove members,
primary taxpayer/spouse/dependents), services, tax engagements (list, creation wizard, detail with
status changes and activity history), and a work queue (all-office / my-assignments views).

**Intake organizers** (`/intake`, `/intake/[submissionId]`): assign a published form template
(system or workspace-owned) to a client via the `assign_form_to_client` RPC; a dynamic renderer
(`features/intake/organizer-form.tsx`) reads `form_sections`/`form_fields`/`form_conditions`/
`form_calculations` for the submission's template version and renders every seeded `component_type`
(text/textarea/number/currency/percentage/date/year/email/phone/yes_no/single_choice/dropdown/
multiple_choice/address/acknowledgment/calculation/heading/paragraph/divider/file_upload/signature
placeholder), evaluates `form_conditions` for show/hide, autosaves answers to `intake_answers`
(800ms debounce), and manages three kinds of repeatable data: `intake_household_people` for the
seeded "dependents" section, `intake_repeatable_entities` (keyed by the section's
`settings.entity_type`) for employer/K-1/rental/investment/property-sale/foreign-account/
estimated-payment/tax-notice/education/childcare sections, and plain `intake_answers` for every
other field. A progress bar tracks visible-required-field completion client-side; `submit_intake`
is the only path that transitions a submission out of `in_progress`, and any validation errors it
returns are shown inline. Staff review (`review` tab) drives `begin_intake_review`,
`review_intake_section` (per-section pass/fail/needs-clarification), `request_intake_clarification`
/ `resolve_intake_clarification`, `complete_intake_review`, `approve_and_lock_intake`,
`reopen_intake` (reason required), `validate_intake_submission`, `evaluate_intake_compliance`, and
`generate_intake_document_request` — every transition goes through these RPCs, never a direct
`intake_submissions` status update. `intake_submission_revisions` and `intake_answer_history` back
the History tab; `intake_income_sources`/`intake_deductions_credits` are shown as a staff
reconciliation checklist (document-received tracking), not written by the client-fill form itself.

**Compliance** (`/compliance`, `/compliance/[id]`): cases (`compliance_cases`) with type/risk-level/
status/assignment/due date, an unresolved-flag count banner, per-case flags (`compliance_flags`)
with resolution notes, and checklists (`compliance_checklists`/`compliance_checklist_items`) with
add-item and pass/fail/needs-clarification/not-applicable results. No RPC exists for compliance in
the live schema, so these are direct RLS-scoped writes (staff roles only — verified below).

**Documents** (`/documents`, plus the client detail page's Documents tab): multi-file upload straight
to the private `tax-client-documents` bucket at `{workspace_id}/{client_id}/{uuid}-{filename}`,
category/custom-label/tax-year/visibility/notes, an access-log row on every upload/download/review
action, download via a 5-minute signed URL (never a public URL — the bucket is not public and the
app never calls `getPublicUrl`), staff review (approve/reject/request-replacement), archive/restore/
soft-delete, and version replacement (uploads a new `documents` row with `replaces_document_id` +
incremented `version_number`, flips the old row to `is_latest_version=false`/`status=replaced`).

**Document requests** (`/document-requests`, `/document-requests/new`, `/document-requests/[id]`): a
wizard that builds a request against a client (+ optional engagement), can start from a
`document_request_templates` template (none are seeded yet, but the picker and
`document_request_template_items` copy-in path are wired) or blank, with per-item category/label/
description/required flag/min-max file counts/tax year; draft-or-send-now on create; detail page
shows progress, lets staff accept/reject/request-replacement/waive-with-reason per item, and send/
cancel the request.

**Tasks** (`/tasks`, `/tasks/[id]`, plus client/embeddable creation): my-tasks/team-tasks scope,
list/board/calendar views (`date-fns`-driven month grid), priority and inline status changes,
comments with a `client_visible` flag (see limitation below), and creation from the client detail
page as well as the standalone Tasks page.

## Known simplifications in this pass

- The engagement wizard covers client/household/tax year/return type/engagement type/jurisdiction/
  staff assignment/priority in one screen rather than the full multi-step wizard.
- The work queue currently has a table view only; kanban/calendar/deadline views are not yet built.
- The engagement detail page's "More" tab (Documents/Document Requests/Tasks/Billing/Signatures/
  E-file History scoped to one engagement) is still a placeholder — Phase 3's explicit scope was the
  client tabs; workspace-wide Documents/Tasks/Document Requests pages already support filtering, and
  documents/tasks can be linked to an engagement from those pages.
- `tasks`/`task_comments` RLS (`is_workspace_member(workspace_id)`, staff-only, no client-portal path)
  has no client-facing read path today — the `client_visible` flag on comments is forward-looking for
  the Phase 7 client portal, not yet enforced by a portal policy. Verified live below.
- `intake_income_sources`/`intake_deductions_credits` are a staff-maintained reconciliation view
  (which declared items have a supporting document yet), not auto-populated from the dynamic form —
  there's no trigger or RPC in the live schema that derives them from `intake_repeatable_entities`.
- Compliance has no RPC in the live schema (only the 12 intake RPCs the spec named), so case/flag/
  checklist mutations are direct RLS-scoped table writes gated to staff roles, not RPC calls.
- "Client organizer experience" and "client document-request upload view" are built as shared,
  RLS-correct components (any authenticated user who passes `can_access_intake_submission`/
  `can_access_document`/etc. can use them) but are only mounted under the staff app shell in this
  pass — a client never gets a login of their own yet. Wiring the same components under a
  `/portal` layout with real client-portal auth is Phase 7 work; nothing about the components
  themselves needs to change for that.
- Client-list pagination is client-side over the filtered result set (fine at normal client-list sizes;
  server-side pagination is a reasonable follow-up for very large workspaces).

## Not yet built

Secure messages, notifications, calendar/appointments, billing/invoices/payments, signatures, return
release, e-file tracking, templates (management UI), workflows, team management, workspace
relationships, reports, settings, subscription management, audit logs, and the client portal. These
follow the same phased plan and the same no-mock-data standard as everything above.

## Backend additions made during this build

**Phase 1/2** (see `supabase/migrations/` for the exact SQL):

1. **`create_workspace_with_owner` RPC.** `workspace_members`' INSERT policy requires
   `has_workspace_role(workspace_id, ['owner','admin'])`, which only checks *existing* membership rows —
   so a brand-new workspace's first member could never be inserted under RLS. This one
   `SECURITY DEFINER` function (same pattern as the project's existing `has_workspace_role`/
   `is_workspace_member` helpers) creates a workspace owned by `auth.uid()` and inserts exactly one
   `owner` membership row for that same user. Verified live against real RLS with a throwaway
   authenticated session before being used in the app.
2. **Seeded `subscription_plans`.** This table existed with zero rows; `workspace_subscriptions.plan_id`
   is `NOT NULL`, so onboarding had nothing valid to reference. Seeded three baseline plans (solo /
   office / bureau) as data — no schema change.

**Phase 3:** none. Every intake/compliance/document/document-request/task table, enum, RPC, storage
bucket, and RLS policy the frontend uses already existed live — nothing was added, no duplicate
tables were created, and no backend logic was replaced with frontend state.

## Testing

Automated tests aren't in place yet for this pass. RLS was verified live (not just read) for Phase 3
using a throwaway fixture — two workspaces, an owner + a preparer in workspace A, a portal-linked
client in each workspace, and one row in each of `intake_submissions`/`intake_answers`/`tasks`/
`documents`/`compliance_cases`/`document_requests` — driven through `SET ROLE authenticated` +
simulated JWT claims (never an RLS bypass), then fully deleted afterward. Results:

- **Owner/admin** (workspace A owner): read access to every Phase 3 record in their own workspace;
  zero visibility into workspace B's client.
- **Staff/preparer** (workspace A preparer, non-owner): identical read access to the owner across
  intake/tasks/documents/compliance/document-requests, and successfully inserted a compliance case
  (role-gated capability confirmed working, not just "member sees everything").
- **Cross-workspace isolation** (workspace B owner): zero rows returned for any of workspace A's
  intake submissions, tasks, documents, compliance cases, or document requests; saw only their own
  workspace's client and could not see workspace A's client at all.
- **Client portal user** (`clients.portal_user_id` match): could read their own intake submission,
  their own document, and their own document request; could **not** read `tasks` (0 rows — confirms
  the staff-only limitation above), could **not** read `compliance_cases` (0 rows — by design), could
  not see `workspace_members` (no staff-roster leakage), and could not see workspace B's client. A
  direct `insert into tasks` as the client was **rejected by RLS** (`new row violates row-level
  security policy`). The same client **could** insert their own `intake_answers` row — confirming the
  fill-experience write path actually works under RLS, not just under the owner/service role.
- Confirmed via `grep` across the app: the only Supabase Storage call is `createSignedUrl` (5-minute
  expiry) in `features/documents/documents-table.tsx` — `getPublicUrl` is never called, and
  `tax-client-documents` is a non-public bucket.
- Confirmed via `grep` across the app: every write to `intake_submissions`'s lifecycle goes through
  `supabase.rpc(...)`; the only direct `.from("intake_submissions")` calls in the codebase are
  `.select(...)` reads.
