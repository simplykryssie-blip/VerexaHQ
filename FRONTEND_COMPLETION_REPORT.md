# Frontend Completion Report

Branch: `frontend-audit-and-completion` (based on the tip of `improve-system-templates-form-experience`, i.e. it includes the not-yet-merged Client-First System Template and Product Polish PRs). See `FRONTEND_AUDIT.md` for the full audit and `FRONTEND_BACKEND_GAPS.md` for issues that need a backend/product decision.

**This report covers three passes.** The first pass (below, mostly unchanged from the original writeup) did the initial audit and fix pass and opened PR #11 against `improve-system-templates-form-experience`. A second, continuation pass (see "Continuation pass" section) investigated two specific backend-decision questions (`communication_messages`, and `/bookkeeping`/`/payroll`/`/tax` vs. the unified Service Workspace) and finished the remaining safe `any`-type cleanup and `window.confirm()` conversion work — but did so while briefly, incorrectly treating the wrong Supabase project as production, based on an explicit instruction that turned out to be mistaken. A third, correction pass (see "Correction pass" section) re-verified project identity directly against both candidate projects' live databases, confirmed `euxfopzgdmlmgcmmjvic` is correct, and re-ran the full resource audit and the two Decision investigations against it.

**Scope note, stated plainly:** the work order asked for a full completion pass across 13 major functional areas (dashboard, clients, engagements, intake, documents, tasks, workflows, templates, billing, calendar, messages, team/settings, client portal) plus accessibility and responsive review. That is genuinely weeks of work for a real team. This pass did a complete, honest audit of the entire frontend (Phase 1 of the work order, done in full) and then fixed everything the audit found that was safe to fix without a product/architecture decision — concentrated in the app shell and the dashboard/clients/tasks/documents/work areas (Phase 2). It did not attempt to touch billing, calendar, messages, team/settings, or the client portal, because the audit found those areas already complete and defect-free (real Supabase data, proper loading/empty/error states, no placeholders) — there was nothing broken to fix there. Nothing was rewritten or redesigned that didn't need it.

## Pages completed / verified

No pages were "completed" in the sense of being unfinished before — the audit found this app already largely production-ready. Pages **fixed** this pass:

- `app/(app)/dashboard/page.tsx` — skeleton loaders instead of `"—"` placeholders while loading, `friendlyError()` for the error banner, removed the one avoidable `any`.
- `app/(app)/clients/[id]/page.tsx` — "Remove contact" now uses an accessible `ConfirmDialog` instead of `window.confirm()`; migrated the page's ad-hoc local toast implementation onto the shared `useToast()` system; two raw `error.message` strings now route through `friendlyError()`.
- `app/(app)/documents/page.tsx` — document delete now uses `ConfirmDialog` + a success toast instead of `window.confirm()`; the download-link-generation error now routes through `friendlyError()`.
- `app/(app)/tasks/page.tsx` — load-error message now routes through `friendlyError()` for consistency with the rest of the app.
- `app/(app)/work/page.tsx` — added "Pipeline view" and "All services" links (see Routes fixed, below); load-error now routes through `friendlyError()`; all 15 `any` usages in the file replaced with real types.
- `components/NewTaskModal.tsx` — task delete now uses `ConfirmDialog` + a success toast instead of `window.confirm()`.

## Components created

- `components/Toast.tsx` — `ToastProvider` + `useToast()` context/hook. Success/error toasts, auto-dismiss after 5s, dismissible, `aria-live="polite"` region for screen readers. Wired into both the staff app shell (`app/(app)/layout.tsx`) and the client portal shell (`app/portal/layout.tsx`).
- `components/ConfirmDialog.tsx` — accessible replacement for `window.confirm()`: `role="alertdialog"`, focus-trapped to the confirm button on open, closes on Escape, labeled via `aria-labelledby`/`aria-describedby`.

## Components reused

Every fix reused existing, already-established patterns rather than inventing new ones: `lib/friendlyError.ts` (already used consistently across `clients`, `documents`, `pipeline`, `deadlines`, `bookkeeping`, `payroll`, `tax` — now also `dashboard`, `tasks`, `work`), the existing `Field`/`Section`/`StatusPill` component conventions, and the existing `WorkspaceProvider` context pattern (mirrored for `ToastProvider`).

