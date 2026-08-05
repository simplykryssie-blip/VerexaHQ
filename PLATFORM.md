# VerexaHQ Platform Design Authority

This is the single source of truth for how VerexaHQ is actually built today.
It replaces a set of older root-level docs (README, audit/gap/completion
reports, a "Canonical Backend Contract", a Bolt import guide) that were
removed because they described a different, disconnected codebase — a
different Supabase project (`euxfopzgdmlmgcmmjvic` vs. the real
`daxpavvsotvsyqqntddc`), a different table naming scheme
(`workspace_members`, `workspace_brand_profiles`, `tax_organizer_templates`),
and features (Payroll, Bank Import, Stripe Checkout, Bolt packaging) that
never existed in the code that actually ships from this repo. If you find a
claim below that production disagrees with, trust production and fix this
file, not the other way around.

Repo: `simplykryssie-blip/VerexaHQ` · Branch: `claude/verexa-tax-office-v2-mhd9mo`
Supabase project: `daxpavvsotvsyqqntddc` · Stack: Next.js 14 App Router, `@supabase/ssr`

## Authentication

Session handling is cookie-based via `@supabase/ssr`: `lib/supabase/client.ts`
(browser), `lib/supabase/server.ts` (RSC/route handlers), `lib/supabase/middleware.ts`
(refreshes the session on every request; `middleware.ts` at the repo root wires it in).

- **Sign up** — `/login` (sign-up mode) collects first/last name, firm name,
  email, password. `supabase.auth.signUp` with `emailRedirectTo` pointing at
  `/auth/confirm`; shows a "check your email" screen rather than redirecting
  immediately.
- **Email verification** — `/auth/confirm` (`app/auth/confirm/route.ts`)
  exchanges the PKCE `code` (or legacy `token_hash`+`type`) for a session,
  then redirects to `next` (defaults to `/dashboard`; `(app)/layout.tsx`
  redirects to `/onboarding` if the user has no workspace yet).
- **Login** — email/password with a Remember Me checkbox.
- **Forgot/reset password** — `/forgot-password` calls
  `resetPasswordForEmail` with `redirectTo` set to `/auth/confirm?next=/reset-password`,
  reusing the same code-exchange logic instead of duplicating it. `/reset-password`
  just calls `updateUser({ password })` once the session from that exchange exists.
- **Change password** — Settings → Security has a dedicated form
  (`ChangePasswordForm.tsx`) calling `updateUser({ password })`, separate
  from the workspace-wide security *policy* form on the same page.
- **Logout** — `POST /api/auth/sign-out`.
- **Remember Me** — the installed `@supabase/ssr` (0.12.4) hardcodes a
  400-day cookie `maxAge` on every session-cookie write and ignores any
  `cookieOptions.maxAge` override (confirmed by reading `node_modules/@supabase/ssr/dist/main/cookies.js`
  directly — the library always does `{...cookieOptions, maxAge: DEFAULT_COOKIE_OPTIONS.maxAge}`,
  with its own default *last* in the spread). Working around that: a
  companion `sb_remember` cookie is set by `/api/auth/set-remember` after
  login — `"persistent"` with a long `maxAge` if checked, `"temporary"`
  with **no** `maxAge` (a true browser-session cookie) if unchecked.
  Middleware signs the user out if it finds a valid Supabase session but no
  `sb_remember` cookie at all, which only happens once the temporary marker
  has died from the browser closing. Email-link flows (verification, reset,
  invitations) don't offer the choice and default to persistent.
