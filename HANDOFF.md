# Session Handoff — 2026-08-31

Written for whichever Claude session picks this project up next. Read this
first before touching anything. For how the system is actually built
(schema, auth, permissions, every module), see `PLATFORM.md` in this same
repo root — that's the living architecture reference; if it disagrees with
production, trust production and fix that file. This file is "what
happened recently and what's still open," and it fully replaces the
previous version (dated 2026-08-13), which had gone stale — several things
it listed as "not started" (the Website/Funnel builder, the Learning Hub)
had since been built without the file being updated. Don't trust anything
below past its own date either; verify against the live app/DB before
assuming.

## Orientation

- Repo: `simplykryssie-blip/VerexaHQ`, branch `claude/verexa-remove-services-vaqbfx`.
  Confirm this is still the active branch before starting work — branch
  names have changed between sessions before.
- Supabase project: `daxpavvsotvsyqqntddc`. One live database shared by
  every branch/deployment — a DB migration applies immediately everywhere;
  a code change does not go live until deployed.
- Vercel project: `verexa-tax-office-v2` (team `verexa-hq-crm`), live
  domain `verexahq.com`.
- Every DB change in this session went through `apply_migration` (Supabase
  MCP) *and* got a matching file under `supabase/migrations/` committed to
  git — keep doing both together, not one or the other, so the migration
  history and the live schema never drift apart.
- Standard hygiene before every commit this session: `tsc --noEmit`,
  `eslint` on the touched files, and a full `npm run build`. Keep doing
  all three, not just the type check.

## Standing policies (still in force)

- **Workspace-purpose split**: **Verexa HQ CRM** is the sandbox for test
  pipelines/workflows/clients/templates. Named real firm workspaces (MKB
  Financial Group LLC, etc.) hold real production data — treat with normal
  care, don't alter without being asked for that specific thing.
