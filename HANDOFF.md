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

9. **EIN/EFIN/PTIN input formatting + supported-filing-states multi-select**
   (`lib/taxIds.ts`, `lib/usStates.ts` — new files). EIN auto-formats as
   `12-3456789`, PTIN as `P12345678`, EFIN as a plain 6-digit string, live
   as the user types. "Supported filing states" changed from a free-text
   comma list to a checkbox grid of all 50 states + DC
   (`FirmTaxProfileForm.tsx`), defaulting to all-selected except states
   flagged as requiring their own preparer license/certification
   (currently just CA and OR in `SPECIAL_CERTIFICATION_STATE_CODES` — this
   is a starting assumption, not verified against real licensing
   requirements, flag to the user if it matters).
10. **Personal PTIN field for ERO/SB staff.** Previously PTIN only existed
    at the firm level (`firm_tax_profile`, independent-PTIN workspaces
    only). Added `user_profiles.ptin_encrypted`/`ptin_hash`/`ptin_last4` +
    `set_my_ptin`/`reveal_my_ptin` RPCs, surfaced on `MyProfileForm.tsx`
    for ERO/SB staff (`showPtin = workspace_type !== "independent_ptin"`
    in `app/(app)/settings/firm-profile/page.tsx`). Duplicate-PTIN
    detection is cross-domain: both `set_firm_tax_profile` and
    `set_my_ptin` check a new deterministic `hash_firm_secret()`-derived
    `*_hash` column on *both* `firm_tax_profile` and `user_profiles`
    before writing, since the same PTIN must not be reusable across either
    storage location. Extracted the reveal/hide/edit UI out of
    `FirmTaxProfileForm.tsx` into a shared `components/settings/
    MaskedSecretField.tsx` so both forms use the same component.
11. **Sidebar/portal logo enlarged** — was too small to read. Both
    `Sidebar.tsx` (staff) and `PortalSidebar.tsx` (client portal) bumped
    from `maxHeight: 28px/24px` to `44px`.
