# Session Handoff — 2026-08-13

Written for whichever Claude session picks this project up next, likely on
a different account. Read this first before touching anything. For how the
system is actually built (schema, auth, permissions, every module), see
`PLATFORM.md` in this same repo root — that's the living architecture
reference. This file is just "what happened recently and what's still open."

## ⚠️ Branch divergence, discovered 2026-08-31 — read this before trusting anything below

This file's addenda describe work done on **two different branches that
have not been merged into each other**:

- The 2026-08-29 addendum immediately below happened on
  `claude/verexa-schema-mismatch-i8c19u`, merged into **`main`**.
- The 2026-08-31 addendum (further down, newest-first) happened on
  **`claude/verexa-remove-services-vaqbfx`**, which forked from `main` at
  commit `1d50a9e` (2026-08-27) and was never merged back.

As of 2026-08-31: `main` has **111 commits** (89 touching real app
code/migrations) that `claude/verexa-remove-services-vaqbfx` does not have
— including the entire 2026-08-29 redesign addendum below, plus whatever
else shipped on `main` in that window that has no addendum entry at all
(111 commits is far more than the 5 items documented on 2026-08-29 — this
file does not have full coverage of everything on `main` since 08-27).
Conversely, `claude/verexa-remove-services-vaqbfx` has **22 commits** `main`
does not have (the 2026-08-31 addendum's work: tax-prep pipeline
finishing touches, platform billing dunning, the ERO/PTIN Partners
directory, Settings consolidation).

**Practical consequence**: if `main` is still what deploys to production
(per the push/merge policy documented further down in this file — confirm
that policy is still in force, don't assume), then **none of the
2026-08-31 addendum's work is live**, and conversely the redesign work
described in the 2026-08-29 addendum is **not present in
`claude/verexa-remove-services-vaqbfx`'s code** even though it's described
in this same file. Don't assume either branch's file tree matches what
this document describes without checking which branch you're actually on.
**This needs a human decision (merge direction, or keep separate) before
either branch is trusted as "the" current state — flag it, don't guess.**

**Update, same day, after a first investigation pass**: attempted the git
merge (`main` → `claude/verexa-remove-services-vaqbfx`), hit 9 real file
conflicts (Users/Connections/Sidebar/nav and friends), and aborted rather
than resolve them blind once it became clear the scope was much bigger
than a settings page — `main` has done a full "unified pipeline tracking"
schema cutover (new `pipeline_runs`/`pipeline_stages` tables; `main`
**dropped** `lead_pipeline_runs`, `lead_pipeline_stages`, `workflow_runs`,
`workflow_stages` outright, migration
`20260825163000_unified_pipeline_cutover.sql`), removed the e-file
transmission feature, rebuilt the organizer review workspace, added a
document request template builder, AI operator admin tooling, and more —
roughly 90 migrations' worth of real architectural work, not just the
5-item redesign addendum.

**Confirmed against the live database** (one shared Supabase project,
`daxpavvsotvsyqqntddc`, across every branch): the cutover migration has
actually run — `lead_pipeline_runs`/`lead_pipeline_stages`/`workflow_runs`/
`workflow_stages` are gone, only `pipeline_runs`/`pipeline_stages` exist
now. `main`'s reviewer-queue views (`v_reviewer_queue`,
`v_workflow_sla_status`) still exist and still expose a
`workflow_stage_id` column name for backward compatibility, so most code
built against the old naming still reads fine through those views.

**One real, confirmed bug this caused, found and fixed**:
`lib/dashboard/data.ts`'s `getDashboardData()` (loaded on every Dashboard
page view) was already half-migrated *before this divergence was even
discovered* — it queried the new `pipeline_runs` table for
`workflowRuns`/`entity_type='engagement'`, but the review-queue stage
lookup right below it still queried the old, now-nonexistent
`workflow_stages` table by `workflow_run_id`. That query would fail on
every single Dashboard load. Fixed (repointed at
`pipeline_stages`/`pipeline_run_id`) and pushed separately from this
handoff-doc work. **This means `claude/verexa-remove-services-vaqbfx`'s
own internal consistency was already compromised before the Aug 27
divergence was even a factor** — worth a broader sweep for other
half-migrated references if anyone picks this up (search for
`workflow_run`/`workflow_stage`/`lead_pipeline` outside of migration
files, the same way this one was found).