- **Staff invitations** — `workspace_invitations` (email, role, token,
  status, expiry) plus three RPCs: `create_workspace_invitation` (admin-only,
  upserts the pending invite for that email/workspace pair rather than
  duplicating it), `accept_workspace_invitation_by_token` (verifies the
  caller's auth email matches, then upserts into `workspace_users`), and
  `get_invitation_preview` (deliberately callable by `anon` — it's the only
  way for someone without an account yet to see "you've been invited to
  join `<workspace>` as `<role>`" before they sign up). This exists because
  the older `invite_workspace_user` RPC requires the invitee to already have
  an account, which doesn't cover the common case of inviting someone new.
  UI: Settings → Users (invite form + pending list with revoke) and the
  public `/accept-invitation?token=...` page.
- **Protected routes** — `PUBLIC_PATHS` allowlist in `lib/supabase/middleware.ts`
  (`/login`, `/auth/confirm`, `/forgot-password`, `/accept-invitation`, ...);
  everything else requires a session, and `(app)/layout.tsx` additionally
  requires a workspace.
- **Role-aware authorization** — enforced at the database layer via RLS
  policies calling `has_permission(workspace_id, key)`, `is_workspace_admin(workspace_id)`,
  and `is_workspace_member(workspace_id)`. The frontend does not yet
  duplicate these checks to hide UI a user can't act on (a UX gap, not a
  security one — RLS is the actual enforcement boundary regardless of what
  the UI shows).

## Workspace Provisioning

`/onboarding` calls the `create_workspace` RPC after email verification,
then upserts the owner's `user_profiles` row from their signup metadata
(first/last name, firm name). The RPC is the transactional boundary — it's
one database call, not client-orchestrated multi-step provisioning, so
there's nothing on the frontend that can leave a half-created workspace
behind.

## Executive Experience

The Dashboard exists to answer exactly three questions: *Am I making
money? Is anything urgent? What should I work on next?* Everything else —
trends, breakdowns, historical comparisons — belongs in Reports, not the
Dashboard. If a future change makes the Dashboard show a chart or a
multi-column breakdown, that's a sign the Dashboard rule has been broken;
move it to a report and link to it instead.

### Dashboard philosophy

`/dashboard` (`DashboardShell.tsx`) renders a role-scoped set of widgets in
admin-configured order. It computes six KPIs (Revenue This Month, Open
Engagements, Tasks Due Today, Outstanding Invoices, Missing Documents,
Open Client Messages), a rule-based Today's Priorities list, a Review
Queue, Quick Actions, a compact Calendar, and Recent Activity — all from
`lib/dashboard/data.ts`, one consolidated `Promise.all` per load, live
Supabase data only. Every KPI widget that has a corresponding report links
to it via "View report →"; KPIs with no report yet (Tasks Due Today, Open
Client Messages) simply don't render a link rather than pointing at
nothing.

### Today's Priorities: rule-based, not AI

`lib/dashboard/priorities.ts` scores overdue tasks, review-queue items
flagged `Overdue`/`Exceeded` by the existing `v_workflow_sla_status` view,
overdue invoices, and tasks due today, by a fixed weight table (more
overdue = higher weight within a category; categories are pre-ranked).
Every ranking is explainable from its inputs — there's no model involved.
If this is ever replaced by an AI-generated summary, the replacement should
still return `PriorityItem[]` so `PrioritiesWidget` doesn't need to change.

### Widget Engine

Reuses `dashboards`/`dashboard_widgets` — tables that existed from an
earlier phase but were empty and read by nothing. `dashboard_widgets.widget_type`
has a CHECK constraint that already encoded a widget taxonomy
(`revenue`, `collections`, `missing_documents`, `messages`, `todays_work`,
`review_queue`, plus reserved-for-later values `returns_due`,
`signatures_pending`, `staff_workload`, `client_health`, `compliance`) —
extended (not replaced) with `quick_actions`, `calendar`, and
`recent_activity` to cover the sections the Dashboard needed. `lib/dashboard/widgets.ts`
maps that same vocabulary to components.

`ensure_default_dashboard(workspace_id)` idempotently seeds one
`is_default` dashboard per workspace with the 10 implemented widget types,
called on every dashboard load (cheap no-op once seeded — no migration or
trigger needed on `create_workspace`). Widgets support:
- **Hide/show** — `dashboard_widgets.is_visible`.
- **Reorder** — `display_order`, changed via up/down buttons (no drag-and-drop
  library added for this).
- **Role/module/workspace-type visibility** — `dashboard_widgets.config`
  (jsonb) is reserved for this; nothing populates it yet because no widget
  currently needs per-role variation beyond the admin-only customize gate.

One real constraint to know: `dashboard_widgets`'s RLS ties INSERT/UPDATE/DELETE
to `is_workspace_admin`, not the viewing user. So today "widgets must
support hide/show/reorder" means an admin configures the layout for the
whole workspace, not that each person has their own personal layout — the
`role_slug` column on `dashboards` was clearly designed for role-specific
variants, but only one `role_slug = null` ("everyone") dashboard is seeded
today.

### Reports philosophy

Reports are the analytics center; the Dashboard is the decision center.
The engine (`components/reports/`) is generic and reusable —
`ReportLayout`, `FilterBar` (URL-param-driven date range + search, so
`/reports/financial?filter=outstanding` from a dashboard widget link is
just a report opening pre-filtered — no separate "deep link" mechanism
needed), `SortableTable` (client-side sort over server-fetched rows),
`ExportButtons` (CSV via `papaparse`, "Excel" as the same CSV since Excel
opens it natively — no `.xlsx` writer added, labeled honestly as CSV — and
"PDF" via the browser's own print dialog with a `print:hidden` layout
class hiding filter chrome, not a generated PDF file), and
`SimpleBarChart` (a dependency-free inline SVG bar chart — no charting
library added for the one chart the engine needed so far). Saved filters
are per-browser (`localStorage`, `lib/reports/savedFilters.ts`) rather than
a new workspace-shared table, since nothing else in the schema models
"saved views" to reuse and no report yet needs presets shared across a
team.

`lib/reportCategories.ts` now lists all 8 requested categories (Revenue,
Clients, Engagements, Billing, Documents, Staff, Compliance, Growth).
**Two are fully wired** end-to-end (permission-gated via `has_permission`,
live data, sortable/searchable/exportable): `/reports/financial` (revenue
by month + invoice/collections table) and `/reports/documents` (see
Document Center below — now five tab-switched sub-reports on live request
data, not an estimate). The other 6 stay honest `ComingSoon` shells — the
sprint asked for the engine, not every report, and building six more real
reports without real per-category data questions answered first would mean
guessing at what each should show.

## Document Center

A shared `DocumentWorkspace` component (`components/documents/`) replaces
the old flat "list of file names" Documents tab on both the Client and
Engagement Workspaces — same tabs (Overview, Files, Requests, Signatures,
Activity), same folder tree, same upload/preview/bulk-action UI, for
either entity, because the mission required "every client and engagement
should expose the same document experience." Nothing in either workspace's
existing data model changed shape; `attachments` (the pre-existing
universal-attachments table) was extended in place with `folder_id`,
`is_favorite`, `is_archived`, `visibility`, `replaces_attachment_id`,
`is_latest_version`, `is_locked`, and a reserved, currently-empty
`ai_metadata jsonb` column — no new documents table.

### Folder templates and auto-provisioning

`document_folders` holds the actual per-engagement/per-client folder tree
(self-referencing `parent_folder_id`). `document_folder_templates` +
`document_folder_template_items` follow the exact global-template
convention already used by `services`/`engagement_types`/
`document_request_templates`: `workspace_id = null` rows are the shipped
system templates every workspace sees, workspace-owned rows are firm
customizations. Five system templates are seeded (1040 Individual Return,
Bookkeeping, Payroll, Business Formation, Compliance) matching the
mission's own folder lists. `services.document_folder_template_id` links a
service to a template; `trg_apply_document_folder_template` (`AFTER INSERT
ON engagements`) walks the template with a recursive CTE and clones it into
real `document_folders` rows for the new engagement, preserving
parent/child structure via a runtime id-map — the same "auto-provision on
creation" shape as the rest of the workspace-provisioning engine, just
scoped to one engagement instead of one workspace.

### Document Requests: the missing instance layer

The template table (`document_request_templates`) already existed; there
was no table tracking an actual request sent to an actual client and
whether it had been fulfilled. `document_requests` (title, due date,
status) + `document_request_item_statuses` (per required/optional item,
pending/uploaded/waived) is that instance layer. `create_document_request`
seeds the item statuses from a template atomically; a trigger
(`check_document_request_completion`) flips the parent request to
`completed` the moment its last required item is fulfilled — so "missing
documents," "overdue requests," and "completion %" are all read directly
off live rows, not estimated by comparing unrelated counts.

### Signature Center — scope and honest limits

`signature_requests` + `signature_request_signers` model pending →
signed/declined → completed, multiple signers, and an automatic document
lock (`attachments.is_locked = true`, set by `record_signature()` once
every signer has signed). This is **not** a DocuSign/HelloSign integration
and there is **no public client-facing signing link** — building either
means either a paid e-sign provider or the (explicitly out-of-scope)
Client Portal. What exists is a staff-recorded capture: a staff member
types the signer's full name to confirm a signature obtained in person or
through another channel (`signature_type = 'typed'`; `'drawn'` is modeled
in the schema for a future canvas-signature capture but no UI captures it
yet). Treat this as an internal record-keeping tool, not a legally
self-service e-signature flow.

### Activity feed integration, not a new feed

Three new trigger functions (`record_attachment_activity`,
`record_document_request_activity`, `record_signature_activity`) write to
the existing `activity_log` table — the curated, human-readable feed
already rendered by the Client/Engagement Workspace Timeline tabs — using
the **parent** entity's `entity_type`/`entity_id` (e.g., a document
uploaded to an engagement logs against that engagement, the same
convention `record_engagement_created()` and friends already use). Upload,
archive, restore, rename, and delete events, request-created events, and
signed/declined events all surface in Timeline for free. No new activity
table, no new feed component.