## Bugs fixed

1. `/pipeline` and `/services` — fully built, real, Supabase-backed pages with zero links anywhere in the app. Fixed by adding discoverable links from `/work` (same underlying `services`/`pipeline_stages` data).
2. Dashboard's outstanding-balance calculation used `invoice: any`; now typed against the real `Invoice` type from `lib/types.ts`.
3. `lib/types.ts`'s `Service` type was missing 4 real columns (`service_name`, `billing_frequency`, `is_recurring`, `workflow_managed_by`) — confirmed against the live database schema before adding, not guessed.
4. `app/(app)/work/page.tsx` had 15 `any`-typed values masking real row shapes from 6 different Supabase queries/RPCs; all replaced with locally-defined types matching the actual `.select(...)` column lists.
5. One duplicated toast implementation (`app/(app)/clients/[id]/page.tsx` had its own local `toast` state/effect/render) consolidated onto the new shared system.

## Routes fixed

- `/pipeline`, `/services`: now reachable via links on `/work` (previously 100% unreachable from any UI).
- `/deadlines`, `/bookkeeping`, `/payroll`, `/tax` (and their sub-routes): investigated and **not** wired into navigation — see "Blocked" below, this needs a product decision, not a frontend patch.

## Remaining placeholders

None found that qualify as placeholders. The only "unfinished" UI element in the entire app is `components/ActivateServiceModal.tsx`'s "Workflow template builder coming soon" control, which is already correctly disabled and labeled per the work order's own rule ("clearly marked as unavailable").

## Backend dependencies / RPC mismatches

See `FRONTEND_BACKEND_GAPS.md` in full (updated by the Correction pass — read that version, not this summary, for exact detail). Summary as of the Correction pass:

1. **`bookkeeping_engagements`/`payroll_clients`/`tax_returns` vs. the unified Service Workspace model** — verified live against confirmed production: `tax_returns.engagement_id` and `payroll_clients.engagement_id`/`.service_id` already provide a real FK path to the unified `engagements`/`services` tables; `bookkeeping_engagements` has no such column. `/tax` and `/payroll` could become specialized views using existing schema; `/bookkeeping` needs a new column first. All three still need a product decision on navigation, so none were wired in.
2. **`communication_messages`** — verified live: a real, correctly-RLS'd table whose columns (`direction`, `channel`, `message_status`, `from_address`, `to_address`, etc.) are an email/SMS delivery log, matching the "Communication" tab UI it feeds exactly. It has 0 rows because nothing writes to it yet, not because it's the wrong table. No fix needed to the read; wiring `lib/notify.ts`'s send functions to log to it would be a feature addition, not a bug fix.
3. **`form_templates`** — has an `is_platform_template` discriminator (implying VerexaHQ-authored starter content is intended) but no schema or UI for adding fields/questions to a template. Building one would require new backend schema, which is out of scope for a frontend-only pass.

No frontend code was changed to work around any of these — all three were left exactly as found. (Items 1 and 2 were briefly documented incorrectly during the Continuation pass, based on a mistaken project-identity instruction; see the Correction pass below for what changed and why.)

## Build / typecheck / lint results

Run after all fixes in this pass:

- `npm ci` — clean
- `npm run typecheck` — **clean, 0 errors**
- `npm run lint` — **0 errors**, 14 pre-existing warnings (all `react-hooks/exhaustive-deps` + 1 `no-img-element`, none introduced this pass, see `FRONTEND_AUDIT.md` issue 11/12 for the full list and why they were left alone)
- `npm run build` — **clean, all 41 routes compile**

## Known limitations / what remains