**Update, same day, second attempt: merge completed.** At the user's
explicit request ("I want it fully merged and corrected"), re-ran
`git merge origin/main`, resolved all 10 real conflicts by hand (`lib/
nav.ts`, `components/Sidebar.tsx`, `app/(app)/layout.tsx`, `app/(app)/
settings/{connections,users,roles}/page.tsx`, `components/documents/
RequestsPanel.tsx`, `components/portal/OrganizerForm.tsx`, this file), and
regenerated `lib/database.types.ts` from scratch via `generate_typescript_types`
against the live DB rather than hand-merging it (both branches' migrations
were already live in the one shared database, so a fresh introspection is
strictly more correct than reconciling two divergent hand-edited copies).
Key resolution decisions:
- **Users & Staff + Connections**: main had independently built a richer,
  3-tier version of Connections (`ero_ptin`/`service_bureau_ero`/
  `service_bureau_ptin`, not just `ero_ptin`) and a separate, more capable
  Users page (`getWorkspaceMemberWorkload`, per-user detail pages at
  `/settings/users/[userId]`) than the 2026-08-31 addendum's merge below
  had. Re-applied the "combine into one page" decision (below) on top of
  main's richer components instead of my rougher pre-merge ones -- same
  page/nav consolidation, better underlying data. This also meant
  generalizing `get_ero_connected_partners`/`get_my_ero_connection` (the
  RLS-bug-fix RPCs from the addendum below) to accept all three
  relationship-type tiers, not just `ero_ptin` -- migration
  `20260912060000_generalize_connections_rpcs_to_all_tiers.sql`. The
  Partners page keeps calling the same RPC with no changes (its default
  arg is still `ero_ptin`-only, matching its narrower ERO-specific scope).
- **`ERO_MANAGEMENT_NAV_ITEMS`** (main's new nav section for ERO/SB/
  multi-office workspaces) had its own separate "Connections" entry
  pointing at `/settings/connections` -- removed, since "Team" now points
  at the same merged `/settings/users` page.
- Everything else (RequestsPanel's category-grouping vs. main's shared
  `ProgressBar`/interactive item rendering; OrganizerForm's
  `answerToString` vs. main's newly-extracted `lib/organizer/formatValue.ts`
  helper) resolved by keeping the more complete side and wiring it through
  the newer shared helper where one existed, not by picking one side
  wholesale.

**Verification, completed**: a repo-wide sweep for any other
`workflow_run`/`workflow_stage`/`lead_pipeline` references outside
migration files found nothing beyond the `lib/dashboard/data.ts` fix
already logged above. `lib/database.types.ts` was regenerated fresh from
the live DB (`generate_typescript_types`) rather than hand-merged, since
both branches' migrations were already applied there. The merge also
surfaced two genuine duplicate-declaration bugs from a silent (non-
conflicting) git auto-merge -- both branches had independently built the
same "engagement letter on services" feature at slightly different nearby
lines, so git merged both copies in without flagging a conflict. Fixed in
`components/settings/ServiceForm.tsx` and `app/(app)/settings/services/
[id]/page.tsx` (duplicate `engagement_letter_template_id`/
`engagementLetterTemplates` declarations). `npm install` picked up
`pdfjs-dist`, new on `main` for the PDF template overlay editor. `tsc
--noEmit`, `eslint .`, and `npm run build` all pass clean across the full
merged app (every route from both branches builds, including `/partners`,
`/ero-dashboard`, `/assignments`, `/settings/users/[userId]`,
`/organizers/[responseId]/review`, `/platform-admin/ai-agents`).
**Not yet done**: pushing this merge, and a real click-through test in a
browser (this was a code-level merge verification only) -- check whether
those happened after this note, since it was written before either.

## Addendum — 2026-09-03: Manus audit triage/fixes, production data cleanup, F-05 test-project setup (blocked on missing baseline schema)