12. **NOT RESOLVED — attempted workaround also failed. Reopening task
    #186.** Shipped a brand-new dedicated function, `public.turn_on_service(
    p_service_id, p_workspace_id, p_new_name default null)` (commit
    `07a1f11`), that clones a service + its process/stages/tasks the same
    way `duplicate_config_object` was supposed to, through its own
    independent code path, and switched both frontend call sites in
    `ServiceToggleList.tsx` to it. **The user tested this on the exact
    correct preview deployment
    (`verexa-tax-office-v2-git-claude-verexa-tax-44c2a5-verexa-hq-crm.vercel.app`,
    confirmed commit `07a1f11`, confirmed she used that exact URL) and got
    the identical "DELETE requires a WHERE clause" error.** This is a
    major finding: it rules out anything specific to
    `duplicate_config_object`'s function body being the cause, since a
    completely separate, newly-written function with different logic
    fails the exact same way through the real request path. The two
    functions' only meaningful shared trait is an unfiltered
    `delete from tmp_*;` statement on a `create temporary table` (no
    `WHERE` clause, by design — clearing a reusable per-transaction temp
    table). Investigation this round, after the workaround failed:
    - Re-ran the *direct* DB reproduction, this time actually switching to
      the real `authenticated` Postgres role via `set local role
      authenticated;` (previous rounds only faked the JWT claim while
      staying on a superuser/service connection — this closes that gap).
      **Still succeeded with no error.** So even executing as the real
      role, in the same database, the bug does not reproduce directly.
    - Checked for `session_preload_libraries` (a `safeupdate`-style
      extension would explain "DELETE requires a WHERE clause" exactly,
      and wouldn't show up in `pg_extension` if it's a preload-only
      library rather than a `CREATE EXTENSION`). Found:
      `session_preload_libraries = 'supautils'` (Supabase's own
      role/privilege-management preload library),
      `shared_preload_libraries = 'pg_stat_statements, pgaudit, plpgsql,
      plpgsql_check, pg_cron, pg_net, pgsodium, auto_explain, pg_tle,
      plan_filter, supabase_vault'`. No `safeupdate` or similar literal
      match. **`supautils` itself is worth investigating directly as the
      source** — it's a Supabase-authored extension specifically for
      restricting/policing what happens over PostgREST-style connections
      that a superuser SQL-editor session doesn't go through the same way;
      it plausibly has a role- or connection-path-scoped safety check that
      only activates for genuine pooler-routed requests, which would
      explain every single direct-reproduction attempt succeeding
      (including the `set local role authenticated` one) while the real
      app path fails every time. Nobody has yet read `supautils`'
      actual config/docs in this investigation — that's the most promising
      unexplored lead.
    - `query_logs` (would show the literal Postgres/PostgREST error from
      server logs and probably settle this in one query) is **still
      blocked** ("MCP tool call requires approval", no way to grant it
      from this session) — tried again this round, same result. If a
      future session/account has this tool actually available, run:
      `select timestamp, event_message from logs where source =
      'postgres_logs' and event_message ilike '%WHERE clause%' order by
      timestamp desc limit 20` — this should immediately show which
      statement, and from which context, is actually raising the error.
    - **Do not re-attempt the "ship a different bypass function" pattern
      again without new evidence** — it was tried once (this session) on
      the reasonable theory that the bug was specific to
      `duplicate_config_object`, and that theory is now disproven. Get the
      actual error text (via `query_logs`, or a real Supabase dashboard
      Logs page — see the "Supabase dashboard access" blocker below) before
      writing any more code.
    - `duplicate_config_object` and `turn_on_service` are **both still
      broken** — `ServiceToggleList.tsx` currently calls `turn_on_service`,
      not `duplicate_config_object`, but that was not a fix, just a swap
      to an equally-broken function. Turning on a service and creating a
      custom service are both still non-functional in production and on
      every preview as of this writing.

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
- **Google/Outlook calendar sync is fully built (2026-08-19) but has no real
  OAuth credentials yet -- `GOOGLE_CALENDAR_CLIENT_ID/SECRET` and
  `MICROSOFT_CALENDAR_CLIENT_ID/SECRET` in `.env.local.example` are both
  blank.** Same shape as Zoom: per-staff personal connection, cards in
  Settings → Integrations. What it does once credentials are set: every
  appointment with a `staff_id` gets pushed (create/update/cancel) to that
  staff member's connected calendar via a Postgres trigger
  (`enqueue_calendar_sync` on `public.appointments`) that queues jobs into
  `calendar_sync_queue`, drained by `/api/cron/sync-calendar-events` every 5
  minutes -- so it fires for every current and future path that touches
  `appointments` (staff toolbar, portal self-booking, anything added later),
  not just one call site. It's two-way: the portal's `available-slots` and
  `book-appointment` routes also live-query every connected staff member's
  personal calendar for busy blocks (`lib/calendarSync/freebusy.ts`) so a
  client can't book over something that only exists on someone's Google/
  Outlook calendar. Tokens are encrypted at rest the same way as Zoom's
  (`encrypt_calendar_secret`/`decrypt_calendar_secret`, pgp_sym via a
  dedicated Vault key `calendar_oauth_vault_key`, service_role only).
  Getting it live needs: a Google Cloud OAuth client (Calendar API enabled)
  and an Azure/Entra app registration (Calendars.ReadWrite + User.Read Graph
  permissions), redirect URIs exactly matching
  `/api/calendar/google/callback` and `/api/calendar/microsoft/callback` on
  the real domain, then those four env vars set in Vercel. Nothing left to
  build on Verexa's side until those exist. Known limitation accepted for
  scope: Microsoft's `getSchedule` (used for the Outlook freebusy check) is
  an Exchange/M365 mailbox feature and may not work for a personal
  outlook.com account with no Microsoft 365 subscription behind it -- the
  freebusy helper fails open per-connection in that case rather than
  blocking booking, so worst case is just no extra restriction from that
  one connection.
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
- **RESOLVED — "DELETE requires a WHERE clause" is fixed; this entry was
  stale.** Root cause found and fixed same-day this was written
  (`20260813200005_fix_safeupdate_unfiltered_temp_table_deletes.sql`,
  already live), but this file was never updated to say so, so a later
  session could easily have re-opened an already-closed investigation from
  scratch. Actual root cause: the `authenticator` Postgres role — the one
  PostgREST connects as for every real API request — has a *per-role*
  `session_preload_libraries = 'supautils, safeupdate'` override set via
  `pg_db_role_setting`. That's invisible when checking the global
  `session_preload_libraries` GUC and invisible when reproducing with
  `set local role` inside an already-open session (role-level `ALTER ROLE
  ... SET` only takes effect on a *fresh* connection as that role) — which
  is exactly why every direct-SQL reproduction attempt in this file's
  original writeup succeeded while the real app path failed. `safeupdate`
  hard-blocks any DELETE/UPDATE with no WHERE clause, and both
  `duplicate_config_object` and `turn_on_service` intentionally cleared a
  per-transaction temp table with `delete from tmp_x;` (no WHERE, by
  design, since a temp table is always safe to fully clear). Fix: added
  `where true` to every such clear, satisfying the check without weakening
  `safeupdate` for a genuinely-unfiltered statement anywhere else. Verified
  2026-08-19: current live `duplicate_config_object`/`turn_on_service`
  already have the `where true` fix; a fresh sweep of every function in
  `public` for a bare `delete from x;` or `update x set ... ;` with no
  WHERE anywhere in the body found zero remaining instances, and a sweep of
  every `.delete()`/`.update()` call in the frontend confirmed all are
  `.eq(...)`-filtered. Nothing left to do here.
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