- **~33 avoidable `any` usages remain**, down from ~85 after this pass fixed `components/ClientModal.tsx` (14) and `app/(app)/work/[engagementId]/page.tsx` (11) on top of `app/(app)/work/page.tsx` (15, fixed in the first pass). Remaining: mainly `app/(app)/clients/[id]/page.tsx` and a handful of smaller components/routes not touched this pass.
- **`window.confirm()` conversion is now complete app-wide** — all 20 original call sites (3 in the first pass, 17 in this continuation pass) now use the shared `ConfirmDialog` + `useToast` pattern. Zero `window.confirm()` calls remain in the codebase.
- **`bookkeeping`/`payroll`/`tax` navigation** intentionally left unresolved. Verified against confirmed production (`euxfopzgdmlmgcmmjvic`): `/tax` and `/payroll` have a real schema path to becoming specialized Service Workspace views (`tax_returns.engagement_id`, `payroll_clients.engagement_id`/`.service_id`); `/bookkeeping` has no equivalent link yet — see `FRONTEND_BACKEND_GAPS.md` #1. Do not wire these into nav without a backend/product decision.
- **Project-identity question raised, investigated, and resolved this session** — a different Supabase project (`aewqbffscdrziiwfomyf`) was briefly treated as production based on a mistaken instruction, leading to an incorrect "~95% schema mismatch" conclusion in an earlier draft of this document. That was corrected by verifying live against both projects: `euxfopzgdmlmgcmmjvic` (what this codebase has always queried) is confirmed production — all 59 tables, 3 views, 29 RPCs, and the 1 storage bucket the frontend references exist there. See `FRONTEND_BACKEND_GAPS.md` "Project-identity correction" and the Correction pass below.
- **Accessibility, responsive, and the remaining 8 functional areas** (billing, calendar, messages, team/settings, client portal, workflows, templates, intake beyond what already exists) were audited for obvious defects (none found — see `FRONTEND_AUDIT.md`) but not given a dedicated line-by-line pass in this session. If a next pass is scoped, start there.
- `react-hooks/exhaustive-deps` warnings (12 sites) were left alone deliberately — they're the common "stable `load` function excluded to avoid a refetch loop" pattern, and a blind fix risks introducing fetch loops. Worth a careful, one-by-one pass, not a blanket fix.

## Recommended next steps (as of the first pass — see "Continuation pass" below for what changed)

