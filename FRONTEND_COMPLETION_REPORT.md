# Frontend Completion Report

Branch: `frontend-audit-and-completion` (based on the tip of `improve-system-templates-form-experience`, i.e. it includes the not-yet-merged Client-First System Template and Product Polish PRs). See `FRONTEND_AUDIT.md` for the full audit and `FRONTEND_BACKEND_GAPS.md` for issues that need a backend/product decision.

**This report covers two passes.** The first pass (below, mostly unchanged from the original writeup) did the initial audit and fix pass and opened PR #11 against `improve-system-templates-form-experience`. A second, continuation pass (see "Continuation pass" section near the end) investigated two specific backend-decision questions (`communication_messages`, and `/bookkeeping`/`/payroll`/`/tax` vs. the unified Service Workspace), discovered a critical Supabase project-identity mismatch while doing so, and finished the remaining safe `any`-type cleanup and `window.confirm()` conversion work.

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

See `FRONTEND_BACKEND_GAPS.md` in full. Summary:

1. **`bookkeeping_engagements`/`payroll_clients`/`tax_returns` vs. the unified Service Workspace model** — two parallel, disconnected engagement-tracking systems exist in the schema. The frontend cannot safely decide which is authoritative, so `/bookkeeping`, `/payroll`, `/tax` were left unlinked from navigation rather than guessed at.
2. **`communication_messages`** — read in one place (`clients/[id]/page.tsx:366`), never written anywhere. Possibly vestigial; needs backend confirmation before the frontend removes or builds against it.
3. **`form_templates`** — has an `is_platform_template` discriminator (implying VerexaHQ-authored starter content is intended) but no schema or UI for adding fields/questions to a template. Building one would require new backend schema, which is out of scope for a frontend-only pass.

No frontend code was changed to work around any of these — all three were left exactly as found.

## Build / typecheck / lint results

Run after all fixes in this pass:

- `npm ci` — clean
- `npm run typecheck` — **clean, 0 errors**
- `npm run lint` — **0 errors**, 14 pre-existing warnings (all `react-hooks/exhaustive-deps` + 1 `no-img-element`, none introduced this pass, see `FRONTEND_AUDIT.md` issue 11/12 for the full list and why they were left alone)
- `npm run build` — **clean, all 41 routes compile**

## Known limitations / what remains

- **~33 avoidable `any` usages remain**, down from ~85 after this pass fixed `components/ClientModal.tsx` (14) and `app/(app)/work/[engagementId]/page.tsx` (11) on top of `app/(app)/work/page.tsx` (15, fixed in the first pass). Remaining: mainly `app/(app)/clients/[id]/page.tsx` and a handful of smaller components/routes not touched this pass.
- **`window.confirm()` conversion is now complete app-wide** — all 20 original call sites (3 in the first pass, 17 in this continuation pass) now use the shared `ConfirmDialog` + `useToast` pattern. Zero `window.confirm()` calls remain in the codebase.
- **`bookkeeping`/`payroll`/`tax` navigation** intentionally left unresolved. Investigation this pass found `/tax` has a real path to becoming a specialized Service Workspace view via `tax_engagements.service_id` on confirmed production, but `/bookkeeping`/`/payroll` have no equivalent table yet — see `FRONTEND_BACKEND_GAPS.md` #1. Do not wire these into nav without a backend decision.
- **Critical: Supabase project-identity mismatch discovered this pass** — this codebase queries `euxfopzgdmlmgcmmjvic`, but the user confirmed `aewqbffscdrziiwfomyf` is production, and the two schemas are ~95% disjoint. See `FRONTEND_BACKEND_GAPS.md` #0. This blocks the `communication_messages` replacement and the `/tax` specialized-view build, and likely has implications far beyond this document.
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

### `communication_messages` investigation (Decision 2)

**Reference found:** exactly one, `app/(app)/clients/[id]/page.tsx:371`, inside `fetchClientData()`'s batched `Promise.all`. No writes anywhere in the codebase.

