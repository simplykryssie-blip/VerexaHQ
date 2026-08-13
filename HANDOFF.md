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
- **⚠️ Known access problem: the user cannot reach this project's own
  Supabase dashboard.** Her `simplykryssie-blip` login only shows one
  project, `mkbfinancialgroup-next` — not "Verexa Tax Office v2"
  (`daxpavvsotvsyqqntddc`), and she has no other organization under that
  login. The Supabase MCP tools reach `daxpavvsotvsyqqntddc` through an
  existing API connection that is independent of her personal dashboard
  login — so database reads/writes/migrations all work fine through
  Claude, but nothing that requires the actual Supabase dashboard
  (Authentication → URL Configuration, billing, storage UI, project
  settings, logs UI) is currently reachable by her. She was checking her
  email for which account might own it, unresolved as of this session.
  Until this is sorted out, don't tell her to "go check X in the Supabase
  dashboard" without first confirming she can actually get into this
  specific project — she cannot right now.
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
  Services — root cause STILL not found, despite a much deeper pass this
  session.** Confirmed the failing call is the `duplicate_config_object`
  RPC returning HTTP 400 (seen directly in the browser Network/Console
  tabs — the "turn on" and "create custom service" flows both hit it).
  Ruled out, this round:
  - No `safeupdate`-style Postgres extension installed (`pg_extension`).
  - No function anywhere in the database contains the literal string
    "WHERE clause" (searched every function body).
  - A real unfiltered `DELETE` on the live `services` table, run directly
    (wrapped in `begin`/`rollback`), does not error at the raw Postgres
    level at all.
  - The exact temp-table create+delete pattern used inside
    `duplicate_config_object()` (`tmp_stage_map`, `tmp_field_map`,
    `tmp_folder_item_map`), reproduced directly, does not error either.
  - **Called `duplicate_config_object` directly against the DB with the
    user's real `auth.uid()` simulated via
    `set_config('request.jwt.claim.sub', ...)`, wrapped in a rollback —
    it succeeded cleanly**, returning a new service id with no error. This
    strongly suggests the SQL function itself is not the problem, or the
    problem is something specific to how the request reaches it via
    PostgREST that a direct DB call doesn't reproduce.
  - Only one overload of `duplicate_config_object` exists (ruled out the
    ambiguous-overload class of bug that hit `create_engagement` earlier
    this session).
  - Confirmed she is testing on the correct/current deployment (the
    Vercel preview URL she was on matched the very latest commit at the
    time) — not a stale-deployment artifact.
  - Attempted to get the literal PostgREST response body via the user's
    browser (DevTools Network tab response, "Copy as fetch" replay) —
    every attempt surfaced a different confounding issue (Chrome's paste
    guard, session not stored where a generic script expects, "Copy as
    fetch" defaulting to `credentials: "include"` which triggers an
    unrelated CORS block that isn't how the app's real client makes the
    call) rather than the actual message. None of these got the literal
    response body.
  - `query_logs` (Supabase MCP tool, which would read the real server-side
    error straight from Postgres/PostgREST logs and settle this
    immediately) is blocked in this environment — every call returns
    "MCP tool call requires approval" with no way to grant it from here.
    This is the same class of restriction as several other Supabase MCP
    tools denied all session (`get_organization`, `list_organizations`,
    `list_projects`, `generate_typescript_types`) — not something to keep
    retrying.
  - **Next step, if picked up again**: either get `query_logs` access (if
    a future session has it, `select event_message from postgres_logs
    where event_message ilike '%WHERE clause%'` would likely answer this
    in one query), or get the literal Network-tab **Response** body text
    (not just the Console's generic "status 400" line, not a "Copy as
    fetch" replay) — e.g. by asking a session with real Supabase dashboard
    access to check the Logs section directly instead of going through
    the user's browser DevTools, which has proven very difficult to
    extract this specific detail from over many attempts.
- **RM/Reviewer/Compliance Officer requested changes, not yet built**:
  should only show on ERO and SB (sub-business/connected) workspace tiers,
  not on independent solo-PTIN workspaces (a similar fix was done in an
  earlier now-deleted-branch session — verify current production behavior
  before assuming it's broken, it may have simply never been ported, same
  pattern as the automations.manage fix earlier this session). New ask: an
  ERO/SB-tier workspace should be able to preset these as defaults for
  their staff accounts and connected accounts. Also these fields currently
  show by email and should show by staff display name instead.
- **Requested, not yet investigated**: when an ERO/Service Bureau invites
  someone and that person signs up via the invite link, the signup screen
  should not ask them to choose an account type (Service Bureau / ERO /
  Independent PTIN) — that's only relevant when creating a brand-new
  workspace, not joining an existing one. Start from
  `app/accept-invitation/page.tsx` and `app/onboarding/page.tsx`. She also
  described a specific role list for ERO/Service Bureau accounts (Admin,
  Staff, Compliance Officer, Manager, Receptionist, PTIN preparer,
  Reviewer) — worded slightly differently the two times she said it, so
  confirm the exact intended list and whether "PTIN receptionist" is one
  role or two before building. Full detail in task #187.
- **Reported: a client accepting a portal invite gets sent to `/onboarding`
  ("set up your firm," the staff flow) after confirming their email,
  instead of back to finishing their portal setup.** Intended design
  (confirmed correct, already built): land them back on
  `/portal/accept-invitation`, which should show their pre-added CRM info
  to verify if they already exist as a client, or otherwise create their
  CRM record from what they enter.
  - Confirmed she tested this on verexahq.com directly (not a stale
    deployment).
  - Ruled out: app code wiring is correct —
    `app/portal/accept-invitation/page.tsx`'s sign-up call sets
    `emailRedirectTo` to `/auth/confirm?next=/portal/accept-invitation?token=...`;
    `app/auth/confirm/route.ts` correctly honors whatever `next` says;
    `middleware.ts` has no global "redirect to onboarding" logic that
    could override it.
  - Ruled out: Supabase Auth's dashboard-level Redirect URLs allow-list
    (Authentication → URL Configuration) — confirmed via screenshot it
    already contains both `https://verexahq.com/` and
    `https://verexahq.com/auth/confirm` (Site URL is
    `https://verexahq.com/`), so the confirmation link isn't being
    rejected/falling back for that reason.
  - **Current leading theory, not yet confirmed**: `(app)/layout.tsx`
    redirects any authenticated user with no `workspace_members` row to
    `/onboarding`. A brand-new portal client has no such row (only a
    `client_portal_users` row) — so if the confirmation link ever lands
    them on the fallback `/dashboard` instead of the intended `next`
    value, `(app)/layout.tsx` would send them straight to `/onboarding`.
    That matches the reported symptom exactly. The one place `next` could
    still be silently getting dropped despite the app code being correct
    is the **Supabase Auth email template** for "Confirm signup"
    (Authentication → Email Templates in the dashboard) — if that
    template was customized and doesn't use the default
    `{{ .ConfirmationURL }}` variable (which carries the `redirect_to`/
    `next` value through automatically), the link it sends could point
    somewhere that loses the `next` param even though our own code sets
    it correctly.
  - **Next step**: check Authentication → Email Templates → "Confirm
    signup" in the Supabase dashboard and confirm whether it uses
    `{{ .ConfirmationURL }}` untouched, or a custom-built link. Screenshot
    it the same way the URL Configuration page was checked.
- **RESOLVED (this session): portal-invite `/onboarding` redirect bug (task
  #188).** Root cause: the Supabase Auth "Redirect URLs" allow-list had only
  exact-match entries (`https://verexahq.com/`,
  `https://verexahq.com/auth/confirm`), and the actual confirmation link
  Supabase sends embeds the app's full target as a `redirect_to` param with
  a nested query string (e.g. `.../auth/confirm?next=%2Fportal%2F...`),
  which didn't satisfy the exact-match check. When that check fails,
  Supabase silently falls back to the bare Site URL and drops `next` (and
  the login code) entirely — landing the user on `/dashboard`'s fallback,
  which then bounced to `/onboarding` since a brand-new portal/staff
  invitee has no `workspace_members` row yet. **Fix applied**: added a
  wildcard entry `https://verexahq.com/**` to the Redirect URLs allow-list
  (dashboard config change, not code — no deploy needed). User confirmed
  this also explains the task #187 "account-type picker shows on staff
  invite acceptance" complaint — `/accept-invitation` itself never has an
  account-type picker (verified in code), so that was the same bug
  bouncing invited staff to `/onboarding` instead. Both should be retested
  end-to-end now that the allow-list fix is live, but the mechanism is
  confirmed and no further code changes are expected to be needed.
- **DONE (this session): full production data purge, at the user's
  explicit request.** Everything was confirmed as test data. Kept exactly
  one login (`verexahq@gmail.com`) and its workspace ("Verexa HQ CRM",
  which had 0 clients so nothing there was touched). Permanently deleted:
  - 5 other workspaces and everything inside them (clients, engagements,
    documents, invoices, messages, appointments, automations, client
    portal users/accounts, etc.): Doucet Financial Group, Tifftheceo, MKB
    Financial Group LLC, MCJ Consulting, Ultra Tax Pro Software.
  - 9 other auth logins: the 5 workspace owners above, plus 3 accounts
    that had signed up but never finished setting up a workspace
    (`info@kmbconsultingfirm.com`, `kshanelle83@gmail.com`,
    `krystal@mkbfinancialgroup.com`), plus the user's own secondary
    personal login (`simplykryssie@gmail.com`) at her explicit
    confirmation.
  - Mechanics, for reference if this is ever needed again: deleted rows
    from every `public` table with a `workspace_id` column (multi-pass,
    catching `foreign_key_violation` and retrying, since several tables —
    `engagements`, `invoices`, `messages`, `tasks`, etc. — have `NO ACTION`
    FKs to `workspaces` that block a naive single-pass delete), then
    deleted the 5 `workspaces` rows (cascades the rest), then deleted the 9
    `auth.users` rows. Two triggers had to be temporarily disabled for the
    operation and re-enabled immediately after:
    `trg_protect_entry_lead_stage` on `lead_stages` (a real safety guard
    that normally blocks deleting a workspace's default "entry" lead
    stage — correctly blocks accidental deletes, correctly bypassed here
    since the whole workspace was being removed) and `audit_workspaces` on
    `workspaces` (its audit-log insert has a `workspace_id` FK back to the
    row being deleted, which fails once the row is actually gone).
  - One residual: a single orphaned file was found in the `branding`
    storage bucket for the deleted MKB Financial Group workspace (a
    sidebar logo image). Direct SQL delete on `storage.objects` is blocked
    by Supabase (`storage.protect_delete()` — must go through the Storage
    API, which needs the service-role key this session doesn't have
    direct access to). **Not cleaned up** — low priority, no client PII
    beyond a logo graphic, path is
    `branding/3510fe7b-0b31-406a-b245-123127aa1ed8/...`. If it matters,
    delete it via Supabase Dashboard → Storage → `branding` bucket → that
    folder.
  - Verified after: exactly 1 workspace, 1 auth user, 0 clients remain.
- No other known gaps as of this session. If picking this back up, ask the
  user what's next rather than assuming — she drives this by describing
  real usage friction, not by a pre-written roadmap.
