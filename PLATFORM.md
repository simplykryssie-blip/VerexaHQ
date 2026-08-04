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
against an actual Resend or Twilio account. **Nothing in the app triggers
Appointment Reminders, Workflow Notifications, or Billing Reminders
automatically** — there is no scheduler/cron in this stack, so those three
of the four SMS/email use cases the sprint asked to verify have no trigger
point at all yet, automated or manual. Only the client-notification path
above is actually reachable from the UI.

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

## Known gaps going into beta

- Resend domain verification, GoDaddy DNS (SPF/DKIM/DMARC), a live Stripe
  account, and a live Twilio account — all require credentials/dashboard
  access this session doesn't have. The integration code for all three
  exists and degrades gracefully without them.
- Client Portal — not started, explicitly deferred.
- Frontend permission-gating (hiding actions a role can't perform) beyond
  RLS enforcement itself.
- Automated test coverage.
- No per-workspace `notification_preferences`; no scheduler for
  appointment/workflow/billing reminders (see Email/SMS Infrastructure).
- Payment Plans (recurring billing) and automated payment-receipt emails.
- The engagement-level "Send Message" modal logs but doesn't dispatch
  email/SMS yet (the client-level one does, as of this pass).
- Per-user dashboard personalization — today's hide/show/reorder is
  workspace-wide and admin-managed (see Widget Engine), not per person.
- 6 of 8 report categories are still `ComingSoon` shells (Clients,
  Engagements, Billing, Staff, Compliance, Growth) — the engine exists,
  those specific reports don't yet.
- Signature Center is staff-recorded only — no e-sign provider
  integration, no public client-facing signing link (see Document Center).
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
