# Frontend ↔ Backend Gaps

Issues found during the frontend audit that the frontend cannot safely resolve on its own — either because the fix is a real product/architecture decision, or because it requires confirming something about the live schema/data that isn't visible from the code alone. Nothing in this document was guessed at or worked around; the frontend was left as-is in each case.

---

## 0. CRITICAL: the deployed frontend queries a different Supabase project than confirmed production

**What I found:** this codebase's `.env.local.example` and every Supabase call in the frontend target project `euxfopzgdmlmgcmmjvic`. That project has `communication_messages`, `portal_conversations`/`portal_messages`, `secure_message_threads`/`secure_messages`, and every other table the current frontend code queries (`tasks`, `deadlines`, `invoices`, `bookkeeping_engagements`, `payroll_clients`, `tax_returns`, `pipelines`, `account_contacts`, `contacts`, `client_tags`, `tax_organizer_*`, etc.).

While investigating the two items below, I found a second, structurally different Supabase project, `aewqbffscdrziiwfomyf`, that the user had separately directed a storage-policy statement to earlier in this engagement. I asked the user directly which project is the real production database (`AskUserQuestion`, rather than guess), and the user confirmed **`aewqbffscdrziiwfomyf` is production**.

`aewqbffscdrziiwfomyf`'s schema is a cleaner, more sophisticated design (`conversations`/`messages` with tight RLS, `tax_engagements` linked to a lean `services` table via `service_id`, a rich `intake_*` system, `workflow_*` engine, `compliance_*`, `document_requests`, `client_addresses`/`client_contacts`/`client_ownerships`, `templates`/`template_versions`) — but it is **missing almost every table this frontend codebase currently queries**: no `tasks`, `deadlines`, `invoices`, `bookkeeping_engagements`, `payroll_clients`, `pipelines`, `account_contacts`, `client_tags`, `tax_organizer_*`, and more. Roughly 95% of this codebase's Supabase calls reference tables that do not exist on the confirmed-production project.

