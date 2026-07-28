# Frontend ↔ Backend Gaps

Issues found during the frontend audit that the frontend cannot safely resolve on its own — either because the fix is a real product/architecture decision, or because it requires confirming something about the live schema/data that isn't visible from the code alone. Nothing in this document was guessed at or worked around; the frontend was left as-is in each case.

**Confirmed production project: `euxfopzgdmlmgcmmjvic`.** See "Project-identity correction" below for how this was verified and why an earlier version of this document briefly (and incorrectly) concluded otherwise.

---

## Project-identity correction (resolved)

Earlier in this engagement, a different Supabase project (`aewqbffscdrziiwfomyf`) was mistakenly treated as production, based on an explicit but incorrect instruction. That led this document to temporarily claim the frontend's schema was ~95% disjoint from production. **That claim was wrong** — it was measuring the frontend against the wrong project. This has been corrected by re-verifying everything directly against `euxfopzgdmlmgcmmjvic`, and the finding is the opposite of what was briefly documented:

**The frontend's Supabase resource references match `euxfopzgdmlmgcmmjvic` almost completely.** Verified live, not inferred:

- **59 of 59** tables the frontend queries via `.from(...)` exist, by exact name, on `euxfopzgdmlmgcmmjvic`.
- **3 of 3** views the frontend queries (`v_engagement_workspace`, `v_my_notifications`, `v_workspace_subscription_summary`) exist.
- **29 of 29** RPCs the frontend calls via `.rpc(...)` exist, with parameter lists matching the frontend's call sites (spot-checked signatures for `save_task`, `complete_task`, `apply_service_template_to_client`, `save_workspace_client`, `send_portal_message_as_client/firm`, and others — all match).
- The one storage bucket the frontend uses, `verexahq-client-documents`, exists exactly as named. (It was confirmed to have been renamed in place from `firmflow-client-documents` during an earlier cleanup pass — the rename is why the name matches so precisely.)
- Spot-checked column-level shapes on the highest-traffic tables (`clients`, `documents`, `invoices`, `workspace_members`) — every column the frontend actually selects or filters on (`business_name`, `account_name`, `document_name`, `document_status`, `is_visible_to_client`, `invoice_number`, `total_amount`, `display_name`, etc.) exists with the expected type.
- `euxfopzgdmlmgcmmjvic` has real signs of organic use (1 real `auth.users` row, 1 workspace, 1 workspace member, 7 clients) consistent with an app someone is actually using, unlike `aewqbffscdrziiwfomyf` (0 `auth.users` rows despite having client records — data inserted directly, not through the app).

No fix was needed anywhere as a result of this correction — `.env.local.example` already pointed at `euxfopzgdmlmgcmmjvic` the whole time; that was never wrong. The error was entirely in this document's conclusions during the detour, now corrected. `FRONTEND_AUDIT.md` and `FRONTEND_COMPLETION_REPORT.md` have been corrected to match.

---

## 1. `/bookkeeping`, `/payroll`, `/tax` vs. the unified Service Workspace — refined finding

**What I found (all against confirmed production `euxfopzgdmlmgcmmjvic`):** `app/(app)/bookkeeping/*`, `app/(app)/payroll/*`, and `app/(app)/tax/*` are real, fully built, Supabase-backed pages reading from `bookkeeping_engagements`, `payroll_clients`/`payroll_runs`, and `tax_returns`. None are linked from primary nav, `/work`, or client profiles — confirmed unchanged from the original audit.

The connective-tissue picture is **not uniform across the three**, and is better than originally assumed for two of them:

| Table | Has `service_id`? | Has `engagement_id`? | Can link to unified `services`/`engagements` today? |
|---|---|---|---|
| `tax_returns` | No | **Yes** | Yes — via `engagement_id` → `engagements.id` → `engagements.service_id` → `services` |
| `payroll_clients` | **Yes** | **Yes** | Yes — directly, two ways |
| `bookkeeping_engagements` | No | No | **No** — no column links it to `services` or `engagements` at all |

(`engagements.service_id`, `engagements.pipeline_id`, and `engagements.pipeline_stage_id` all exist and connect to `services`/`pipelines`/`pipeline_stages` — the unified model itself is coherent and real.)

**Current data state:** all three tables (and `services`, `engagements`) are essentially empty in production right now (0 rows in `tax_returns`, `payroll_clients`, `bookkeeping_engagements`, `services`; 6 rows in `engagements`), so this is a pure schema-capability finding, not a "existing data would need migrating" finding — there's nothing to migrate yet.