### Document Center hub (`/documents`) — operational only

Five stat cards (pending requests, missing documents, overdue requests,
pending signatures, storage used) plus pending-requests / pending-
signatures / recent-uploads lists, all workspace-wide, all live queries,
each linking to `/reports/documents` for the analytical breakdown. Per the
mission's own rule for this page ("nothing analytical belongs here"), two
items the brief asked for have no honest home yet and were deliberately
left out rather than faked: **"pending review"** (there is no
document-level review-status field anywhere in the schema — only
engagement-level `review_status`) and **"recently viewed"** (no
view-tracking exists on `attachments`). Both would need new schema, which
this pass's brief explicitly forbade ("Do not redesign the database").

### `/reports/documents` — five tab-switched reports

Missing Documents, Upload Activity, Signatures, Storage, and Request
Completion, switched via a `?report=` query param on one route (same
`ReportLayout`/`FilterBar`/`SortableTable`/`ExportButtons` engine as
`/reports/financial` — no new export mechanism). The old version of this
report page approximated "missing documents" by comparing unrelated counts
(requested-via-template vs. uploaded, with no row-level link between
them); it's been replaced with a query against the real
`document_requests`/`document_request_item_statuses` rows, so the number
is now exact, not an estimate.

## Email / SMS Infrastructure

Two provider-agnostic send paths, both gated by `lib/providerStatus.ts`
(`isEmailConfigured()` / `isSmsConfigured()` / `isStripeConfigured()` —
purely env-var presence checks) so an unconfigured environment degrades to
`{ sent: false, reason: "... not configured" }` instead of throwing:

- **Email** — `lib/email/resend.ts` calls Resend's HTTP API directly via
  `fetch` (no SDK dependency). `lib/email/template.ts` is the one shared
  branded HTML wrapper every email should render through. Five named system
  sender identities live in `SYSTEM_SENDERS`
  (`noreply`/`support`/`billing`/`notifications`/`team@verexahq.com`) — real
  once the `verexahq.com` domain is verified in Resend and `RESEND_API_KEY`
  is set; `EMAIL_FROM_ADDRESS` overrides all of them with one address if
  you'd rather keep it simple. `POST /api/email/send` is the generic
  authenticated endpoint; `POST /api/invitations` sends the invite email
  directly server-side rather than round-tripping through it.
- **SMS** — `lib/sms/twilio.ts`, same `fetch`-based pattern, `POST /api/sms/send`.
- **Status** — `GET /api/provider-status` reports which of email/SMS/Stripe
  are actually configured, for any settings UI that wants to show it.
- **Per-workspace sender customization** — `branding` has
  `email_from_name`, `support_email`, `business_email`, and now also
  `reply_to_email`, `billing_email`, `notification_email` for firms to
  override display name/reply-to on outgoing mail. Not yet wired into the
  send path — the columns exist, the read side doesn't yet.
- **Wired to real UI** — the Client Workspace's "Send Message" action has
  had a channel picker (portal/email/SMS/internal) since Epic 4, but
  selecting email or SMS only ever wrote a row to `messages` — it never
  actually called Resend or Twilio. That's fixed: choosing email/SMS there
  now also fires `/api/email/send` / `/api/sms/send` to the client's
  `primary_email`/`primary_phone`. The equivalent modal on the Engagement
  Workspace still only logs the message — not yet updated to match.

None of the Resend/Twilio code has live credentials in this environment.
It's real, callable, production-shaped code; it has not been exercised
against an actual Resend or Twilio account. As of the Backend Completion
sprint below there **is** a scheduler (`/api/cron/dispatch-notifications`
+ `vercel.json`), but nothing yet enqueues Appointment Reminder, Workflow
Notification, or Billing Reminder jobs into `notification_queue` — the
dispatcher has something to drain now, the triggers that would populate it
for those three use cases still don't exist. Only the client-notification
send path above is reachable from the UI today.

## Backend Completion Sprint (Epic 6)

A backend-only pass to close every remaining gap between the schema and
the mission's Epic 6/Tax Office/Client Portal/Reporting requirements,
with no new frontend. Full inventory, gap analysis, and what got built are
in the sprint's own certification report (delivered in chat); this section
covers the durable architecture decisions.

### Notification Dispatcher

`notification_queue` existed but nothing drained it. `/api/cron/dispatch-notifications`
(Vercel Cron, every 5 minutes per `vercel.json`, gated by a `CRON_SECRET`
bearer check) now does: for `channel = 'Email'`/`'SMS'` jobs, looks up the
matching `email_templates`/`sms_templates` row by `template_key` (workspace
row first, global fallback), renders it through the new
`lib/templates/render.ts` `{{merge.field}}` substitution (the piece that
was missing — `merge_fields` columns existed, nothing read them), sends via
the existing Resend/Twilio helpers, and logs to `email_log`/`sms_log`.
`In-App`/`Portal`/`Push` channels have no external provider, so reaching
dispatch is itself success — the row is the delivery surface until a
notifications inbox reads it directly. Retry/dead-letter reuses the
existing `status`/`attempts` columns (`max_attempts` added) rather than a
separate queue: on failure, `scheduled_at` is bumped by
`attempts * 5 minutes` and the row stays `pending`; once `attempts >=
max_attempts` it flips to `failed` — that combination *is* the dead
letter, no new status value needed. The same route also promotes
"Scheduled Messages" out of `draft_saves` (`draft_type = 'message'`,
payload holds `thread_id`/`body`/`scheduled_at`) into real `messages` rows
once due — reusing the existing drafts table instead of adding scheduling
columns to `messages`/`message_threads`.

### Webhook logging, retry, and provider status

New `webhook_events` table (provider/event_type/external_id/payload/status/attempts/last_error)
logs every inbound Stripe/Resend/Twilio webhook — the Stripe webhook route
previously processed events with zero persisted record of having received
them. New `/api/resend/webhook` and `/api/twilio/webhook` routes verify
signatures by hand (svix HMAC-SHA256 for Resend, HMAC-SHA1 for Twilio),
exactly mirroring the pre-existing hand-rolled `verifyStripeSignature` —
no provider SDKs added — and update `email_log`/`sms_log` with real
delivery/open/bounce status (`delivered_at`, `opened_at`, `open_count`,
`bounced_at`, `failed_reason` columns), closing the "Delivery Status" /
"Open Tracking" gap.

New `provider_status` table (one row each for `email`/`sms`/`stripe`,
platform-wide — these are our own vendor credentials, not a per-workspace
setting) is written by `record_provider_check()`, called from every real
send/webhook path via `lib/providerHealth.ts`. That RPC's `EXECUTE` grant
is service-role only — it has no per-caller authorization concept of its
own (unlike every `has_permission`-gated RPC elsewhere), so it's called via
the service-role client rather than the caller's session, the same
privilege tier the Stripe webhook route already used for its writes.
`GET /api/provider-status` still reports live env-var configuration; it
doesn't yet read this new table, which tracks *health* (recent
success/failure streaks) rather than just presence.

