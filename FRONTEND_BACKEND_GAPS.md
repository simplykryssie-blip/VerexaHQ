# Frontend ↔ Backend Gaps

Issues found during the frontend audit that the frontend cannot safely resolve on its own — either because the fix is a real product/architecture decision, or because it requires confirming something about the live schema/data that isn't visible from the code alone. Nothing in this document was guessed at or worked around; the frontend was left as-is in each case.

---

## 1. Parallel, disconnected engagement models: `/bookkeeping`, `/payroll`, `/tax` vs. the unified Service Workspace

**What I found:** `app/(app)/bookkeeping/page.tsx` + `[id]/page.tsx`, `app/(app)/payroll/page.tsx` + `[id]/page.tsx` + `runs/[runId]/page.tsx`, and `app/(app)/tax/page.tsx` + `[id]/page.tsx` + `organizers/*` are all real, fully built, Supabase-backed pages (the bookkeeping period reconciliation page alone is 779 lines). They read from dedicated tables: `bookkeeping_engagements`, `payroll_clients`/`payroll_runs`, `tax_returns`.

None of these pages are linked from anywhere in the app — not the primary nav (`app/(app)/layout.tsx`'s `PRD_NAV`, explicitly commented as "per the approved product spec"), not `/work` (which the file itself describes as "Everything your firm has open, across every Service Workspace"), and not the client profile page.

`/work` and the client profile instead operate on a unified `services` / engagement-workspace model keyed by a generic `service_type` column (`lib/types.ts:106,189,200,560,569,707,735`), which does not reference `bookkeeping_engagements`, `payroll_clients`, or `tax_returns` anywhere.

**Why I didn't touch it:** I can't tell from the frontend alone whether:
- (a) `bookkeeping_engagements`/`payroll_clients`/`tax_returns` are legacy tables from before the Service Workspace unification, already superseded and safe to leave unlinked (or eventually remove), or
- (b) they're still the live source of truth for those service lines, and the *unified* model is the one missing functionality, in which case these pages need to be properly wired back in (most likely as tabs inside a client's Service Workspace, given how much domain-specific detail they carry — reconciliation, payroll runs, tax return status).

Either answer implies real backend/data-model work, not a navigation-only frontend fix. Wiring them into nav without knowing which model is authoritative risks pointing users at stale or orphaned data.

**What I need from the backend side:** confirmation of which model (`bookkeeping_engagements`/`payroll_clients`/`tax_returns`, or the unified `services` table) is the current source of truth for these three service lines, and whether the standalone tables still receive writes.

---

## 2. `communication_messages` — read in one place, never written

**What I found:** `app/(app)/clients/[id]/page.tsx:366` reads from a table called `communication_messages`, filtered by `client_id`. There is no `.insert()`, `.update()`, or any other write call against this table anywhere in the codebase.

This sits alongside two other, fully wired, actively-used messaging systems:
- `secure_message_threads` / `secure_messages` — engagement-scoped staff messaging (`app/(app)/work/[engagementId]/page.tsx`)
- `portal_conversations` / `portal_messages` — staff↔client portal messaging (`app/(app)/messages/page.tsx`, `app/portal/messages/page.tsx`)

**Why I didn't touch it:** I can't tell whether `communication_messages` is a vestigial table left over from an earlier messaging design (in which case the read call on the client profile page should probably be removed as dead code), or whether it's populated by some backend process outside the frontend (a trigger, an integration, an email-ingestion pipeline) that the frontend was never given a write path for. Removing the read call is safe either way for *display* purposes, but I didn't want to silently drop a data source without knowing its purpose.

**What I need from the backend side:** confirmation of whether `communication_messages` is still populated by anything, and if so, by what — so the frontend can either build a proper write path or the dead read call can be safely removed.

---

## 3. `form_templates` has no field/question editor (carried over from prior work, still true)

**What I found:** `app/(app)/forms/page.tsx` — the "Forms & Templates" page — can create a `form_templates` row (name, category, description via the `create_form_template` RPC) but there is no UI, table, or RPC anywhere in the codebase for adding fields/questions to a template once created. `form_templates` does have an `is_platform_template` discriminator column (same pattern as `tax_organizer_templates`), implying VerexaHQ-authored starter templates are intended, but no seed data or editor exists yet.

**Why I didn't touch it:** Building a full template field editor (schema for sections/questions, a builder UI, save/preview logic) is a new feature, not a polish fix — it would violate "do not create new tables" and "do not invent new RPCs" if I tried to make it work end-to-end, and building a fake editor that saves nowhere is explicitly disallowed.

**What I need from the backend side:** if `form_templates` is meant to support its own question/field schema (the way `tax_organizer_templates` → `tax_organizer_sections` → `tax_organizer_questions` does), that schema needs to be designed and migrated on the backend before a frontend editor can be built against it.

---

No other frontend calls were found referencing a missing table, column, RPC, or storage bucket during this pass — see `FRONTEND_AUDIT.md` for the full audit and `FRONTEND_COMPLETION_REPORT.md` for what was fixed vs. left alone.