Branch: `claude/verexa-remove-services-vaqbfx`. The user fed this session a
series of external AI-generated ("Manus") audit reports run against the
live production app and the real MKB Financial Group LLC workspace. Every
finding was checked against actual source code or live Vercel telemetry
before acting — several audit claims turned out to be wrong or overstated
(see below) and were not "fixed" on the audit's say-so alone.

**Fixed and pushed:**
1. **F-04, identity inconsistency**: the Dashboard greeting used
   `first_name` while the sidebar used `display_name`, so a staff member
   who only set a display name saw a different name in each place. Per
   the user's explicit call ("Display name should win"), `app/(app)/
   dashboard/page.tsx` and `DashboardShell.tsx` now source the greeting
   from `display_name` (falling back to `first_name`, then workspace
   name). The separate `profileComplete` onboarding-gate check still
   uses `first_name` on purpose — different concern, `display_name`
   defaults to email so it's always truthy and can't gate on it.
2. **F-06, Tiptap npm advisory**: all 9 `@tiptap/*` packages bumped
   `^3.29.2` → `^3.31.0` (`npm install --force` needed — transient
   ERESOLVE from npm validating peer deps mid-transaction, safe here
   since every package moved to the same target version). Verified via
   `npm ls @tiptap/core` (fully deduped) and `npm audit`. The other
   advisories surfaced alongside it (`tar`, `@mapbox/node-pre-gyp`,
   `canvas`) were deliberately left alone — fixing them needs a breaking
   `pdfjs-dist` major bump, out of scope for this pass.
3. **F-07, lint finding**: raw `<img>` for the MFA QR code in
   `app/(app)/settings/security/MfaSetup.tsx` — added the same
   `eslint-disable-next-line @next/next/no-img-element` pattern already
   used in `components/Avatar.tsx` (it's a `data:` SVG URI from
   Supabase's MFA enroll response, not an optimizable remote asset).
4. **F-01/F-09, cron queue timeout risk**: three `/api/cron/*` routes
   (`run-pending-automation-steps`, `send-pending-engagement-letters`,
   `send-pending-portal-invites`) process a batch of up to 20-50 rows
   serially inside `maxDuration=60`; a batch of normal-latency jobs could
   still exceed 60s cumulatively even though two of the three already had
   a per-job 25s timeout guard. Added a shared pattern to all three: track
   `startedAt`, check elapsed against `DEADLINE_MS = 45_000` at the top of
   each loop iteration, `break` early and leave the rest for the next cron
   tick (safe/idempotent — nothing is marked processed until it actually
   completes). The audit had also flagged `fire-date-reminder-automations`
   and `check-stale-automation-queues` as having the same issue — checked
   both, they don't share this pattern, left untouched.
5. **`tests/critical-paths.test.ts`**: previously used
   `describe.skipIf(!canRun)`, so CI reported green with **zero**
   critical-path coverage actually run whenever Supabase test env vars
   were absent (always, until today — see below). Changed to fail loudly
   with a clear message instead of skipping silently. This was
   deliberately decoupled from actually getting the suite runnable (item
   below) so CI stops lying regardless of how long the test-project setup
   takes.

**Investigated, found not to be a real/actionable bug:**
- **F-02**: a Next.js RSC TypeError on `/clients.rsc` in Vercel's runtime
  error telemetry. Stack trace is entirely inside Next's own compiled
  runtime (`next/dist/compiled/...`), not attributable to a specific line
  of app code, and hasn't recurred since. Logged as "resolved by
  non-recurrence," not fabricated a speculative fix.
- **F-08**, misspelled Firm Profile URL: explicitly the user's own
  website to fix ("I will change my personal website") — no code action.
- **F-10**, authorization/tenant-isolation testing: needs the user to
  provision a second restricted-role staff test account before it's
  actionable. Not started.

**Production data cleanup (MKB Financial Group LLC workspace,
`9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7`)**, all at the user's explicit
request, after confirming no payments were attached before deleting
anything: removed the `$1` test invoice (`INV-2026-000001`), the "Test
Payment ZZZ" lead, and the "QA Synthetic Release Test" client + its
engagement `ENG-2026-000001` (an earlier audit run's own leftover
synthetic data) — including the `engagement_tax_details`/
`document_requests`/`attachments`/`notes`/`activity_log` rows scoped to
those entities, and a follow-up `audit_log` sweep for the audit-trail
entries the deletes themselves generated. Verified zero remaining rows
for all of it, including a workspace-wide `clients` count.

**F-05 (make the critical-path suite actually runnable) — in progress,
currently blocked on the missing-baseline issue below (org-access problem
is resolved, see update at the bottom of this section).** The user
originally created a dedicated Supabase test project for this under a
*different* Supabase account than the one this app normally uses —
`verexahq-test`, ref `vnyxoubbnuyzywlqmhlh`, org `awcioqmvramifkuxfccm`.
That turned out to belong to an entirely separate Supabase login (not
`mkbfinancialgroup@gmail.com`, the account that owns production), which
is why the Supabase MCP connector kept flipping between seeing one org or
the other and never both — **that project is now orphaned and should be
deleted directly from whichever Supabase login it's under, once the user
tracks that login down; nothing else depends on it.** A replacement was
created in the *correct* org instead: **`verexahq-test`, ref
`uzdlqioslnqqikiouksg`, org `nmkuapcamjwfrnulutkd`** (same org and region,
`us-east-2`, as production) — confirmed reachable and schema-empty (0
migrations, 0 tables) as of 2026-09-03. Use this ref going forward, not
the old one.

Plan: rather than replaying all 385 incremental migration files on top of
a reconstructed pre-`20260805230613` baseline (see why that baseline is
missing below), the simpler and more robust approach is to take a single
full schema-only snapshot of production's *current* live schema (which
already incorporates every migration ever applied) and apply that one
snapshot directly to the fresh test project — no replay needed. A
background agent was dispatched mid-session to generate that snapshot via
read-only SQL introspection against production (no pg_dump/psql access
available, so it's using Postgres's own catalog-reflection functions —
`pg_get_functiondef`, `pg_get_constraintdef`, etc.); check whether
`supabase/migrations/00000000000000_baseline_schema_snapshot_for_fresh_
projects.sql` exists and was committed, or whether that agent's result
is still pending / needs to be picked up.

**Real, confirmed blocker found while attempting this — the migrations
folder cannot build the schema from scratch.** Verified independently
(not just an agent's claim):
```
grep -ohE "CREATE TABLE (IF NOT EXISTS )?public\.[a-z_]+" supabase/migrations/*.sql | sort -u | wc -l
# → 0 matches for any core table (workspaces, clients, invoices,
#   engagements, user_profiles, ...); only ~50 newer feature tables
#   (ai_agent_*, learning_*, library_folders, ...) are ever CREATE TABLE'd
#   anywhere in the 385 files at all.
```
The earliest migration by filename, `20260805230613_invoice_quote_sent_at_
sync.sql`, already assumes `public.invoices` exists. Git history explains
why: commit `2b126bc` ("Reconcile supabase/migrations/ against the live
project's actual applied history", 2026-08-15) documents an "Aug 3
platform_foundation rebuild" and describes deleting ~20 pre-rebuild
migration files that referenced the schema it replaced — but **no
replacement migration that actually creates the rebuilt core schema was
ever committed**. It looks like that rebuild was applied straight to
production (dashboard/SQL editor or similar) and never captured as a
migration file. There's no `schema.sql`/`pg_dump` baseline anywhere in the
repo either — `lib/database.types.ts` exists but is generated TS types
only (no constraints/RLS/functions/triggers), not a usable substitute.

**Org-access problem: resolved.** Earlier in this session the Supabase MCP
connector kept flipping between seeing production's org
(`nmkuapcamjwfrnulutkd`) and the orphaned test project's org
(`awcioqmvramifkuxfccm`), never both, and a reconnect attempt aimed at
fixing that left the connector reporting "connected" via `ListConnectors`
while `mcp__Supabase__*` tools still wouldn't load via `ToolSearch` for a
while. That's moot now — since the replacement `verexahq-test`
(`uzdlqioslnqqikiouksg`) was created directly inside production's own org,
there's no more org-switching needed; a normal Supabase MCP connection to
this account reaches both projects at once. If a future session somehow
can't see both `daxpavvsotvsyqqntddc` and `uzdlqioslnqqikiouksg` via
`mcp__Supabase__list_projects`, something regressed — don't assume it's
expected.

**Still open / next steps for F-05, in order:**
1. Confirm/pick up the baseline-snapshot agent's result — either
   `supabase/migrations/00000000000000_baseline_schema_snapshot_for_fresh_
   projects.sql` already exists and was committed (check git log), or
   generate it fresh using the same read-only-introspection approach
   against `daxpavvsotvsyqqntddc` if it doesn't.
2. Apply that single snapshot file to `uzdlqioslnqqikiouksg`
   (`verexahq-test`) via `apply_migration`. Expect this to need a round or
   two of fixing errors on first apply (object-ordering issues are likely
   — the snapshot was generated via SQL introspection without a live
   target to test against, see the agent's own reported risk areas) — that
   is normal, not a sign the approach is wrong.
3. Verify schema parity against production (`list_tables` on both,
   `get_advisors` sanity check on the test project).
4. Set `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` for
   `uzdlqioslnqqikiouksg` in `.env.local` and CI secrets, confirm
   `tests/critical-paths.test.ts` actually passes against it (it currently
   correctly fails, since those env vars aren't set anywhere yet).

## Addendum — 2026-08-31: tax-prep pipeline finishing touches, platform billing dunning, ERO/PTIN Partners directory, Settings consolidation

Branch: `claude/verexa-remove-services-vaqbfx` (forked from `main` at
`1d50a9e`, 2026-08-27 — see the divergence warning above, this branch was
never merged back into `main`). Roughly in order:

1. **Tax-prep pipeline finishing touches**: built out the previously-empty
   post-conversion prep pipeline (5 stages), added a status-tag lifecycle
   across the pipeline, made new-client relationship-manager assignment
   actually real, added an ERO Review decline path with its own
   disengagement email, untangled the Missing Info workflow canvas and
   gave its reminder chain explicit Yes/No branches, added staff
   presence/identity attestation before in-person signing, auto-derived
   document checklists from organizer file uploads (grouped by category),
   added organizer rename UI and surfaced the engagement letter on
   services.
2. **Platform billing**: seeded Verexa's own subscription plans
   (`platform_subscription_plans`: Solo/Team/Firm), built real
   usage-overage billing (one-time free bucket + monthly Stripe charge for
   email/SMS/storage overage — replaced an earlier arrears-billing attempt
   after explicit correction: "no, prepaid top-ups, not arrears"), added
   `payment_method` (stripe/check/cash/bank_transfer/other) to manual
   payment recording, and documented the missing
   `STRIPE_CONNECT_CLIENT_ID` in `.env.local.example`.
3. **New: platform-wide card-on-file + pre-cycle billing dunning.**
   Previously billing-failure handling was 100% reactive (Stripe
   auto-charges on the renewal date, runs its own Smart Retries, Verexa
   only suspends once Stripe marks a subscription "unpaid"). Now: a Setup
   Checkout flow collects a saved card
   (`workspace_subscriptions.default_payment_method_id` + cached
   brand/last4/exp), an in-app modal (`BillingCardPrompt`, gated by a new
   `needs_billing_card` RPC) prompts for a card once a workspace is
   responsible for its own billing with none on file, and a new hourly
   cron (`/api/cron/check-billing-cycles`, using true America/Chicago
   calendar dates so day boundaries land on true CST/CDT midnight
   year-round) reminds at 5 days out, attempts an off-session charge at 3
   days out (final retry at day 0, credited to the Stripe customer's
   balance rather than double-charging on the real renewal invoice — see
   `createCustomerBalanceCredit` in `lib/stripe/client.ts` for why that's
   safe), and suspends the workspace if nothing succeeded once the cycle
   ends — independent of how long Stripe's own retries would otherwise
   take. **Not yet exercised against a real Stripe subscription** — no
   workspace currently has a live `workspace_subscriptions` row with a
   real `stripe_customer_id`.
4. **ERO demo rebuild for a live demo**: refreshed the PTIN demo workspace
   (Summit Tax & Financial Services) from MKB's live config, seeded an
   active `firm_connections` row + real tax-return data, renamed the ERO
   demo workspace to "Ascend Tax Office," and built it a full
   recruiting/onboarding pipeline (application organizer with a
   conditionally-shown "already on Verexa?" branch, a signature-required
   partnership agreement, a 7-stage process, 7 stage-triggered
   automations). **Deliberately human-in-the-loop, not fully automatic**,
   for two real engine limitations found along the way: the condition
   system can't branch on a specific organizer answer's value, and
   `create_engagement`/`send_engagement_letter`'s automation actions only
   work on an `organizer.submitted`-triggered run with a resolved
   service — a mechanism with zero real production usage before this.
5. **Fixed a real cross-workspace bug** found while building the item
   below: the connected-partner name lookup (both directions — an ERO
   seeing a PTIN's name, a PTIN seeing their ERO's name) went through a
   plain embedded select that only resolves if the viewer happens to also
   be a member of the other workspace (true for the demo accounts sharing
   one owner, false for any real separately-owned pair) — would silently
   show "Pending invite"/"your ERO" for a genuinely active connection.
   Fixed with two new `SECURITY DEFINER` RPCs,
   `get_ero_connected_partners` and `get_my_ero_connection`.
6. **New: ERO/PTIN Partners directory** (`/partners`, nav-gated to
   workspaces with at least one `ero_ptin` connection) — a dedicated area,
   separate from the Contacts tab, showing each connected PTIN's business
   contact info (live from their own Firm Profile) plus a free-text notes
   field the ERO maintains privately (`firm_connections.notes`).
7. **Settings consolidation**: merged Connections into Users & Staff — one
   page, one nav item (`/settings/users`). `/settings/connections` now
   redirects there (preserving `?token=`) rather than 404ing.

## Addendum — 2026-08-29: QA agent run, onboarding popup, and a full visual/branding redesign

Five separate pieces of work this session, roughly in the order they happened.
Everything below is committed, merged into `main`, and the working branch
(`claude/verexa-schema-mismatch-i8c19u`) was reset to `main` after each merge
— note this is a **different branch** from `claude/verexa-tax-office-v2-mhd9mo`
referenced elsewhere in this file; check which one is actually current before
assuming either is stale.

1. **QA Agent run against the 5 ERO Workspace features (PRs #154–158).**
   Ran in Demo - ERO Office. Real browser E2E turned out to be impossible in
   this sandbox — the outbound agent-proxy hard-blocks CONNECT to
   `daxpavvsotvsyqqntddc.supabase.co` for generic browser/curl traffic
   (confirmed via `curl http://127.0.0.1:37941/__agentproxy/status`, which
   lists it under `recentRelayFailures` as `connect_rejected`). Only the
   dedicated Supabase MCP tool channel can reach that host. Pivoted to
   RPC/RLS-level verification instead — 0 defects found. All synthetic test
   data (a fake `auth.users` row, a client/engagement/task fixture set)
   was created, verified, then fully deleted afterward. **If a future
   session needs real browser E2E against the live app, expect this same
   proxy block and plan for RPC-level verification instead, not more time
   spent trying to route around it.**

2. **Learning Hub visibility: fixed, then explicitly reverted.** The user
   flagged that Learning Hub shouldn't show on Independent PTIN workspaces.
   Shipped a fix (PR #159, hide unless connected to an ERO) after confirming
   via AskUserQuestion that a genuinely-connected demo PTIN needed to keep
   seeing it. The user then said "Disregard that" — cleanly reverted via
   `git revert -m 1` (PR #160, merged). **Current live behavior: Learning
   Hub shows unconditionally for every workspace, same as before either
   change.** Don't re-attempt this fix without the user asking again.

3. **Staff onboarding checklist → popup.** `components/onboarding/
   OnboardingChecklist.tsx` no longer renders as an inline banner pinned to
   the top of the dashboard — it's now a real `Modal` (PR #161). The
   permanent "Don't show this again" DB-backed dismiss is unchanged; a new
   local-only `closedForNow` state just lets someone close the popup for
   the current page load without triggering that permanent dismiss.

4. **A from-scratch visual/branding redesign, in phases, all now shipped:**
   the user compared Verexa's actual UI unfavorably to SuiteDash ("a space I
   can create in") vs. TaxNitro ("just boring work") and asked for a real
   redesign, not a coat of paint. Key discovery that grounded everything
   below: **`public/brand/vmark.png`** (the real Verexa "V" logo) has a
   genuine vivid blue-to-lime gradient (`~#0EA5FF` → `~#D4F905`, tempered to
   `#A4D22B` for UI use) that the live product had never actually used
   anywhere — every screen was flat single-blue. That gradient, applied as
   a **default-unless-branded** treatment (any workspace with its own Brand
   Center `secondaryColor` set keeps a flat tint of that color instead —
   never gets the gradient forced on, so no white-labeled firm's look
   changes), is the throughline for every phase below.
   - **Phase 1 (PR #162):** `tailwind.config.ts` gained `brandLime` (`#A4D22B`)
     and a warmer `surfaceMuted` (`#F4F6EF`, a sage tint instead of flat
     gray). Sidebar's active-nav-item pill defaults to the blue-to-lime
     gradient (`Sidebar.module.css`'s `--nav-active-bg`), falling back to a
     flat tint of `secondaryColor` when one's set (`Sidebar.tsx`).
   - **Phase 2 (PR #163):** Dashboard's page header became a dark hero band
     (`bg-ink`) with a gradient-text personalized greeting ("Welcome back,
     {first name}") and a real, computed "N things need your attention"
     subtitle — no fabricated copy. `EngagementPipelineWidget` highlights
     whichever non-Completed stage currently has the most engagements in it
     with the same gradient, a real computed signal, not decoration.
   - **Phase 3 (PR #164):** Client Portal dashboard
     (`app/portal/(portal)/dashboard/page.tsx`) got the same dark-hero
     treatment plus a new conic-gradient progress ring showing a **real**
     stage-based completion percentage for the client's nearest active
     engagement (derived from `ENGAGEMENT_PIPELINE_STATUSES`' position in
     the pipeline, same as the dashboard widget), categorical stat tiles,
     and two action cards (documents / message preparer) using real counts
     and the actual preparer's name. Portal sidebar's active-nav pill picked
     up the same gradient-or-flat-tint rule as the staff sidebar.
   - **Design-system pass (PR #165):** the user shared a Verexa-branded
     reference mockup (apparently a white-labeled SuiteDash trial — same
     "VEREXA" branding, purple accent, light sidebar) showing a dashboard +
     client detail + organizer review layout they liked, and asked for it
     applied across "the entire look of the CRM," not just the pages shown.
     Resolved via AskUserQuestion before building: **keep the dark
     sidebar and dark dashboard hero already shipped** (don't revert to the
     mockup's light sidebar), and build the promo banner as a **simple
     static dismissible card, no carousel/rotation/content management**.
     An inventory pass (two Explore agents) found the app already had most
     of the mockup's structural pieces (`WidgetShell`, `IconChip`, `Badge`,
     `SectionCard`, `KpiWidget`, the `TopServicesWidget` donut technique) —
     this was a consolidation pass, not a rebuild:
     - New shared primitives under `components/ui/`: **`Tabs`** (one
       underline tab bar, replacing three near-identical hand-rolled ones in
       `ClientWorkspace.tsx`/`EngagementWorkspaceTabs.tsx`/`MessagesTabs.tsx`
       — `MessagesTabs` was deliberately left on its own pill style, it's a
       filter switcher not a content-section tab bar); **`ProgressBar`**
       (replaces two private duplicates in `EngagementWorkspaceTabs.tsx` and
       `components/documents/RequestsPanel.tsx`, adds an opt-in
       `tone="gradient"` for one intentional highlight per page);
       **`StatTile`** (replaces local `StatCard` duplicates on
       `app/(app)/documents/page.tsx` and the portal dashboard);
       **`Sparkline`** (built, following `TopServicesWidget`'s
       stroke/`currentColor` SVG technique, but **deliberately left unwired**
       — neither `lib/dashboard/data.ts` nor `lib/dashboard/
       businessSnapshot.ts` compute any real day-by-day series anywhere in
       the codebase, and fabricating one would violate the app's own
       data-honesty convention for trend indicators, same reasoning as
       `KpiWidget`'s trend prop).
     - Clients page (`app/(app)/clients/[id]/ClientWorkspace.tsx` +
       `ClientWorkspaceTabs.tsx` + `QuickActions.tsx`): Overview tab's three
       stat tiles now use categorical `IconChip` tones instead of plain
       numbers; a new progress bar shows the real stage-based completion
       percent for the client's nearest active engagement with the brand
       gradient; the right rail's bare `<h3>/<ul>` sections are now
       `SectionCard`s; two new cards were added — **Quick Actions** (Send
       Organizer, reusing the real `QuickActions` component via a new
       `variant="row"` prop, plus Upload Document/Send Message/Create
       Invoice/Add Note as tab-switch shortcuts) and **Notes** (shows the
       single most recent note with an Add Note shortcut).
     - `PromoBanner` (`components/dashboard/PromoBanner.tsx` — this
       component and its exact copy, "Focus on what matters. We'll handle
       the rest...", already existed on the dashboard from earlier
       dashboard-widget work; it just wasn't dismissible) gained a local
       `useState` dismiss with an X button. `AppHeader.tsx` gained a
       `HelpCircle` icon linking to `/support`, between the notification
       bell and avatar.
   - **Verification method used throughout**: since real browser E2E is
     blocked (see item 1), every visual phase was checked via a disposable
     `app/dev-preview-*/page.tsx` route rendering the real component with
     mock data, temporarily added to `ALWAYS_PUBLIC_PATHS` in
     `lib/supabase/middleware.ts`, screenshotted with a scratch Playwright
     install (`executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/
     chrome'`, `args: ['--headless=new']` — the npm `playwright` package's
     bundled Chromium revision doesn't match what's pre-installed here) —
     then fully deleted before committing. **Reuse this exact pattern for
     any future visual work in this sandbox** rather than re-discovering it.