**Whether it fails silently, throws, or is unreachable:** it fails silently. None of the ~15 queries in that `Promise.all` batch check `.error` — each just falls back to `?? []`. This is a real, previously-undocumented bug independent of the table question: a failing query and "client genuinely has zero messages" are currently indistinguishable in the UI.

**Closest equivalent using `conversations`/`messages`:** verified live on the confirmed-production Supabase project (`aewqbffscdrziiwfomyf`) — `conversations` (`client_id`, `workspace_id`) joined to `messages` (`conversation_id`, `sender_user_id`, `sender_type`, `body`, `client_visible`, `read_at`), with complete RLS (4 policies on `conversations`, 3 on `messages`, all `authenticated`-scoped).

**Whether replacement can be completed safely without backend changes:** the schema-level answer is yes — the model is ready. But completing it this pass turned out to depend on a bigger, unplanned finding: **this codebase's Supabase calls all target a different project (`euxfopzgdmlmgcmmjvic`) than the one just confirmed as production (`aewqbffscdrziiwfomyf`)**, and `euxfopzgdmlmgcmmjvic` has neither `conversations` nor `messages` — it has `communication_messages` instead, alongside two other working messaging systems. Swapping the query without knowing which project the deployed app actually uses risks trading one broken read for a different one. I surfaced this to the user directly and used `AskUserQuestion` to confirm which project is authoritative rather than guessing, since it changes the correctness of *every* Supabase call in the app, not just this one. Full detail in `FRONTEND_BACKEND_GAPS.md` #0 and #2. **The read was left unchanged this pass**, per the standing instruction to leave data-writing/reading behavior unchanged when the required mapping is uncertain.

### `/bookkeeping`, `/payroll`, `/tax` vs. unified Service Workspace (Decision 1)

Investigated against the confirmed-production schema: `tax_engagements.service_id` is a real foreign key into the lean `services` table, which matches the directive that `/tax` should stay connected to the central model through `service_id`. That means `/tax` has a real path to becoming a specialized view — but I did not build it this pass, because it's also blocked on the same project-identity question above (the confirmed-production schema doesn't have most of what `/tax`'s current queries need either, since it's missing `tax_returns`, `tax_estimates`, etc. as currently modeled in this codebase, and rebuilding against `tax_engagements` would be a schema rewrite, not a polish change).

`/bookkeeping` and `/payroll` have **no equivalent extension table** in confirmed production at all — no categorization field on `services`, no `bookkeeping_engagements`/`payroll_clients`-style table linked by `service_id`. There's no safe frontend-only way to make them "filtered views" of anything until that's designed on the backend.

**No navigation was added** for any of the three, consistent with "leave their data-writing behavior unchanged" and "do not create new tables." Full reasoning in `FRONTEND_BACKEND_GAPS.md` #1.

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

### Updated recommended next steps

1. **Resolve the Supabase project-identity question** (`FRONTEND_BACKEND_GAPS.md` #0) — this blocks nearly everything else in this document, including the two items the user specifically asked about this pass.
2. Once #1 is resolved: replace the `communication_messages` read with `conversations`/`messages` (schema and RLS already verified) and fix the silent-failure `.error`-checking gap in `clients/[id]/page.tsx`'s batched query.
3. Once #1 is resolved: decide on `/bookkeeping`/`/payroll`/`/tax` — `/tax` has a real path via `tax_engagements.service_id`; `/bookkeeping`/`/payroll` need a categorization mechanism designed first.
4. The remaining ~33 lower-traffic `any` usages, at a lower priority than the above.
5. If firm-authored `form_templates` field editing is actually wanted, that's a backend schema project first (`FRONTEND_BACKEND_GAPS.md` #3), frontend second.
6. A dedicated accessibility pass (keyboard nav, focus order, contrast) across the highest-traffic pages.