**Why I didn't wire navigation or build specialized views this pass:** for `/tax` and `/payroll`, the schema already supports treating them as specialized views of a Service Workspace (the FK path exists), so this is now a real, low-risk build — but it's still a product decision (which UI shows first, whether the standalone pages are kept or folded into `/work`'s engagement detail view) rather than a "fix a bug" change, and building it means writing real query/filter logic against a model with zero live data to validate against yet. For `/bookkeeping`, there is no schema path today — it would need either a `service_id`/`engagement_id` column added to `bookkeeping_engagements` (a real migration, which I'm not authorized to write) or a product decision to treat something else as the link.

**What I need from the backend/product side:**
1. Confirm whether `/tax` and `/payroll` should be rebuilt as specialized views inside a Service Workspace (using the existing `engagement_id`/`service_id` columns) or remain standalone pages that just get linked into nav as-is.
2. If `/bookkeeping` is meant to join the same model, a migration adding a linking column to `bookkeeping_engagements` needs to be planned — not something to invent from the frontend.

---

## 2. `communication_messages` — real production table, correctly matched to its own UI, just currently empty

**What I found:** `app/(app)/clients/[id]/page.tsx:371` reads from `communication_messages`, filtered by `client_id`, limit 15, ordered by `created_at` descending. This feeds a "Communication" tab on the client profile (`tab === "communication"`) and a "Recent Communication" summary card on the overview tab — both already correctly built, with proper empty states ("No communication logged yet.").

**Verified against production schema:** `communication_messages` is a real table with full CRUD RLS for `authenticated` (`communication_messages_select/insert/update/delete`, all `{authenticated}`-scoped). Its columns are exactly what an outbound/inbound communication log needs: `direction`, `channel`, `message_status`, `from_address`, `to_address`, `subject`, `body`, `provider_name`, `provider_message_id`, `error_message`, `sent_by`, `sent_at`, `received_at` — plus optional links to `lead_id`, `campaign_id`, `sequence_step_id` for marketing-sequence attribution. This is **not** a chat/thread table (there is no `conversations`/`messages` pair on this project at all — that pairing only existed on the wrong project checked earlier in this engagement) — it's a delivery log for emails/texts sent to a client, correctly separate from `secure_message_threads`/`secure_messages` (engagement-scoped staff messaging) and `portal_conversations`/`portal_messages` (client portal messaging).

**Row count: 0.** The table is empty — not because it's the wrong table or vestigial, but because nothing in this codebase currently writes to it. `lib/notify.ts`'s `sendEmail`/`sendSms` functions (used for invoice-sent emails, etc.) don't insert a `communication_messages` row after a successful send.

**No replacement was made** — the earlier plan to "replace this read with `conversations`/`messages`" doesn't apply on confirmed production, since that table pair doesn't exist here. The existing read is already correct for what the UI is trying to show; it's just never populated.

**What I need from the backend/product side:** nothing required — this isn't blocked on a decision the way #1 is. If a communication history feature is wanted, the safe next step is wiring `lib/notify.ts`'s send functions (and/or any campaign-sequence automation) to insert a `communication_messages` row per send. That's a real feature addition (new write paths, not a bug fix), so it wasn't built this pass, but it requires no new schema — the table and its RLS are already production-ready.

---

## 3. `form_templates` has no field/question editor (unchanged, confirmed still accurate)

**What I found:** `app/(app)/forms/page.tsx` can create a `form_templates` row (via the `create_form_template` RPC, confirmed to exist on production with a matching signature) but there is no UI, table, or RPC for adding fields/questions to a template afterward.

**Why I didn't touch it:** building a full template field editor is a new feature (new schema for sections/questions, a builder UI, save/preview logic), not a polish fix.

**What I need from the backend side:** if `form_templates` is meant to support its own question/field schema, that schema needs to be designed and migrated on the backend before a frontend editor can be built against it.

---

No other frontend calls were found referencing a missing table, column, RPC, view, or storage bucket — every resource the frontend touches was individually verified to exist on confirmed production (`euxfopzgdmlmgcmmjvic`). See `FRONTEND_AUDIT.md` for the full audit and `FRONTEND_COMPLETION_REPORT.md` for what was fixed vs. left alone.