5. **Explicitly deferred, not started**: Engagements, Billing, Review Queue,
   and Documents pages were found already close to the new design system in
   the inventory pass above (most already use `Badge`/`IconChip`/the
   `rounded-2xl border-border bg-surface shadow-soft` card shell) and are
   the natural next round if the user wants to keep going on "the entire
   CRM" — mostly consolidation onto the new `Tabs`/`ProgressBar`/`StatTile`
   primitives rather than new design work. `EngagementBoard.tsx`,
   `BillingHub.tsx`, and the Review Queue's `ReviewQueueItem`/
   `ReviewQueueClientChangeItem` sub-components were flagged by the
   inventory but not read in depth — read them first before touching that
   round.

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
- No other known gaps as of the 2026-08-13/29 sessions on `main`. If
  picking this back up, ask the user what's next rather than assuming —
  she drives this by describing real usage friction, not by a pre-written
  roadmap.
- **Open as of the 2026-08-31 session on `claude/verexa-remove-services-vaqbfx`** (see that addendum near the top of this file):
  1. **Real Stripe keys still need to be added** — both the platform
     subscription keys and the Stripe Connect keys (`STRIPE_SECRET_KEY`,
     `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`, and the Connect
     webhook secret) into Vercel's environment variables. The user asked
     for instructions on how to do this; nothing else is blocking it on
     the code side — Connect OAuth, the checkout/webhook flows, and the
     new billing dunning system are all built and just waiting on real
     keys. Until then, `isStripeConfigured()` gates every Stripe call off
     cleanly (no crashes, just skipped).
  2. **Meeting with her IT person about system monitoring** — mentioned
     once early in a prior session, never followed up. Still open.
  3. **Minor, not requested**: no "record a payment" action exists
     directly on the top-level Billing hub (`/billing`) — only
     per-invoice, from a Client or Engagement page. Low priority.
  4. **The branch-divergence problem itself** (see the warning near the
     top of this file) is the biggest open item — it needs a human
     decision on merge direction before either branch can be trusted as
     current, and before any more work piles up on either side making
     reconciliation harder.