- **Demo workspaces** (`workspaces.is_demo`): **Summit Tax & Financial
  Services** (`b41f7ee8-e811-4d4d-8156-5ebf43014462`, PTIN demo, cloned
  from MKB's live config) and **Ascend Tax Office**
  (`b53cc047-e1dd-4a6e-92f4-88b3c37f48af`, ERO demo, formerly "Demo - ERO
  Office") are both freely rebuildable for demo purposes — reachable from
  the sidebar's Demo Workspace switcher. K. McCullens
  (`94161e3f-ce7e-4626-8d0d-abef5350cf7c`) owns both.
- **No preloaded/system-default content anywhere** except Services (a
  fixed, hardwired, fully-editable starter list) — don't restore seed data
  elsewhere without being asked again.

## What's built (this session, grouped by area — not exhaustive line-by-line)

**Tax prep pipeline & automations**: full post-conversion prep pipeline
(5 stages), status-tag lifecycle across the pipeline, ERO Review
escalation + decline path with its own disengagement email, Missing Info
reminder chain with explicit Yes/No branches, staff presence/identity
attestation before in-person signing, real relationship-manager
auto-assignment on new clients, client auto-assignment engine
(`client_assignment_mode`/`client_assignment_staff_pool` on `workspaces`).

**Client/engagement redesign**: every major page redesigned to the current
design system (Dashboard, Clients/Engagements detail, Review Queue,
Messages, Pipelines, Workflows, Websites/Funnels, Templates, Calendar,
Documents, Tax Office, Reports, Learning Hub, Settings, Platform Admin) —
see git log for the full page-by-page list, all under one push.

**Websites/Funnels & Learning Hub**: both are fully built now (contrary to
the previous handoff's "not started" note) — drag-and-drop page builder
with live preview, custom domain hosting, page-level SEO/CSS/JS, and a
learning hub with course/module content for ERO/SB-connected staff.

**Billing & payments**:
- Stripe Connect (OAuth + direct account creation) for a firm to accept
  client payments — fully built, just needs real Stripe API keys (see Open
  items below).
- Manual payment recording now captures `payment_method` (stripe/check/
  cash/bank_transfer/other), distinct from the pre-existing
  `payment_method_id` FK used for saved Stripe cards.
- Verexa's own platform subscription plans (`platform_subscription_plans`:
  Solo/Team/Firm) and a real prepaid usage-overage billing system (one-time
  free bucket + monthly Stripe charge for email/SMS/storage overage) —
  replaced an earlier arrears-billing attempt per explicit correction.
- **New this session: platform-wide card-on-file + pre-cycle dunning.**
  Previously billing-failure handling was 100% reactive (Stripe auto-
  charges on the renewal date, runs its own Smart Retries, Verexa only
  suspends once Stripe marks a subscription "unpaid"). Now: a Setup
  Checkout flow collects a saved card (`workspace_subscriptions.
  default_payment_method_id` + cached brand/last4/exp), an in-app modal
  (`BillingCardPrompt`, gated by `needs_billing_card` RPC) prompts for a
  card once a workspace is responsible for its own billing with none on
  file, and an hourly cron (`/api/cron/check-billing-cycles`, using true
  America/Chicago calendar dates) reminds at 5 days out, attempts an
  off-session charge at 3 days out (final retry at day 0, credited to the
  Stripe customer's balance rather than double-charging on the real
  renewal invoice), and suspends the workspace if nothing succeeded once
  the cycle ends — independent of how long Stripe's own retries would
  otherwise take. See `app/api/cron/check-billing-cycles/route.ts` and
  `lib/stripe/subscriptionWebhooks.ts` for the full mechanism.
  **Not yet exercised against a real Stripe subscription** — no workspace
  currently has a live `workspace_subscriptions` row with a real
  `stripe_customer_id`, so none of this has fired for real traffic yet.

**ERO/PTIN firm hierarchy** (`firm_connections` table, pre-existing but
extended heavily this session):
- Real invite/accept flow (`/join?token=...`) and ERO-side oversight
  (Tax Office page's cross-workspace return/notice/extension rollup,
  branding/billing takeover toggles) already existed.
- **Fixed a real bug**: the connected-partner name lookup (both directions
  — ERO seeing a PTIN's name, PTIN seeing their ERO's name) went through a
  plain embedded select that only resolves if the viewer happens to also
  be a member of the other workspace (true for the demo accounts sharing
  one owner, false for any real separately-owned pair) — would silently
  show "Pending invite"/"your ERO" for a genuinely active connection. Fixed
  with two new `SECURITY DEFINER` RPCs, `get_ero_connected_partners` and
  `get_my_ero_connection`.
- **New: Partners directory** (`/partners`, nav-gated to workspaces with at
  least one `ero_ptin` connection) — a dedicated area (separate from the
  Contacts tab) showing each connected PTIN's business contact info
  (pulled live from their own Firm Profile) plus a free-text notes field
  the ERO maintains privately (`firm_connections.notes`).
  - Full ERO recruiting/onboarding pipeline built for the Ascend Tax
    Office demo: an "ERO Partnership Application" organizer (package
    picker, Yes/No "already on Verexa?" branch with a conditional
    follow-up field), a signature-required "ERO Partnership Agreement"
    engagement letter, a 7-stage recruiting process, and 7 stage-triggered
    automations. **Deliberately human-in-the-loop, not fully automatic**,
    for two real engine limitations: the condition system can't branch on
    a specific organizer answer's value (only a fixed enumerated field
    list), and `create_engagement`/`send_engagement_letter`'s automation
    actions only work on an `organizer.submitted`-triggered run with a
    resolved service — a mechanism with zero real production usage before
    this, unsafe to lean on further under time pressure. Staff drag the
    card / send the contract manually at those points.

**Settings consolidation**: Connections merged into Users & Staff — one
page, one nav item (`/settings/users`). `/settings/connections` now
redirects there (preserving `?token=`) rather than 404ing, since nothing
external links to it directly but it was still a plausible bookmark.

## Carried over from the previous handoff, NOT reverified this session

These were open/blocked as of 2026-08-13 and nothing in this session
touched them — don't assume either way, check current state before acting:

- **Zoom OAuth**: was fully built and configured correctly on Verexa's
  side but blocked on Zoom's own platform (their consent-screen API call
  itself 403ing). Needed the user to contact Zoom Developer Support
  directly. Unknown if resolved.
- **Google/Outlook calendar sync**: fully built, but
  `GOOGLE_CALENDAR_CLIENT_ID/SECRET` and `MICROSOFT_CALENDAR_CLIENT_ID/
  SECRET` were blank in `.env.local.example`/Vercel. Unknown if real OAuth
  credentials have since been created and set.
- **Full mobile responsiveness pass**: only a grep-found subset of
  un-responsive grids were fixed as of 2026-08-13; a real pass (clicking
  through Clients, Engagements, Settings, and especially the Client Portal
  at a phone viewport) was never done. Unknown if this has happened since.

## Open / next steps

1. **Real Stripe keys still need to be added** — both the platform
   subscription keys and the Stripe Connect keys (`STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`, and the Connect
   webhook secret) into Vercel's environment variables. The user asked for
   instructions on how to do this; nothing else is blocking it on the code
   side — Connect OAuth, the checkout/webhook flows, and the new billing
   dunning system are all built and just waiting on real keys. Until then,
   `isStripeConfigured()` gates every Stripe call off cleanly (no crashes,
   just skipped).
2. **Meeting with her IT person about system monitoring** — mentioned
   once early in a prior session, never followed up. Still open.
3. **Minor, not requested**: no "record a payment" action exists directly
   on the top-level Billing hub (`/billing`) — only per-invoice, from a
   Client or Engagement page. Low priority, only worth doing if it's
   actual friction.
4. No other known gaps as of this session. If picking this back up, ask
   the user what's next rather than assuming — she drives this by
   describing real usage friction, not a pre-written roadmap.