### Client Portal backend

The portal had document/messaging/billing tables to read from but no
identity: `client_portal_users` tracked *invitations*, never linked to a
real signed-in principal. It's the deliberate boundary `clients`'s own
comment already stated ("clients never become staff and staff never
become clients") that made this a new identity, not a reuse of
`workspace_users`/`roles`. Added: `client_portal_users.user_id` (→
`auth.users`, populated once someone accepts), `invitation_token` +
`token_expires_at`, and `invite_portal_user`/`accept_portal_invitation`/`get_portal_invitation_preview`
RPCs mirroring `create_workspace_invitation`/`accept_workspace_invitation_by_token`
line for line. `is_portal_user(client_id)` and
`is_portal_user_for_entity(entity_type, entity_id)` are the one shared RLS
building block every portal policy below uses — same shape as
`is_workspace_member`, scoped to a client instead of a workspace.

Additive portal RLS policies (never replacing the existing staff
policies) now cover: `attachments` (client-visible, non-archived, own
entity) + the `client-documents` storage bucket, `document_requests` +
`document_request_item_statuses`, `signature_requests` +
`signature_request_signers`, `message_threads` + `messages` (portal can
open a thread and post, never see `is_internal` messages), `invoices` /
`quotes` / `payments` / `client_ledger` (read-only), `activity_log`, and
`irs_notices`. Rather than duplicate `record_signature`/`decline_signature`/`fulfill_document_request_item`
into `portal_*` copies, all three were extended in place to accept a
portal caller (signer email match + `is_portal_user_for_entity`) alongside
the existing staff `has_permission` check — one signing/fulfillment code
path for both audiences.

**Tax Organizers are now the actual Portal Organizer API.** New
`organizer_responses` + `organizer_response_answers` tables are the
missing instance layer under `organizer_templates`/`organizer_fields`
(exactly the same template-vs-instance shape as
`document_requests`/`document_request_item_statuses`) — a client can now
read and fill in their own organizer from the portal, and
`submit_organizer_response()` accepts either a staff caller or the portal
user themselves, but only ever sets `status = 'submitted'`; moving it to
`'reviewed'` has no portal-writable policy, so that step stays staff-only.

No portal frontend was built this pass — this is the backend those pages
will call.

### Tax Office backend gaps

`engagement_tax_details` (one-to-one satellite on `engagements`, same
"module-agnostic core + satellite" pattern as `client_addresses`/etc.)
adds `tax_year`, `return_type`, `is_amended`/`original_engagement_id`,
`is_extended`/`extension_filed_date`/`extension_due_date`, and
`efile_status` (`not_filed → ready_to_file → transmitted →
accepted`/`rejected`, or `paper_filed`) — none of which existed anywhere
before. New `irs_notices` table uses the same polymorphic
`entity_type`/`entity_id` convention as `notes`/`attachments`, so a notice
can hang off a client or a specific engagement, and a new
`record_irs_notice_activity()` trigger surfaces it in the existing
Timeline for free (same integration decision as the Document Center's
activity triggers). "Reviewer Queue" (`v_reviewer_queue`), "Engagement/Return
Statuses" (the existing 12-state status engine), and "Service Packages" /
"Default Folder Templates" / "Default Request Templates" were already
built in earlier phases and needed no changes.

### Reporting backend

Every table already has a queryable PostgREST API gated by its own RLS —
that was already true for all 8 report categories before this pass. Two
new `security_invoker` views (matching every other `v_*` view's
convention) were added because they're genuine multi-table aggregations,
not just gaps in table access: `v_staff_productivity` (open engagements,
tasks completed/overdue, pending reviews per staff member — reusing
`v_reviewer_queue` rather than re-deriving pending-review counts) and
`v_tax_season_metrics` (return volume/e-file status/extensions/open IRS
notices by tax year, built on the two tables above). No new report pages
were built — these views exist for whichever future report reads them.

## Billing

Schema (Epic 4): `engagement_pricing`, `quotes`, `change_orders`, `invoices`,
`payment_methods`, `payments`, `recurring_billing`, `client_ledger`, all
workspace-scoped with RLS via `billing.view`/`billing.manage`/`billing.refund`.
Quote/invoice numbering is advisory-lock-protected per-workspace-per-year.
Triggers cascade a payment into the invoice's paid status and a
`client_ledger` entry automatically. Frontend: the Billing tab on both the
Client Workspace and Engagement Workspace, plus Quick Actions to create a
quote or invoice.

**Stripe** (`lib/stripe/client.ts`, fetch-based, no SDK, gated by the same
`isStripeConfigured()` pattern as email/SMS):
- `POST /api/stripe/checkout-session` creates a Checkout Session for an
  invoice's remaining balance and stores the URL on `invoices.stripe_checkout_url`;
  a "Get payment link" button (`components/PaymentLinkButton.tsx`) on any
  unpaid invoice in both workspaces calls it.
- `POST /api/stripe/webhook` verifies the signature itself (HMAC-SHA256 per
  Stripe's documented scheme, implemented directly — no SDK) and, on
  `checkout.session.completed`, inserts a `payments` row. That alone is
  enough to update the invoice status and post the `client_ledger` entry,
  because it reuses the existing `apply_payment_to_invoice` trigger rather
  than duplicating that logic.
- `POST /api/stripe/refund` calls Stripe's refund API, then reverses the
  invoice's `amount_paid`/status and posts a matching `client_ledger` debit
  — there's no existing trigger for refunds (only for payments), so this
  path does that bookkeeping itself, mirroring the sign convention the
  payment trigger already established.
- Payment Plans and automatic payment-receipt emails are not built — the
  schema (`recurring_billing`) and email infrastructure both exist, but
  nothing generates a recurring schedule or sends a receipt yet.

No `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` in this environment — none
of this has been exercised against a real Stripe account.

## Sensitive Data Masking

More complete than it might look from the frontend: `clients` stores
`ssn_encrypted`/`ein_encrypted`/`itin_encrypted` (bytea, via
`encrypt_client_secret`), a `*_last4` column for masked display, and a
`*_hash` column used only for duplicate-client detection (`create_client`
matches on SSN/EIN hash before creating a new record). Revealing a value
goes through `reveal_client_ssn`/`reveal_client_ein`/`reveal_client_itin`,
each of which checks a dedicated permission (e.g. `identity.ssn_reveal`)
and writes a `warning`-severity `audit_log` row on every reveal. The
`clients.create` form now collects these optional fields, and the Client
Workspace Overview tab shows them masked with a permission-gated Reveal
button (`TaxIdReveal.tsx`) — before this pass the backend existed but
nothing in the UI could capture or view them.

## Security

- RLS is enabled on every application table; policies gate on
  `has_permission`/`is_workspace_admin`/`is_workspace_member` scoped to
  `workspace_id`, which is how multi-tenant isolation is actually enforced
  (not application-layer filtering).
- `audit_trigger_fn` fires on insert/update/delete for the tables that need
  an audit trail, writing to `activity_log`.
- SECURITY DEFINER trigger/RPC functions that shouldn't be directly
  callable over PostgREST have `EXECUTE` revoked from `public`/`anon`/`authenticated`
  as they're added; `get_invitation_preview` is the one deliberate exception
  and is documented as such above.
- SSN/EIN/ITIN are encrypted at rest with permission-gated, audit-logged
  reveal — see "Sensitive Data Masking" above. (This was previously
  documented here as unimplemented; that was wrong — the backend existed,
  it just had no frontend surface. It does now.)
- Service-role keys and Stripe/Resend/Twilio secrets are server-only env
  vars, never exposed under `NEXT_PUBLIC_*`. The one exception,
  `app/api/stripe/webhook/route.ts`, deliberately uses the service-role key
  server-side because Stripe's webhook call has no user session to
  authenticate with — it substitutes signature verification instead.

## Deployment

Single Next.js app at the repo root (a legacy v1 app and a disconnected
scaffold were previously consolidated/removed from this same repo — see the
note at the top of this file). Single Supabase project
(`daxpavvsotvsyqqntddc`); `.env.local.example` was pointing at a different
project ID until this pass and has been corrected. Vercel builds are
triggered by pushes to this branch through Vercel's own git integration. A
Vercel MCP connector is attached to this session and shows as connected,
but no callable Vercel tools are actually exposed here — a deploy cannot be
triggered on demand or a deployment URL fetched from this session; check
the Vercel dashboard after a push lands.

## Testing

No automated test suite (unit or E2E) exists yet. What actually gets run
before anything is considered done:

- `tsc --noEmit` and `next build` after every change.
- Supabase security + performance advisors after every migration, with
  findings either fixed or explicitly noted as intentional (e.g. the one
  `anon`-callable RPC above).
- Targeted SQL smoke tests (`DO $$ ... $$` blocks that create, assert, and
  clean up a real scenario) for new schema/RPCs — used for the billing
  cascade, task dependencies, and the invitation create/preview/accept path.
- No scripted browser E2E exists. Manual click-through has covered the core
  flows as they were built; there is no regression suite guarding against
  breaking them later.

## UX Standards

- **Toasts** — `components/Toast.tsx`, a `ToastProvider`/`useToast()`
  context mounted once in `(app)/layout.tsx`, `aria-live="polite"` region,
  auto-dismiss after 5s plus a manual close button. Wired into the
  dashboard's widget hide/reorder controls and the Stripe payment-link
  button so far — not every mutation in the app calls it yet.
- **Loading states** — Next.js `loading.tsx` route segments (not client-side
  spinners) for `/dashboard`, `/reports/financial`, `/reports/documents`,
  rendering `components/Skeleton.tsx`'s pulsing placeholders while the
  server component's data fetch is in flight. Other routes still show
  Next.js's default blank-until-ready behavior.
- **Empty/error states** — `components/EmptyState.tsx` (existing, reused
  everywhere new this pass) for empty results; report permission checks
  render it with an explicit "you don't have permission" message rather
  than an empty table.

## Accessibility Standards

Applied to everything built this pass, not retrofitted across the whole
app: every widget is a `<section aria-labelledby>`; icon-only buttons
(hide/show/reorder, toast dismiss, export) all carry `aria-label`; the
sortable table has a `<caption className="sr-only">` announcing row count
and real `<th scope="col">` headers; the bar chart has `role="img"` with a
generated text description instead of being purely visual; a "Skip to main
content" link (`sr-only focus:not-sr-only`) was added to the app shell
targeting `<main id="main-content">`; report/print output hides filter
chrome via Tailwind's `print:` variant rather than a separate print
stylesheet. This was not run as a full contrast/screen-reader audit across
every existing page — it's the standard applied going forward, not a
retroactive guarantee.

## Workspace Provisioning gaps

`create_workspace` (see above) covers Workspace, Owner Membership, Roles
(shared system roles, not per-workspace copies), Permissions (same),
Brand Profile, and enabling every `is_core` feature flag. Services,
engagement types, and document-request templates are all
workspace-`null` global templates every workspace already sees without
needing a copy. A trigger (`audit_workspaces`) logs the creation to
`activity_log` automatically. `dashboards`/`dashboard_widgets` were empty
and unwired as of the previous pass; they're now the live Dashboard/Widget
Engine (see Executive Experience above). One item on the sprint's checklist
still has no backing at all: there's no `notification_preferences` table
anywhere in the schema (only `notification_queue`, which is a log, not a
settings surface). Building it is real feature work, not something an
audit-and-fix pass should invent unasked.

## Frontend Completion Sprint (Version 1.0)

Scope: finish the frontend against the backend certified in the prior
Backend Completion Sprint. Explicit constraint honored throughout: no new
tables/triggers/RPCs/queues except where a verified backend bug was found
(one case — see below). Everything reads/writes live Supabase data; no
mock data anywhere.

- **Client Portal, built from zero to a full app.** `lib/portal.ts`
  (`getPortalIdentity()`) mirrors `lib/workspace.ts` but resolves against
  `client_portal_users`, never `workspace_users` — portal users are a
  distinct identity track sharing one Supabase Auth backend. Path-aware
  middleware (`lib/supabase/middleware.ts` branching on
  `pathname.startsWith("/portal")`) gives the portal its own
  login/redirect flow. Pages: `/portal/login`,
  `/portal/accept-invitation` (mirrors the staff flow but against
  `get_portal_invitation_preview`/`accept_portal_invitation`),
  `/portal/dashboard`, `/portal/engagements[/[id]]`, `/portal/documents`,
  `/portal/messages`, `/portal/billing` (+ `PortalPayButton`, which calls
  the *existing* `/api/stripe/checkout-session` route unmodified — RLS
  already scopes it to the caller's own invoice), `/portal/organizer[/[id]]`,
  `/portal/notifications`, `/portal/profile`, `/portal/activity`. The
  biggest architectural win of this sprint: portal documents, requests,
  and signatures reuse the exact staff components (`DocumentWorkspace`,
  `RequestsPanel`, `SignaturesPanel`) via a new optional
  `audience?: "staff" | "portal"` prop (default `"staff"`) that hides
  staff-only creation UI and adjusts copy — zero duplicate document/e-sign
  UI was written for the portal.
- **`fulfill_document_request_item` gap closed.** This RPC existed in the
  backend since the prior sprint but no frontend ever called it.
  `RequestsPanel.tsx` now has a real per-pending-item "Upload" control
  (staff and portal both) that uploads to storage, inserts the
  `attachments` row, and calls the RPC.
- **Communications Hub.** One reusable `MessagingHub` component
  (`components/messaging/MessagingHub.tsx`), parameterized by `audience`,
  used at both `/messages` (staff, cross-workspace inbox) and
  `/portal/messages` (portal, RLS-auto-scoped) — no separate portal
  messaging UI. Handles unread counts, marking read, internal-vs-client
  notes, and (portal only) starting a new thread against the client
  entity.
- **Tax Office Experience**, new `/tax` hub with 6 tabs (Returns,
  Reviewer Queue, IRS Notices, Extensions, Tax Years, Preparers) reading
  `engagement_tax_details`, `irs_notices`, `v_reviewer_queue`, and
  `v_tax_season_metrics`/`v_staff_productivity`. Added a "Tax" tab to the
  Engagement Workspace (`TaxDetailsCard` + `IrsNoticesPanel`, both new,
  both reused as-is from the engagement level).
  `v_reviewer_queue` gained an `engagement_id` column (migration
  `v_reviewer_queue_add_engagement_id`) so the queue can link back to its
  engagement — the one schema change this sprint made outside of the bug
  fix below, and it's additive to an existing view, not a new object.
- **Reports**, the remaining 6 category pages built out: Clients,
  Engagements, Billing (quotes only — invoices/payments stay under
  Revenue), Staff Productivity, Compliance, Growth. Compliance is
  intentionally gated on `is_workspace_admin` rather than the
  `compliance.view` permission key, because the underlying
  `compliance_*_view`s' own RLS restricts to admins regardless of that
  permission grant — the page gate matches what the data actually allows.
- **Settings**, 3 new pages: Templates (email/SMS/engagement-letter, with
  a shared `TemplateStatusCycle` draft→published→archived control reused
  across all template tables plus `services`), Service Packages, and
  Feature Flags (`set_feature_flag` RPC, previously never called from any
  frontend).
- **Mobile-responsive shell**, applied app-wide, not just to new pages:
  `Sidebar`/`PortalSidebar` became fixed off-canvas drawers with a
  hamburger toggle and auto-close on navigation; `SettingsNav` becomes a
  horizontal scrolling tab bar below `lg:`; `MessagingHub` and
  `DocumentWorkspace`/`FolderTree` stack their two-panel layouts vertically
  on narrow screens instead of squeezing side-by-side; `InlineAddForm`
  (used everywhere in the app, not just new code) switched its field grid
  to one column below `sm:`.
- **Verified backend bug found and fixed via SQL smoke testing, not user
  report**: `messages.read_at` (added in the prior Backend Completion
  Sprint) had no RLS `UPDATE` policy at all — staff had
  `messages_write`/`messages_select`/`messages_delete` only, portal had
  `messages_portal_select`/`messages_portal_insert` only. The new
  `MessagingHub`'s mark-as-read call was silently affecting zero rows
  (Postgres doesn't error an `UPDATE` that matches nothing). Fixed with
  migration `messages_read_receipt_update_policy`, adding `messages_update`
  (staff, gated on `has_permission(workspace_id, 'messages.view')`) and
  `messages_portal_update` (portal, gated on
  `is_portal_user_for_entity` against the parent thread) — scoped
  identically to the existing select policies. Re-verified with an
  isolated insert/update/assert smoke test after applying.
- **Accessibility**: spot-checked (not a full audit) the newest
  components — icon-only controls have visible text or `aria-label`,
  form labels use `htmlFor`, interactive elements carry
  `focus:ring`/`focus:border` styles consistent with the rest of the app.
  No screen-reader or contrast audit was run.
- **Performance**: not addressed this sprint. New report/tax/portal
  pages fetch full unpaginated result sets, matching the pre-existing
  pattern elsewhere in the app — real work, not attempted here.

## Known gaps going into beta

- Resend domain verification, GoDaddy DNS (SPF/DKIM/DMARC), a live Stripe
  account, and a live Twilio account — all require credentials/dashboard
  access this session doesn't have. The integration code for all three
  exists and degrades gracefully without them.
- Frontend permission-gating (hiding actions a role can't perform) beyond
  RLS enforcement itself.
- Automated test coverage.
- No pagination/infinite scroll/loading skeletons on the new report, tax
  office, and portal pages — they fetch full unpaginated result sets, same
  as the rest of the app. Fine at current data volumes, a real risk at
  scale.
- No Appointments feature anywhere in the app (nav, portal, or backend) —
  there's no backing table, so it wasn't attempted rather than half-built.
- Organizer `file_upload` and `signature` field types render a short
  redirect note ("use Documents"/"use Signatures" instead) rather than an
  inline widget — a deliberate simplification, not a full implementation.
- Settings → Service Packages creates a `services` row wired to *existing*
  pricing rules, billing rules, organizer templates, document-request
  templates, folder templates, and engagement-letter templates via
  dropdowns; it does not create those sub-objects themselves.
- No per-workspace `notification_preferences` (which events a user wants
  and on which channel) — `notification_queue` now has a real dispatcher
  (see Backend Completion Sprint), but nothing yet enqueues appointment,
  workflow, or billing reminder jobs into it; only the client-notification
  send path is wired to fire on demand today.
- Payment Plans (recurring billing) and automated payment-receipt emails.
- The engagement-level "Send Message" modal logs but doesn't dispatch
  email/SMS yet (the client-level one does, as of this pass).
- Per-user dashboard personalization — today's hide/show/reorder is
  workspace-wide and admin-managed (see Widget Engine), not per person.
- Signature Center has no third-party e-sign provider integration —
  in-app typed-name signing only, and no *public*, unauthenticated
  signing link (a signer must be a staff user or an authenticated portal
  user).
- Notification Dispatcher templates must exist as a `published`
  `email_templates`/`sms_templates` row matching the job's `template_key`
  before a queued job can send — nothing seeds these automatically for the
  new reminder/notice use cases this pass didn't wire up triggers for.
- `provider_status` tracks live health from real send/webhook attempts;
  `GET /api/provider-status` (used by any settings UI) still only reports
  env-var presence and hasn't been switched to read the new table.
- No OCR, auto-classification, duplicate detection, or AI metadata
  extraction on documents — `attachments.ai_metadata` is reserved but
  unpopulated, per this pass's explicit instruction not to implement AI yet.
- Office documents (Word/Excel/PowerPoint) have no inline preview — PDF,
  images, and text files preview inline; everything else downloads.
- No document-level review-status field, so the Document Center hub has no
  "pending review" card; no view-tracking on `attachments`, so it has no
  "recently viewed" card.
- No true drag-and-drop widget reordering (up/down buttons only) and no
  `.xlsx` export (CSV, which Excel opens natively) — both deliberate
  scope calls to avoid adding a new dependency for one feature.
- Toasts, skeletons, and the accessibility fixes above are applied to what
  was built this pass and a couple of existing components they touch —
  not swept across every pre-existing page.
- Manual QA this pass was a code-level route/link/permission audit, not a
  live click-through in a browser (no browser tool available in this
  session).