**Why I didn't touch it:** this is far larger than a "fix one query" problem. I have no way to verify from the frontend which project the *deployed* app's environment variables actually point at (that's a Vercel/hosting config question, not something visible in the repo), and rewriting queries against `aewqbffscdrziiwfomyf`'s schema wholesale would mean guessing at RPC signatures, join shapes, and column names for a schema I can only see the shape of, not the intended usage of — directly against the standing rule "do not invent new tables, columns, RPCs... if an existing frontend call references a missing field, table, route, or RPC, do not invent it."

**What I need from the backend side:** confirmation of which Supabase project the deployed (Vercel) frontend's `NEXT_PUBLIC_SUPABASE_URL`/anon key actually point at today. If it's `euxfopzgdmlmgcmmjvic`, the app is functioning against a project the business considers non-production, and someone needs to decide whether to migrate data into `aewqbffscdrziiwfomyf` or make `euxfopzgdmlmgcmmjvic` the acknowledged production project. If it's already `aewqbffscdrziiwfomyf`, then this frontend codebase is almost entirely broken against its own backend today, independent of anything in this document, and that's a far higher priority than any item below.

Everything below (communication_messages, and the bookkeeping/payroll/tax vs. Service Workspace question) was investigated against **both** projects so the findings hold regardless of how #0 above gets resolved.

---

## 1. Parallel, disconnected engagement models: `/bookkeeping`, `/payroll`, `/tax` vs. the unified Service Workspace

**What I found on `euxfopzgdmlmgcmmjvic` (what the frontend code currently queries):** `app/(app)/bookkeeping/page.tsx` + `[id]/page.tsx`, `app/(app)/payroll/page.tsx` + `[id]/page.tsx` + `runs/[runId]/page.tsx`, and `app/(app)/tax/page.tsx` + `[id]/page.tsx` + `organizers/*` are all real, fully built, Supabase-backed pages (the bookkeeping period reconciliation page alone is 779 lines). They read from dedicated tables: `bookkeeping_engagements`, `payroll_clients`/`payroll_runs`, `tax_returns`.

None of these pages are linked from anywhere in the app — not the primary nav (`app/(app)/layout.tsx`'s `PRD_NAV`, explicitly commented as "per the approved product spec"), not `/work` (which the file itself describes as "Everything your firm has open, across every Service Workspace"), and not the client profile page.

`/work` and the client profile instead operate on a unified `services` / engagement-workspace model keyed by a generic `service_type` column (`lib/types.ts:106,189,200,560,569,707,735`), which does not reference `bookkeeping_engagements`, `payroll_clients`, or `tax_returns` anywhere.

**What I found on `aewqbffscdrziiwfomyf` (confirmed production), per the user's Decision 1 directive that `/work` + the unified `services` model is authoritative:** I verified `tax_engagements.service_id` is a real foreign-key-shaped column linking to the lean `services` table — this directly matches the directive that "`/tax` may use the specialized `tax_engagements` data... connected to the central service/work model through `service_id`." That part of the target architecture already exists in the confirmed-production schema.

However, **there is no equivalent specialized table for bookkeeping or payroll** in `aewqbffscdrziiwfomyf` — no `bookkeeping_engagements`, no `payroll_clients`/`payroll_runs`, nothing that could become a "filtered or specialized view" the way `tax_engagements` can. The `services` table itself is lean and carries no categorization/service-type column I could safely filter on to build a bookkeeping- or payroll-specific view without inventing a field.

**Why I didn't touch it:** for `/tax`, converting it to a specialized view of the unified workspace is *architecturally possible* given `service_id`, but I did not attempt it this pass because it also depends on resolving #0 above — I can't safely rewrite `/tax` against `aewqbffscdrziiwfomyf`'s tables while the deployed app may be pointed at `euxfopzgdmlmgcmmjvic`, where `tax_engagements` doesn't exist at all. For `/bookkeeping` and `/payroll`, there is currently no backing data model on the confirmed-production project to make them specialized views of anything — building one would mean creating new tables or columns, which I'm barred from doing.

**What I need from the backend side:**
1. Resolution of #0 above (which project is actually deployed).
2. Once that's settled: if `/bookkeeping` and `/payroll` are meant to become specialized views of the unified Service Workspace the way `/tax` can via `tax_engagements.service_id`, they need an equivalent categorization mechanism (either a `service_type`/category column on `services`, or dedicated `bookkeeping_engagements`/`payroll_clients`-style extension tables linked by `service_id`) designed and migrated on the backend before the frontend can build those views without guessing at a data model.

---

## 2. `communication_messages` — read in one place, never written; not present on confirmed production at all

**What I found:** `app/(app)/clients/[id]/page.tsx:371` (inside `fetchClientData()`) reads from a table called `communication_messages`, filtered by `client_id`, as one of roughly 15 queries batched together in a single `Promise.all([...])`. There is no `.insert()`, `.update()`, or any other write call against this table anywhere in the codebase.

**Silent-failure behavior found while investigating this:** none of the ~15 batched queries in that `Promise.all` (including the `communication_messages` one) ever check their `.error` field — each just does `setX((xRes.data as Type[]) ?? [])`. So if `communication_messages` doesn't exist on whichever project is actually deployed, that query fails, `.data` comes back `null`, and the UI silently shows an empty list with no error surfaced to the user or logged to the console. This is a real, previously-undocumented defect independent of which table is "correct" — a failing query in that batch is currently indistinguishable from a client that just has no messages. I did not fix this as part of this pass, since doing so touches the same code path as the table question below and I wanted to resolve what the query *should* be first rather than add error handling for a call that may need to be replaced entirely.

**Schema reality, both projects:**
- On `euxfopzgdmlmgcmmjvic` (what the code currently queries): `communication_messages` **does exist**, alongside two other, fully wired, actively-used messaging systems — `secure_message_threads`/`secure_messages` (engagement-scoped staff messaging, `app/(app)/work/[engagementId]/page.tsx`) and `portal_conversations`/`portal_messages` (staff↔client portal messaging, `app/(app)/messages/page.tsx`, `app/portal/messages/page.tsx`). It looks vestigial: read once, never written, redundant with two working systems.
- On `aewqbffscdrziiwfomyf` (confirmed production): `communication_messages` **does not exist at all**. The messaging model there is exactly `conversations` + `messages`, as the user described. I verified this live: `conversations` has `client_id`/`workspace_id`; `messages` has `conversation_id`/`sender_user_id`/`sender_type`/`body`/`client_visible`/`read_at`. RLS is complete and scoped to `authenticated` — 4 policies on `conversations` (`delete_staff`, `insert`, `select`, `update`) and 3 on `messages` (`insert`, `select`, `update_read_receipt`). This is a well-formed, ready-to-use model.

**Why I didn't replace the read with `conversations`/`messages` this pass:** the schema and RLS on `aewqbffscdrziiwfomyf` are solid enough that the swap itself would be mechanical — but doing it safely depends on #0 above. If the deployed app is actually pointed at `euxfopzgdmlmgcmmjvic` (which has neither `conversations` nor `messages`), swapping to that model would break the client profile page entirely, trading one broken read for a different one. I did not want to guess which failure mode is worse.

**What I need from the backend side:** once #0 is resolved, if `aewqbffscdrziiwfomyf` (or an equivalent schema with `conversations`/`messages`) is confirmed as what the frontend should target, replacing the `communication_messages` read at `app/(app)/clients/[id]/page.tsx:371` with a `conversations`/`messages` query is safe to do immediately — the relationships and RLS are already verified. Until then, the row stays exactly as found, and the silent-failure gap in that page's error handling should get its own follow-up regardless of which table wins.

---

## 3. `form_templates` has no field/question editor (carried over from prior work, still true)

**What I found:** `app/(app)/forms/page.tsx` — the "Forms & Templates" page — can create a `form_templates` row (name, category, description via the `create_form_template` RPC) but there is no UI, table, or RPC anywhere in the codebase for adding fields/questions to a template once created. `form_templates` does have an `is_platform_template` discriminator column (same pattern as `tax_organizer_templates`), implying VerexaHQ-authored starter templates are intended, but no seed data or editor exists yet. (This table exists on `euxfopzgdmlmgcmmjvic`; it was not part of the `aewqbffscdrziiwfomyf` schema comparison since it's outside the scope of what was checked there.)

**Why I didn't touch it:** Building a full template field editor (schema for sections/questions, a builder UI, save/preview logic) is a new feature, not a polish fix — it would violate "do not create new tables" and "do not invent new RPCs" if I tried to make it work end-to-end, and building a fake editor that saves nowhere is explicitly disallowed.

**What I need from the backend side:** if `form_templates` is meant to support its own question/field schema (the way `tax_organizer_templates` → `tax_organizer_sections` → `tax_organizer_questions` does), that schema needs to be designed and migrated on the backend before a frontend editor can be built against it.

---

No other frontend calls were found referencing a missing table, column, RPC, or storage bucket during this pass beyond what's documented above — see `FRONTEND_AUDIT.md` for the full audit and `FRONTEND_COMPLETION_REPORT.md` for what was fixed vs. left alone.