1. Get an answer on the `bookkeeping`/`payroll`/`tax` vs. unified Service Workspace question (`FRONTEND_BACKEND_GAPS.md` #1) — this unblocks either deleting three orphaned page trees or properly wiring real, valuable functionality back into the product.
2. Convert the remaining `window.confirm()` call sites to `ConfirmDialog` — the pattern is proven, it's now mechanical work.
3. Confirm whether `communication_messages` is still live (`FRONTEND_BACKEND_GAPS.md` #2) before touching the one place it's read.
4. If firm-authored `form_templates` field editing is actually wanted, that's a backend schema project first (`FRONTEND_BACKEND_GAPS.md` #3), frontend second.
5. A dedicated accessibility pass (keyboard nav, focus order, contrast) across the highest-traffic pages, now that `ConfirmDialog` sets a pattern for accessible modals to follow.

---

## Continuation pass

This pass picked up two explicit backend-decision questions plus the remaining mechanical cleanup items 2 and (partially) items from the original "known limitations" list.

### `communication_messages` and `/bookkeeping`/`/payroll`/`/tax` investigations (Decisions 1 & 2) — initial findings, later corrected

This pass's investigation into both Decisions was carried out against a Supabase project (`aewqbffscdrziiwfomyf`) that an explicit instruction identified as production. That instruction turned out to be mistaken. The findings drafted at the time (a proposed `conversations`/`messages` replacement for `communication_messages`, and a "~95% schema mismatch" framing for the bookkeeping/payroll/tax question) were built on the wrong project and have been superseded — see "Correction pass" below for the re-verified findings against confirmed production (`euxfopzgdmlmgcmmjvic`). Nothing was changed in the codebase as a result of the incorrect findings; the only cost was drafting time on documentation, which has now been corrected.

### `any`-type cleanup

- `components/ClientModal.tsx` — all 14 `any` usages replaced with locally-defined types matching the actual `.select(...)` column lists (`WorkspaceMemberRow`, `TagAssignmentRow`, `TeamMemberIdRow`, `ServiceInterestRow`, `PrimaryContactRow`, `ContactSearchRow`). Two sites needed `as unknown as X` (not a direct cast) because Supabase's untyped client infers embedded to-one relations as arrays without generated Database types, while PostgREST's actual runtime response is a single object for genuine to-one foreign keys.
- `app/(app)/work/[engagementId]/page.tsx` — all 11 `any` usages replaced (`RequirementRow`, `ClientRequestRow`, `FormAssignmentRow`, `EngagementDocumentRow`, `MessageThreadRow`, `SecureMessageRow`, `EngagementInvoiceRow`, `EngagementNoteRow`, `StatutoryDeadlineRow`), including the `save_task` RPC's untyped response cast and a `.forEach((m: any) =>` on the workspace-members query.
- Both files verified clean via `grep -n ": any\b\|as any\b\|<any"` and pass `npm run typecheck` with 0 errors.
- ~33 lower-traffic `any` usages remain elsewhere in the app (mainly `app/(app)/clients/[id]/page.tsx` and a handful of smaller components/routes) and are follow-up work, not silently dropped.

### `window.confirm()` → `ConfirmDialog` conversion — completed in full

All 17 remaining files (20 call sites) converted this pass: `app/(app)/billing/[id]/page.tsx`, `components/EngagementModal.tsx`, `components/PayrollTaxDepositModal.tsx`, `components/TaxReturnModal.tsx`, `components/PayrollRunModal.tsx`, `components/RecurringInvoiceModal.tsx`, `components/ClientModal.tsx` (second confirm site, client delete), `components/PayrollRunItemModal.tsx`, `components/TransactionModal.tsx`, `components/FinancialAccountModal.tsx`, `components/PayrollEmployeeModal.tsx`, `components/PayrollFilingModal.tsx`, `components/PayrollClientModal.tsx`, `components/NewDeadlineModal.tsx`, `components/TaxEstimateModal.tsx`, `components/PeriodModal.tsx`, `components/InvoiceLineItemModal.tsx`. Every one follows the same pattern already established with `documents`, `clients/[id]`, and `NewTaskModal`: a `confirmingDelete`/`deleteTarget` state gates a `ConfirmDialog`, the actual delete only runs from `onConfirm`, and the trigger button just sets that state. `grep -rn "window.confirm(" app components` now returns zero matches (the only remaining hit is a code comment inside `ConfirmDialog.tsx` itself, describing what it replaces).

### QC results after this pass

- `npm run typecheck` — clean, 0 errors
- `npm run lint` — 0 errors, same 14 pre-existing warnings as baseline, no new warnings introduced by this pass
- `npm run build` — clean, all 41 routes compile

---

## Correction pass

An instruction mid-engagement identified `aewqbffscdrziiwfomyf` as the confirmed production Supabase project, contradicting what this codebase's `.env.local.example` had pointed at from the start (`euxfopzgdmlmgcmmjvic`). The Continuation pass's `communication_messages` and bookkeeping/payroll/tax findings were drafted against that instruction.

While tracing where `euxfopzgdmlmgcmmjvic` was referenced in the repo (per the correction request), two pre-existing, previously-committed documents surfaced — `VerexaHQ_Canonical_Backend_Contract.md` and `VEREXAHQ_CLAUDE_CODE_HANDOFF.md`, both dated the week before this session — that independently named `euxfopzgdmlmgcmmjvic` as verified production and `aewqbffscdrziiwfomyf` as do-not-use, including a description of a live migration that renamed a storage bucket in place to `verexahq-client-documents`. That directly contradicted the correction instruction, so rather than pick a side from documentation alone, I verified both claims live against both projects' actual databases:

- **`verexahq-client-documents` storage bucket:** exists on `euxfopzgdmlmgcmmjvic`, exactly as named. Does not exist on `aewqbffscdrziiwfomyf`.
- **RPC signatures:** all 29 RPCs the frontend calls exist on `euxfopzgdmlmgcmmjvic` with matching parameter lists (spot-verified `save_task`, `complete_task`, `apply_service_template_to_client`, and others down to the exact parameter name). None of the frontend's RPCs exist on `aewqbffscdrziiwfomyf`.
- **Usage pattern:** `euxfopzgdmlmgcmmjvic` has 1 real `auth.users` row, 1 workspace, 1 workspace member, and 7 clients — consistent with an app someone is actually signing into and using. `aewqbffscdrziiwfomyf` has 0 `auth.users` rows and 0 `workspace_members` despite having 3 client rows — data inserted directly via SQL, not through the app.

I reported this evidence to the user rather than acting on it unilaterally, since it directly reversed an explicit instruction. The user confirmed: `euxfopzgdmlmgcmmjvic` is production; `aewqbffscdrziiwfomyf` is a separate schema-development/testing project and should not be aligned to.

### Full resource re-audit against confirmed production (`euxfopzgdmlmgcmmjvic`)

Every resource the frontend touches was checked directly against the live schema, not inferred:

- **Tables:** 59 of 59 `.from(...)` targets exist by exact name.
- **Views:** 3 of 3 (`v_engagement_workspace`, `v_my_notifications`, `v_workspace_subscription_summary`) exist.
- **RPCs:** 29 of 29 `.rpc(...)` calls exist, with argument lists matching the frontend's call sites.
- **Storage:** the 1 bucket used (`verexahq-client-documents`) exists.
- **Column-level spot checks** on the highest-traffic tables (`clients`, `documents`, `invoices`, `workspace_members`) — every column the frontend selects or filters on exists with the expected type (`business_name`, `account_name`, `document_name`, `document_status`, `is_visible_to_client`, `invoice_number`, `total_amount`, `amount_paid`, `invoice_status`, `display_name`, etc.).

**Zero genuine resource-existence mismatches found.** This directly reverses the Continuation pass's "~95% missing" conclusion, which was measuring against the wrong project.

### `communication_messages` — re-verified, no replacement needed

Re-checked against confirmed production: `communication_messages` is real, has full CRUD RLS for `authenticated`, and its columns (`direction`, `channel`, `message_status`, `from_address`, `to_address`, `provider_name`, `provider_message_id`, etc.) are an email/SMS delivery log — matching the "Communication" tab and "Recent Communication" card it already feeds, exactly. It has 0 rows because nothing writes to it, not because it's the wrong table. There is no `conversations`/`messages` pair on this project (that pairing only existed on the wrong project checked during the Continuation pass), so the previously-proposed replacement doesn't apply. **The read was left unchanged — it's already correct.** No code changes were made or needed for Decision 2.

### `/bookkeeping`, `/payroll`, `/tax` vs. unified Service Workspace — re-verified with column-level detail

Checked live: `tax_returns.engagement_id` and `payroll_clients.engagement_id`/`.service_id` are real columns providing a direct FK path into the unified `engagements`/`services` tables (`engagements.service_id`, `.pipeline_id`, `.pipeline_stage_id` all exist and are populated with 6 real rows). `bookkeeping_engagements` has neither `engagement_id` nor `service_id` — no schema path exists for it today. All four tables (`tax_returns`, `payroll_clients`, `bookkeeping_engagements`, `services`) are currently empty in production, so this is a pure schema-capability finding.

**No navigation was wired and no pages were rewritten this pass** — `/tax` and `/payroll` have a real, low-risk path to becoming specialized views, but doing so is still a product decision (which UI is authoritative, whether to fold the standalone pages into `/work`) and would mean building real filter/query logic against a model with no live data yet to validate against. `/bookkeeping` needs a schema migration first, which is out of scope. See `FRONTEND_BACKEND_GAPS.md` #1 for the full column table.

### Documentation corrected

`FRONTEND_BACKEND_GAPS.md`, `FRONTEND_AUDIT.md` (issues #2, #8, #13), and this report were all rewritten to reflect the corrected findings above and remove the incorrect "~95% missing" framing.

### QC results after the Correction pass

- `npm run typecheck` — clean, 0 errors
- `npm run lint` — 0 errors, same 14 pre-existing warnings, no new warnings
- `npm run build` — clean, all 41 routes compile

(No application code changed in this pass — it was documentation-only, since both investigated items turned out not to need a code fix once measured against the correct project.)

### Updated recommended next steps

1. Decide whether `/tax` and `/payroll` should be rebuilt as specialized Service Workspace views (schema already supports it via `engagement_id`/`service_id`) or remain standalone pages linked into nav as-is; plan a linking-column migration for `/bookkeeping` if it should join the same model.
2. If a communication-history feature is wanted, wire `lib/notify.ts`'s send functions to insert into `communication_messages` — no new schema required, RLS is already production-ready.
3. The remaining ~33 lower-traffic `any` usages (mainly `app/(app)/clients/[id]/page.tsx`).
4. If firm-authored `form_templates` field editing is actually wanted, that's a backend schema project first (`FRONTEND_BACKEND_GAPS.md` #3), frontend second.
5. A dedicated accessibility pass (keyboard nav, focus order, contrast) across the highest-traffic pages.
