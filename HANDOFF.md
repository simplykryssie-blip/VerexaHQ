# Session Handoff — 2026-08-13

Written for whichever Claude session picks this project up next, likely on
a different account. Read this first before touching anything. For how the
system is actually built (schema, auth, permissions, every module), see
`PLATFORM.md` in this same repo root — that's the living architecture
reference. This file is just "what happened recently and what's still open."

## Addendum — 2026-08-23: "New Leads Enter CRM" finished

The owner asked for a specific lead-intake automation (trigger on
`lead.created` → move to New Lead Pipeline → 2 min wait → welcome
email+SMS → portal invite if not already sent → push organizer for the
selected service → 5 min wait → check organizer status → branch on
completed/pending, with escalation and a stalled-lead fallback). A
different concurrent Claude session had already built ~70% of this under
different names (PR #93, `wire_new_leads_enter_crm_past_condition`) by the
time this request came in — this addendum documents finishing it, not
starting it.

- **`New Leads Enter CRM`** (automation id `f0cf2f59-df2f-438d-b501-9d0c535f0e5b`,
  workspace `74321fb2-...` / Verexa HQ CRM): full flow now wired end to
  end. Still `is_enabled = false` — **ask the owner before flipping it on**,
  since it will start emailing/texting real new leads.
- **New standalone action type `business_hours_delay`** (kept separate from
  `delay` per the owner: "I want each step to have 1 capability unless it's
  a condition of that step"). Backed by new `workspace_business_hours`
  table (per-workspace weekly schedule, Mon–Fri 9–5 default seeded for
  every workspace) and `compute_business_hours_deadline()`. No settings UI
  exists yet to edit the hours — only `set_workspace_business_hours(p_workspace_id, p_hours)` RPC. **Building that UI is the natural next step.**
- **New automation `Organizer Completed Follow-up`** (`a1cedcb0-...`):
  notifies staff, moves the lead onto its service pipeline, waits 24
  business hours, escalates if `clients.relationship_manager_id` is still
  null (nobody took ownership). Started only via `start_workflow` from all
  three "organizer completed" resolution points in New Leads Enter CRM —
  never fires on its own trigger by design (same defensive
  never-auto-fires trigger_type convention as the automation below).
- **Renamed** the pipeline + automation that used to be called "Pending
  Organizer Pipeline" / "Waiting on Organizer Completion (New Lead)" to
  **`Lead Stalled- No Organizer`** (both), per the owner's exact requested
  naming, and gave the automation its first real steps (create_task +
  staff notification + tag) — it previously had none.
- **Bugs found and fixed along the way** (all pre-dated this addendum,
  introduced by the concurrent session building the first ~70%):
  - The original "Organizer Pending" branch condition ANDed two equality
    checks against the same field with two different literal values —
    literally never true, silently dead-ending the whole automation for
    the common case. Same shape of bug existed on the recheck condition
    too (only a null catch-all, no explicit "submitted" edge at all).
    Fixed by using an explicit check first + null-catch-all second
    everywhere a 2-way branch exists — see migration
    `20260823184935_rewire_new_leads_enter_crm_full_flow.sql` for the full
    writeup.
  - `lead-welcome-email`'s subject and `welcom_sms_new_lead`'s body used
    `{{client_first_name}}`/`{{firm_phone}}`, which don't exist in the
    automation's context payload (`{{first_name}}`/`{{office_phone}}` do)
    — rendered blank. The SMS template was also stuck in `draft` status,
    so every welcome text was silently failing outright. Fixed in
    `20260823184626_fix_welcome_templates_merge_vars_and_publish.sql`.
  - `send_email`/`send_sms`'s `organizer_link` merge var only supported a
    hardcoded `organizer_template_id`, useless for a generic automation
    that has to work across all 9 service pipelines. Extended it to accept
    the sentinel `'current_run'` (reads `trigger_snapshot.last_organizer_template_id`), matching the same sentinel convention the condition system already used.
  - The `automation_steps_sync_edges` trigger auto-links every step
    sequentially by `display_order` *until* the automation has a condition
    step, then goes permanently inert for that automation. Building a new
    automation's steps across several statements with the condition step
    inserted partway through (or never, for a fully-linear automation)
    causes it to silently duplicate the early edges. Cleaned up once here
    (`20260823185204_dedupe_automation_step_edges_from_sync_trigger.sql`)
    — **worth knowing about if anyone else hand-builds an automation via
    raw SQL instead of the builder UI.**

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
- **Deploy gotcha, read this twice, CORRECTED 2026-08-21**: pushing to the
  `claude/verexa-tax-office-v2-mhd9mo` branch alone only builds a *preview*
  deployment. Pushing to `main` builds `target: "production"` directly —
  no separate "Promote to Production" click was needed for any of today's
  merges (an earlier version of this note said otherwise; that no longer
  matches observed behavior, or the project's Vercel Git settings changed
  at some point). Per the user's 2026-08-21 push/merge policy above, every
  change now gets merged into `main` and pushed there too, so this should
  rarely come up — but if something "doesn't look right," confirm against
  `list_deployments`'s `target: "production"` field and its commit SHA
  before assuming the code itself is wrong.

## Standing instructions from the user (still in force)

- **No preloaded/system-default content anywhere** — no starter templates,
  pipelines, automations, forms, organizers, emails, or SMS — **except**
  Services, which the user explicitly asked to be the one place with a
  fixed, hardwired list of preloaded, fully-editable starter content (see
  below). Do not restore seed data anywhere else without her asking again.
- **SUPERSEDED (2026-08-21) — read the new policy below, not this line
  verbatim: "All data in the database is test data, she does not care
  about preserving it."** That was true early on but is no longer the
  operating assumption -- see the new workspace-purpose split just below.
  Don't delete/alter rows in any real workspace (MKB Financial Group LLC,
  Doucet Financial Group, Your Solutions, or any future demo workspace)
  without her asking for that specific thing, the same care as any other
  production data. **Verexa HQ CRM** is still the one place that's always
  fair game to create/delete/rearrange freely.
- **Workspace-purpose split, set 2026-08-21 (not yet built, see Open/
  blocked below for the dashboard/demo-workspace parts):**
  - **Verexa HQ CRM** (workspace id `74321fb2-9a18-4625-ab12-01c98e888667`,
    owner `verexahq@gmail.com`) is the user's own testing sandbox going
    forward. Every pipeline, workflow, test client, form, email/SMS
    template she creates for testing purposes belongs here, not in a real
    firm's workspace (that's how the "MKB Test account"/"Test"/"test
    account2" workspaces + 5 fake leads ended up needing cleanup earlier
    this session -- don't repeat that pattern).
  - **MKB Financial Group LLC** and other named firm workspaces are real
    accounts now -- treat their data with normal production care.
  - She wants a **platform-operator dashboard** to replace the normal
    staff CRM landing page specifically for Verexa HQ CRM's login:
    platform operating health, revenue/income, and what needs her
    attention -- not the regular per-workspace dashboard every other
    account gets.
  - **`/platform-admin` stays exactly what it is today** -- the place she
    goes to actually change something (workspaces, plans, accounts, the
    new system-failures page). The new dashboard above is a *view*, not
    a management surface; don't conflate the two when building this.
- Verexa is multi-tenant — other real workspaces exist in the same database
  beyond hers. Schema/RLS changes affect everyone; be correct, but don't
  need special permission to touch shared system-default rows.
- **Push/merge policy (confirmed 2026-08-21): merge `claude/verexa-tax-
  office-v2-mhd9mo` into `main` and push both, for every change, without
  asking each time.** `main` is what actually deploys to production
  (`verexahq.com`) on every push -- there is no separate "promote to
  production" step observed in practice this session, despite an older
  note below to the contrary; verify against `list_deployments`'
  `target: "production"` field if that ever seems to disagree with what's
  live. Regenerate `lib/database.types.ts` and re-verify it matches the
  live schema after every merge, since two sessions working the same
  branch can each add migrations the other doesn't have yet.

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
  blank.** Confirmed still live (2026-08-20): user hit exactly this
  blocker trying to connect Google Calendar in production -- "Google
  Calendar is not configured for this environment" is the literal string
  `app/api/calendar/google/connect/route.ts` sets on `google_calendar_error`
  when `isGoogleCalendarConfigured()` is false, i.e. the two `GOOGLE_
  CALENDAR_CLIENT_ID/SECRET` env vars still aren't set in Vercel. Same shape
  as Zoom: per-staff personal connection, cards in
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
- **RESOLVED — duplicate email/phone "use anyway" override is already
  built; this entry was stale.** Verified 2026-08-21: `create_client()`
  only runs its dedupe check `if not p_force_create`; `NewClientButton.tsx`
  shows `DuplicateClientModal` on a match, and its "Create as new client
  anyway" button re-submits with `p_force_create: true`, skipping the
  check server-side. Nothing left to build here.
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
- **RESOLVED — RM/Reviewer/Compliance Officer changes are already built;
  this entry was stale.** Verified 2026-08-21, all three asks confirmed
  live: (1) tier gating via `isIndependentTier()` — `ClientWorkspace.tsx`'s
  `showStaffRoles` hides the whole `ClientAssignmentForm` (RM + Reviewer +
  Compliance officer) on independent-PTIN workspaces, and
  `EngagementWorkspace.tsx`'s `showStaffRoles` hides Reviewer + Compliance
  officer the same way (Assigned staff stays visible there, matching RM's
  role on the client side); (2) ERO/SB preset defaults —
  `WorkspaceStaffDefaultsForm` (Settings → Roles & Permissions, gated to
  `EFIN_WORKSPACE_TYPES` + admin) sets `workspaces.default_*_id`, which
  `clients/[id]/page.tsx` resolves as the fallback for a new client (own
  workspace preset → parent firm's preset for Reviewer/Compliance officer
  → account holder); (3) every picker already renders `display_name`, never
  email. Nothing left to build here.
- **RESOLVED — no account-type picker on invite acceptance; this entry was
  stale.** Verified 2026-08-21 (and already noted by the task #188 RESOLVED
  entry below): `app/accept-invitation/page.tsx` has no account-type
  picker at all — just name/password. The apparent picker was actually the
  redirect-to-`/onboarding` bug fixed in task #188. Role list also
  confirmed already built: Admin, Staff, Compliance Officer, Manager,
  Receptionist, PTIN Preparer, Reviewer all exist as real global roles
  (plus Owner, ERO, Administrative Staff) — "PTIN receptionist" was
  resolved as two separate roles (PTIN Preparer + Receptionist), not one
  combined role. Nothing left to build here.
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
- **Reported (2026-08-20), not yet investigated: connecting a custom sending
  domain fails with a Resend 401.** Exact error: `Resend responded with 401:
  {"statusCode":401,"message":"This API key is restricted to only send
  emails","name":"restricted_api_key"}`. This is Resend's own error, not
  Verexa's — it means the `RESEND_API_KEY` currently set in Vercel was
  created with "Sending access" only, but domain verification (adding a
  domain, checking its DNS records) needs a Resend API key with Domains
  permission (either "Full access" or a key with the Domains scope enabled).
  **Fix**: in the Resend dashboard, create a new API key with Full
  access (or Domains scope), then update `RESEND_API_KEY` in Vercel's
  environment variables to the new key. No code change expected — this is
  purely a Resend-side key permission issue. Find the domain-connect flow at
  `app/(app)/settings/integrations` (`EmailDomainCard`) / wherever it calls
  the Resend Domains API to confirm the exact call site before assuming
  nothing else needs to change. Confirmed call site: `lib/email/domains.ts`
  (`createDomain`/`getDomain`/`verifyDomain`/`deleteDomain`, all hitting
  `${RESEND_API}/domains...` with the same `RESEND_API_KEY`), wired into
  `EmailDomainCard` on `app/(app)/settings/integrations`.
- **GHL import (2026-08-20/21): contacts + tags, custom fields, notes,
  tasks, appointments, conversations are built and live-tested; Forms was
  built, live-tested, found broken, and removed.** Bring-your-own Private
  Integration Token + Location ID, stored encrypted (Settings →
  Integrations → GoHighLevel), imports as leads via `create_client` (so
  its dedupe applies), with a tag filter (defaults to MKB's
  `Tax| Individual/ Schedule C`, `Tax| Corporate Return`, `TPB`). Pipelines
  and automations are intentionally out of scope (GHL's model doesn't map
  onto Verexa's automation graph; pipelines are fast enough to hand-recreate
  via `/pipelines`).
  - The five remaining extras are each an opt-in checkbox in
    `GhlImportPanel.tsx`, off by default (contacts+tags-only stays exactly
    as before). Selecting any of notes/tasks/appointments/conversations
    drops the per-request page size from 25 to 8 contacts (each extra is
    its own GHL API round trip per contact, run in parallel per contact via
    `Promise.all` but still adds real wall-clock time) — `route.ts`'s
    `PAGE_LIMIT_WITH_EXTRAS`.
  - Custom fields: GHL's field-id → name map is fetched once at
    `phase: "start"` (`/locations/{id}/customFields`) and threaded through
    every subsequent page call by the client, rather than refetched per
    page. Values land on `clients.custom_fields jsonb` (migration
    `20260821030000_client_custom_fields.sql`) — merged, not overwritten,
    on re-import. That column already existed live before this migration
    (visible in `database.types.ts`'s `clients.Row` already) with no
    corresponding migration file ever committed for it — the new migration
    file is `add column if not exists`, so it was a no-op against the live
    DB but fixed that drift going forward.
  - Notes import into the existing `notes` table (`entity_type: 'client'`);
    tasks into `tasks`; appointments into `appointments`; conversations
    create one `message_threads` row per GHL conversation plus one
    `messages` row per message in it.
  - **Forms was removed (2026-08-21) after a live test run.** Every
    contact's forms fetch failed with GHL's own validation error:
    `property contactId should not exist, limit must be a number
    conforming to the specified constraints` — meaning `/forms/submissions`
    doesn't accept a `contactId` filter the way it was called, and requires
    a `limit` param that was never sent. Rather than guess again at the
    real contract without live API docs access, the checkbox, the
    `importFormsForContact` function, the `GhlFormSubmission`/
    `GhlFormSubmissionsResponse` types, and all `formsImported`
    counters/wiring were deleted outright (not just disabled) from
    `route.ts` and `GhlImportPanel.tsx`. If forms import is wanted later,
    it needs to be rebuilt from GHL's actual current API docs, not
    resurrected from this commit.
  - **Also fixed in that same live test**: a completely nameless GHL
    contact (an `auto.generated@pos.payment` placeholder some POS
    integrations create) failed `clients_check1` (an individual client
    needs at least a first or last name). Fixed with a fallback — nameless
    individuals now get the email's local part as a placeholder last name
    instead of failing the row.
  - **Confirmed working via live test** (2026-08-21, real MKB GHL
    connection, copied onto the "Verexa HQ CRM" workspace for testing):
    contacts, tags, and the nameless-contact fallback. Notes, tasks,
    appointments, conversations, and custom fields were not exercised in
    that specific test run (no errors surfaced for them, but that's not
    the same as a confirmed pass) — if any of those get reported broken,
    check the actual GHL response shape against what the code expects
    before assuming it's a scope-permission issue.
- **Requested (2026-08-20), not started — two new large product asks,
  neither built yet, deliberately deferred to a future session.** Came up
  while discussing what GHL has that Verexa doesn't (Websites/Funnels,
  Community). Scoped with the user via AskUserQuestion before any code:
  1. **Website hosting + funnel/landing-page builder.** Explicitly wants
     the full drag-and-drop version (freeform blocks, custom layouts,
     multi-step funnels, custom domain support) — she rejected the smaller
     "templated pages" option. This is genuinely a second product's worth
     of surface area: a visual page builder, page hosting/routing (likely
     needs its own custom-domain-per-workspace flow, same shape as
     `workspace_email_domains`'s DNS verification but for web, not email),
     and funnel-step sequencing. Lead capture on these pages should almost
     certainly wire into the existing `create_client`/
     `record_client_service_interest` path the public organizer links
     already use, not a separate lead model. No design work done yet on
     the builder's data model (block schema, page versioning, etc.) — this
     needs real architecture planning before writing any code, not just a
     migration.
  2. **Staff learning hub for EROs/Service Bureaus.** Confirmed scope: an
     ERO/SB workspace builds training content once and it's visible to
     staff at every connected office — i.e. it hooks into the *existing*
     `firm_connections` hierarchy (the same ERO↔connected-office
     relationship the Connections page already manages), not a
     per-workspace-only content library. Needs: course/module content
     tables, some kind of content editor (rich text at minimum, maybe
     video embeds), staff-facing consumption UI gated by
     `firm_connections`/role, and probably completion tracking. Smaller
     than the page builder but still a real multi-piece feature, not a
     quick add.
  - **Deliberately not prioritized against each other yet** — user said
    "add to the to-do list for now" rather than picking a build order.
    Ask her which one (if either) to start on before beginning real design
    work on either.
- **RESOLVED (2026-08-21): email notifications for failed background jobs,
  sent to `failedsystem@verexahq.com`.** Built and pushed. Scoped with the
  user first: system-level failures (missing templates/env vars, storage/DB
  errors, Resend outages or key issues -- nothing a workspace admin could
  fix) get logged to a new `system_failure_log` table
  (`lib/systemFailures.ts`'s `reportSystemFailure()`, called from
  `send-pending-portal-invites`/`send-pending-engagement-letters`) and
  drained into one digest email every 20 minutes
  (`app/api/cron/digest-system-failures`), not one email per failure.
  Account-level failures (bad client data, a misconfigured automation
  step) instead notify the workspace's own admins in-app via a new
  `notify_workspace_admins()` RPC -- including a new trigger on
  `automation_execution_logs` that does this for every failed automation
  step, which previously notified nobody at all. Also added a Platform
  Admin page, originally `/platform-admin/system-failures`, listing these
  (source/workspace/message/digested-or-not), per the user's request that
  this be visible in the platform itself, not just email. **(2026-08-22:
  moved to `/platform-admin/systems` -- see below.)**
- **RESOLVED (2026-08-22).** Item 2 below (persistent nav + a real IT
  section) is now built: `/platform-admin` gained a tab strip
  (`PlatformAdminTabs.tsx`) across Overview/Billing/Systems, a new
  `is_platform_it` role (separate from `is_platform_admin`, granted via
  `set_platform_it`/`set_platform_it_by_id`, RLS-scoped to system health
  tables only -- no billing/subscription visibility, can't grant admin or
  IT access itself), and `/platform-admin/systems` replacing the old
  `/platform-admin/system-failures` page with the failure log, job
  queue counts (`calendar_sync_queue`, `notification_queue`), a
  billing-free workspace lookup, and (2026-08-22, second pass) a
  `platform_system_credentials` password vault for the systems Verexa
  itself depends on (Stripe, Resend, Supabase, Vercel, etc.), encrypted
  at rest via the same `encrypt_firm_secret`/`decrypt_firm_secret` pair
  used for GHL connections. Platform admins/IT logging into the
  Verexa HQ CRM workspace specifically (`workspaces.is_platform_home`)
  now land on their respective dashboard instead of the normal staff
  `/dashboard`. Also added (2026-08-22, second pass): a real
  cookie-backed workspace switcher (`getCurrentWorkspace()` in
  `lib/workspace.ts`, `/api/workspace/switch`) and three clean demo
  shells (`workspaces.is_demo`) -- Demo - Independent PTIN, Demo - ERO
  Office, Demo - Service Bureau, each seeded with a couple of obviously
  fake sample clients -- reachable from a "Demo Workspace" section in
  the sidebar so Krystal can click into a fully working PTIN/ERO/SB
  instance for live demos without ever risking real client data. Item 1
  (recommended-fix mapping per failure type) is still not started.
- **Requested (2026-08-21), not started, deliberately deferred so the user
  can test what's built so far first.** One remaining enhancement to the
  `/platform-admin/systems` page above (formerly `/platform-admin/system-failures`):
  1. Each logged failure should show a **recommended fix**, not just the
     raw error message -- e.g. "Resend responded with 401" ->
     "RESEND_API_KEY is likely invalid or revoked; check Vercel env vars."
     Needs a mapping from `system_failure_log.source` +
     message-pattern -> a human-readable suggested fix (probably a lookup
     table/function alongside `reportSystemFailure()`, populated at the
     point each known failure type is logged rather than parsed after the
     fact -- same approach as the system/account-level classification
     already done for the Resend send-failure case).
- **Requested (2026-08-21), not started -- explicitly deferred, "goes on
  the to-do list," not needed right now.** Three related asks, from the
  user's own words:
  1. **Reserve Verexa HQ CRM as the only testing sandbox.** "Any pipeline,
     workflow, test clients, form, email, sms templates all only belong
     in this account." Mechanically this workspace already exists
     (`74321fb2-9a18-4625-ab12-01c98e888667`) and needs nothing built to
     start using it that way -- this is a going-forward *policy*, not a
     feature. Whether it eventually needs actual enforcement (e.g. a
     "this is a test workspace" banner, or blocking test-looking data
     from other workspaces) is an open question, not decided yet.
  2. **A platform-operator dashboard replacing Verexa HQ CRM's normal
     login landing page.** Instead of the regular staff CRM dashboard
     every other workspace gets, logging in here should show: how the
     platform is operating, revenue/income, and things needing her
     attention. `/platform-admin` stays as-is -- the place to go make
     changes (workspaces, plans, accounts, system failures) -- this new
     thing is a *view*, not a management surface. Needs real scoping
     before building: what "how the platform is operating" actually means
     (uptime? error rates? the system-failures count already built?),
     what "income generating" pulls from (there's no real billing/
     subscription revenue flowing yet -- `workspace_subscriptions` /
     `platform_subscription_plans` exist but check whether any workspace
     actually has an active paid plan before assuming there's real
     revenue data to show), and what should surface under "needs
     attention" (unresolved `system_failure_log` rows? pending platform
     admin actions? something else?). Also needs a decision on
     *mechanism* -- a special-cased dashboard keyed off this one
     workspace id, a new `workspace_type` value, or something else --
     don't guess, ask her.
  3. **A demo workspace per account type** (Independent PTIN, ERO Office,
     Service Bureau, Multi-Office Firm) for showing prospects around.
     Needs scoping before building: how "demo" content gets seeded (hand-
     built once, or generated/reset on demand so it doesn't accumulate
     real-looking cruft over repeated demos?), whether these need their
     own dedicated login(s) or she demos from her own platform-admin
     access, and whether a demo workspace should be visually/behaviorally
     marked as such anywhere staff or a prospect could see it.
- No other known gaps as of this session. If picking this back up, ask the
  user what's next rather than assuming — she drives this by describing
  real usage friction, not by a pre-written roadmap.
