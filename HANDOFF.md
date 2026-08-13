# Session Handoff — 2026-08-13

Written for whichever Claude session picks this project up next, likely on
a different account. Read this first before touching anything. For how the
system is actually built (schema, auth, permissions, every module), see
`PLATFORM.md` in this same repo root — that's the living architecture
reference. This file is just "what happened recently and what's still open."

## Orientation

- Repo: `simplykryssie-blip/VerexaHQ`, branch `claude/verexa-tax-office-v2-mhd9mo`
  (this is the one real production branch — a separate exploratory branch,
  `claude/taxnitro-shell-sandbox`, was deleted by the user's explicit
  instruction and must never be recreated or referenced again).
- Supabase project: `daxpavvsotvsyqqntddc`. One live database shared by
  every branch/deployment — a DB migration applies everywhere immediately;
  a code change does not go live until deployed.
- Vercel project: `verexa-tax-office-v2` (team `verexa-hq-crm`), live domain
  `verexahq.com`.
- **Deploy gotcha, read this twice**: pushing to the branch only builds a
  *preview* deployment. Nothing goes live on verexahq.com until the user
  manually clicks "Promote to Production" in the Vercel dashboard — there is
  no MCP tool that can do this. After every push, tell the user it's built
  and waiting, and don't assume it's live until they confirm they promoted
  it. Multiple times this session the user tested against stale
  never-promoted or wrong (old preview) deployments, which wasted a lot of
  turns — when something "doesn't look right," check `list_deployments`
  for what's actually on `target: "production"` before assuming the code is
  wrong.

## Standing instructions from the user (still in force)

- **No preloaded/system-default content anywhere** — no starter templates,
  pipelines, automations, forms, organizers, emails, or SMS — **except**
  Services, which the user explicitly asked to be the one place with a
  fixed, hardwired list of preloaded, fully-editable starter content (see
  below). Do not restore seed data anywhere else without her asking again.
- **All data in the database is test data.** She does not care about
  preserving it. If a change requires deleting or altering rows in any
  workspace, just do it — no need to hedge about "other firms' data."
- Verexa is multi-tenant — other real workspaces exist in the same database
  beyond hers. Schema/RLS changes affect everyone; be correct, but don't
  need special permission to touch shared system-default rows.

## What changed this session, roughly in order

1. **Fixed a real production bug**: the `portal-invite-email` system email
   template had been deleted by an old cleanup migration, silently breaking
   every portal invite. Restored directly into the live DB.
2. **Fixed 7 call sites** that fired portal-invite/organizer-ready emails
   without checking whether the send actually succeeded — silent failures
   now surface a clear error with a shareable accept-link fallback.
   (`InviteContactToPortalButton.tsx`, `PortalInviteStatus.tsx`,
   `AddForms.tsx`, `NewClientButton.tsx`, `NewEngagementForm.tsx`,
   `QuickActions.tsx`.)
3. **Rebuilt Services** (`app/(app)/settings/services/`) from a
   card-gallery "create your own from scratch" page into a hardwired
   toggle list: 6 fixed system-default services (Individual Tax, Business
   Tax, Amendments & Corrections, Extensions, IRS Resolution, Tax
   Planning), each seeded with its own process + 6-stage starter pipeline.
   Staff flip a switch to clone one into their workspace (reuses the
   existing `duplicate_config_object` RPC) or add a custom service that
   gets the identical wiring. Added `services.cloned_from_service_id` to
   track which fixed service a workspace's copy came from (needed for the
   toggle to know its own state). Pricing/billing/category dropped
   entirely from this surface — those rules still work at engagement
   creation and invoicing, just not attached to a service anymore. No more
   Details/Stages/Board tab click-through — one scrolling page. Old
   `/service-packages` route deleted outright, not left as a redirect.
4. **Fixed a systemic horizontal-scroll bug**: `overflow-y-auto` without
   `overflow-x-hidden` at the two root layout wrappers every page shares
   (`app/(app)/layout.tsx`'s `<main>`, `app/(app)/settings/layout.tsx`'s
   content div) forces browsers to also compute `overflow-x: auto` per
   spec. Fixed at the root, not per-page.
5. **Moved Zoom's connection card from Firm Profile to Settings →
   Integrations**, and fixed the actual bug behind "Connect Zoom does
   nothing": both `/api/zoom/connect/start` and `/api/zoom/connect/callback`
   redirected to `/settings/my-account` on success *and* error, but the
   card reading those `zoom_error`/`zoom_connected` query params only ever
   rendered on Firm Profile — so a real error had nowhere to display.
   Zoom is a personal per-staff-member connection (each person authorizes
   their own Zoom account independently; the `ZOOM_CLIENT_ID`/`SECRET` env
   vars just register the app itself, not any one account), so the card
   stays visible to non-admins too.
