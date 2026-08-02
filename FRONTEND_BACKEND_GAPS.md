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

## 3. `form_templates` has no field/question editor, and no assignment UI either (expanded during beta-readiness pass)

**What I found:** `app/(app)/forms/page.tsx` can create a `form_templates` row (via the `create_form_template` RPC, confirmed to exist on production with a matching signature) but there is no UI, table, or RPC for adding fields/questions to a template afterward.

**Newly confirmed this pass:** it's worse than "no editor" — there's no way to *assign* a form to a client from the UI at all. Four RPCs exist on production specifically for this (`assign_form_to_client`, `submit_assigned_form`, `mark_assigned_form_reviewed`, `request_form_changes`, all confirmed live with real signatures) but have **zero call sites anywhere in the frontend codebase**. The "Assigned forms" section on `/forms` is read-only — it displays existing `client_form_assignments` rows (if any exist from some other path) but has no button or flow to create one. Combined with the missing field/question editor, a template created today has no fields and can never be assigned to a client — the feature is scaffolded (real tables, real RPCs, a real list page) but not wired end-to-end.

**Why I didn't touch it:** building a full template field editor and an assignment flow is new feature work (new schema for sections/questions on `form_templates`, a builder UI, an "Assign to client" modal, wiring 4 existing-but-unused RPCs), not a polish fix. I did fix what was safely fixable in `/forms` this pass: removed 2 `any` types, removed a dead-code fallback referencing a nonexistent `is_platform_template` column (the real column is `is_system_template` — this was a genuine bug, since the "Verexa" platform-template badge could never render), and removed another dead-code fallback referencing a nonexistent `status` column on `client_form_assignments`.

**What I need from the backend/product side:** if `form_templates` is meant to support its own question/field schema, that schema needs to be designed and migrated first. Once it exists, wiring the "Assign to client" flow is comparatively straightforward — the RPCs are already there and verified.

---

## 4. Public Intake / Marketing Lead system — real production system with live client SSN/EIN data, entirely invisible to the CRM (found 2026-08-02)

**What I found:** production (`euxfopzgdmlmgcmmjvic`) has a complete, separate, already-in-use subsystem that none of the prior audit passes surfaced, because every prior pass discovered live schema by grepping this repo's `.from(...)`/`.rpc(...)` call sites — and **this repo's frontend has zero call sites into it**. It only surfaced this pass because `get_advisors(type: security)` flags every `anon`-executable `SECURITY DEFINER` function regardless of whether any frontend references it.

The tables: `intakes`, `intake_return_tokens`, `intake_identity_vault`, `intake_identity_change_events`, `intake_documents`, `intake_document_requests`, `intake_reasonable_inquiries`, `intake_status_history`, `intake_versions`, `intake_verification_challenges`, `marketing_leads`, `beta_access_codes`. None of these appear in `VEREXAHQ_CLAUDE_CODE_HANDOFF.md`'s "Live schema" section — that document was never wrong, it simply never had a reason to look here.

**It has real production data, right now:** 34 rows in `intakes`, 34 in `marketing_leads`, 25 active `intake_return_tokens`, 10 rows in `intake_identity_vault` (encrypted SSN/EIN/ITIN), 2 `intake_verification_challenges`, 3 `beta_access_codes`. This is not scaffolding — someone, or something, is actively using it in production.

**Read every `anon`-executable function's body** (`public_save_intake_identity`, `start_public_intake`, `start_public_business_intake`, `resume_public_intake`, `verify_intake_code`, `save_intake_progress`, `public_intake_identity_status`, `public_intake_documents`, `public_intake_document_requests`, `public_intake_open_inquiries`, `public_respond_intake_inquiry`, `public_set_intake_document_status`, `public_update_document_request`), not just the grant list:

- Token handling is sound: 32-byte random tokens, stored only as a SHA-256 hash (`intake_return_tokens.token_hash`), checked for `status = 'active'`, not revoked, not expired on every call. `verify_intake_code` correctly rotates (revokes-and-reissues) the token after a successful OTP check.
- SSN/EIN/ITIN handling in `public_save_intake_identity` is consistent with the existing `client_identity_vault` pattern already verified safe in earlier passes: value is validated (9 digits, or 6 for an IP PIN), encrypted server-side with `pgp_sym_encrypt` using a vault secret pulled via `_verexa_vault_secret` (never passed in from the caller), only a masked value + last-4 + one-way HMAC fingerprint are stored in the open, and a change-event row is written per write. `intake_identity_vault` itself has **zero** grants for `anon`/`authenticated` and RLS restricted to `service_role` — the only way in or out is through the RPCs, same as the existing vault.
- OTP verification (`verify_intake_code`) has its own attempt cap (`max_attempts`) and expiry, checked before comparing the hashed code.
- `marketing_leads` and `intakes` both carry real workspace-scoped RLS for staff (`is_workspace_member`/`can_staff_write`) — if a CRM UI is ever built against them, the tenant isolation is already correct.

**Real gap found, not a code bug:** `start_public_intake`/`start_public_business_intake` verify the given `p_workspace_id` merely *exists* — they do not verify the caller has any relationship to that workspace (there is no caller identity to check; these run as `anon`). Combined with no CAPTCHA/rate-limiting visible at the database layer, anyone who obtains or guesses a workspace UUID could inject junk `intakes`/`marketing_leads` rows into that workspace, or hammer the encryption/OTP paths. This may be entirely mitigated today by an external caller (rate limiting, bot protection, a public marketing site not in this repository) that this session cannot see — but it should not be assumed safe without confirming what actually calls these RPCs in production.

**Bigger operational gap:** four `staff_*` RPCs exist specifically to bring this data into the CRM (`staff_convert_intake_to_prospective_client`, `staff_match_intake_to_client`, `staff_resolve_intake_inquiry`, `staff_set_intake_status`), confirmed live, but — like `assign_form_to_client` and friends in finding #3 — **have zero call sites anywhere in this frontend.** The practical effect: 34 real prospective clients, several with real SSN/EIN already collected and encrypted through what looks like a public intake flow, are sitting in production with no page anywhere in this CRM for staff to see them, triage them, or convert them into a `clients` record. If this intake flow is live and actively bringing in leads (the row counts say it is), this is a materially larger gap for "is the CRM ready for beta" than anything else found across every pass to date, because staff using this CRM today cannot see 34 of their own real prospects without a direct database query.

**Why nothing was built or changed this pass:** exactly the same reasoning as findings #1 and #3 — this needs a product decision first (where does an "Intake/Leads" queue live in nav, what should staff see and be able to do, is the anon-facing intake form even meant to be paired with this CRM or does it belong to a separate marketing site entirely), not a guess. No RLS, grant, or code change was made — everything was left exactly as found.

**What I need from the backend/product side:**
1. Confirm what actually calls `start_public_intake`/`start_public_business_intake`/`public_save_intake_identity` today (a separate marketing site? a form embedded somewhere? nothing anymore?) and whether it has its own abuse protection, before assuming the open `p_workspace_id` check is low-risk.
2. Decide whether this CRM should get a staff-facing "Leads / Intake" view wired to the four existing `staff_*` RPCs — the RPCs and RLS are already production-ready; only the UI is missing.

---

No other frontend calls were found referencing a missing table, column, RPC, view, or storage bucket — every resource the frontend touches was individually verified to exist on confirmed production (`euxfopzgdmlmgcmmjvic`). See `FRONTEND_AUDIT.md` for the full audit and `FRONTEND_COMPLETION_REPORT.md` for what was fixed vs. left alone.