6. **Removed Resend/Twilio, then the whole provider-health table, from
   Integrations** at the user's request — those were platform-level
   credentials the system admin (her) configures once for all of Verexa,
   not something an individual firm connects. Same was true of the
   Stripe row in that table (checks Verexa's own platform Stripe key, not
   the firm's connected account) — removed too. The page is now just
   Stripe Connect (firm-level) and Zoom (per-staff), i.e. only things
   someone actually logs into personally.
7. **Ported the `automations.manage` permission check into production
   code.** The permission itself and its RLS policies were already live in
   the shared database (built in an earlier session on the now-deleted
   sandbox branch), but the two Workflows pages
   (`app/(app)/workflows/page.tsx`, `.../[id]/page.tsx`) were still
   checking `is_workspace_admin()` in code, so Manager/ERO/Staff couldn't
   actually use the access the permission was meant to grant. Fixed to
   call `has_permission(..., 'automations.manage')` to match.
8. **Small mobile-responsiveness fixes**: three flat 3-column grids with no
   breakpoint that got cramped on narrow phones — the client portal's
   appointment time-slot picker (`components/portal/BookAppointment.tsx`),
   the new-client City/State/ZIP row (`NewClientButton.tsx`), and the
   invoice/quote discount row (`InvoiceQuoteForm.tsx`). All now start at
   1-2 columns and expand at `sm:`. This was a scoped pass on the highest-
   confidence real issues found by grepping for un-responsive `grid-cols-
   [3-9]`, not an exhaustive page-by-page audit — a fuller pass would mean
   actually clicking through the app at a narrow viewport.

Everything above is committed and pushed to
`claude/verexa-tax-office-v2-mhd9mo`. **Confirm with the user whether the
latest commit has been promoted to production before assuming any of this
is live** — as of writing, several pushes were still sitting as
un-promoted previews.

## Open / blocked

- **Zoom OAuth is fully built and verified correct on Verexa's side, but
  blocked on Zoom's own platform.** Client ID/secret, redirect URI
  (`https://verexahq.com/api/zoom/connect/callback`, must match exactly —
  no `www.`), scopes (`user:read:user`, `meeting:write:meeting`) are all
  confirmed correctly configured on the Zoom app. Clicking "Allow" on
  Zoom's consent screen does nothing — confirmed via browser console that
  Zoom's *own* internal API call, `/api/v1/apps/.../subscriptions/@accept`,
  returns a 403 before any redirect back to Verexa happens. Ruled out:
  browser/extension interference (same failure in a clean incognito
  window, cache cleared, fresh login), mobile vs desktop (same on both),
  our own redirect/scope config (verified byte-for-byte). This needs the
  user to contact Zoom Developer Support directly — a ready-to-paste bug
  report is in the conversation history, or just re-describe the 403
  above. Nothing left to try on our end until Zoom's side is unblocked.
- **`app/api/zoom/connect/start/route.ts` / `callback/route.ts`** rely on
  `NEXT_PUBLIC_APP_URL` being set to exactly `https://verexahq.com` (no
  `www.`, no trailing slash) in Vercel's environment variables — this was
  the fix for an earlier `invalid_grant` error. If Zoom OAuth starts
  failing differently after this file is ever touched, check that env var
  first before re-diagnosing from scratch.
- Full mobile responsiveness pass: only the grep-found issues above were
  fixed. A real pass would mean loading the app at a phone viewport and
  clicking through Clients, Engagements, the Client/Engagement workspace
  tabs, Settings, and the Client Portal specifically (that one's actually
  used on phones by real clients, unlike most of the staff-facing app).
- **Fixed live in the DB, no deploy needed**: `create_engagement` had two
  overloaded versions in Postgres (a stale 5-param one from before
  `p_billing_rule_id` existed, never dropped when the 6-param version
  replaced it). Any call using fewer than all 6 named params -- which is
  exactly what `NewClientButton.tsx`'s minimal call does -- was ambiguous
  and failed with "could not choose the best candidate function." Dropped
  the stale 5-param overload directly in the database (migration
  `drop_stale_create_engagement_overload`). If a similar "could not choose
  the best candidate function" error ever resurfaces on a different RPC,
  it's the same root cause: check `pg_proc` for duplicate overloads of that
  function name and drop whichever one predates the current call sites.
- **Requested, not yet built**: a way to bypass the duplicate email/phone
  check when creating a new lead/contact -- some people legitimately share
  a phone or email (spouses, business partners). She still wants to be
  warned it's a duplicate, but needs a "use anyway" override instead of a
  hard block. Find the current duplicate-check logic (likely in the new
  client/lead creation flow, `NewClientButton.tsx` or similar) before
  building this.
- **"DELETE requires a WHERE clause" error, reported on both creating a
  service (toggle-on/clone) and toggling one off, under Settings >
  Services — root cause not found yet.** Investigated and ruled out: no
  `safeupdate`-style Postgres extension is installed on this project
  (checked `pg_extension`); the `services` table's `audit_services`
  trigger (`audit_trigger_fn()`) only ever INSERTs into `audit_log`, never
  deletes; the one bare `delete from tmp_stage_map;` inside
  `duplicate_config_object()` operates on a temp table that's always freshly
  created moments earlier (`on commit drop`), so it's empty and harmless,
  and being plain SQL inside a `SECURITY DEFINER` function it wouldn't
  surface as a client-visible PostgREST error anyway. Could not reproduce
  directly via SQL editor since `is_workspace_admin()`/`has_permission()`
  need a real `auth.uid()`, which the SQL editor doesn't have. **Next
  step: get the literal error text or a browser console screenshot from
  the user** (same technique that cracked the Zoom 403) rather than
  guessing further from the backend alone.
- **RM/Reviewer/Compliance Officer requested changes, not yet built**:
  should only show on ERO and SB (sub-business/connected) workspace tiers,
  not on independent solo-PTIN workspaces (a similar fix was done in an
  earlier now-deleted-branch session — verify current production behavior
  before assuming it's broken, it may have simply never been ported, same
  pattern as the automations.manage fix earlier this session). New ask: an
  ERO/SB-tier workspace should be able to preset these as defaults for
  their staff accounts and connected accounts. Also these fields currently
  show by email and should show by staff display name instead.
- No other known gaps as of this session. If picking this back up, ask the
  user what's next rather than assuming — she drives this by describing
  real usage friction, not by a pre-written roadmap.
