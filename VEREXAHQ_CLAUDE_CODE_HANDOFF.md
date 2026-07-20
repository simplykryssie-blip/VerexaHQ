# VerexaHQ Frontend Build — Handoff for Claude Code

This document records the verified production Supabase state, most recently
re-verified and partly corrected on 2026-07-21. Use it to avoid inventing
table or column names — several claims in the original version of this doc
and in the Canonical Backend Contract turned out to be inaccurate when
checked directly against the live database; see "Corrections applied this
session" below before trusting anything else in these docs at face value.

# Project identity

- GitHub repo: `simplykryssie-blip/VerexaHQ`
- Vercel deployment: `verexa-hq-phi.vercel.app`
- Supabase project ref: `euxfopzgdmlmgcmmjvic`
- Positioning: tax hub for tax preparation, bookkeeping, payroll coordination, business formation and compliance

# Hard constraints

- Do not delete or overwrite `.env`, `.env.local`, Vercel environment variables, Git history, valid Supabase credentials, production data or existing migrations.
- Do not create a new Supabase project.
- Never put the Supabase service-role key in frontend code.
- Never expose Stripe secret keys to the browser.
- Never show a toggle that disables `Powered by VerexaHQ`.

# Corrections applied this session (2026-07-21)

Everything below was found by checking the live database directly (grants,
function bodies, RLS policies), not by trusting either this doc or the
Canonical Backend Contract as written. Full findings live in the git history
of `supabase/migrations/20260721090000_close_public_execute_gaps_and_rename_bucket.sql`.

1. **FirmFlow branding elimination — done.** Frontend never read
   `workspace_settings.show_firmflow_branding`/`firmflow_branding_text`/
   `firmflow_branding_url` (already correct). Grepped and fixed every other
   "firmflow" hit in application code: the storage bucket name (see below)
   and a portal `sessionStorage` key, now `verexahq-portal-selected-access`.
   The three legacy `workspace_settings` columns themselves are untouched —
   not yet safe to drop without a dependency review, per the original rule.

2. **`firmflow-client-documents` bucket — renamed, not just planned.**
   Verified 0 rows in `documents` and 0 objects in the bucket, then renamed
   it in place to `verexahq-client-documents` (an `UPDATE` on the bucket's
   primary key, not insert+delete — Supabase blocks direct `DELETE` on
   storage tables). Updated the 4 storage RLS policies and the
   `documents.storage_bucket` column default to match. All 5 frontend files
   that referenced the old bucket name are updated.

3. **The Canonical Backend Contract's §8 "security already applied" claims
   were only partly true — now fixed.** Verified live:
   - 5 of the 9 "read" RPCs (`get_client_billing_activity_contract`,
     `get_client_files_requests_contract`, `get_client_profile_contract`,
     `get_client_work_contract`, `list_workspace_clients_v2`) still carried
     a `PUBLIC` execute grant despite the contract's claim that "anonymous
     execution was revoked from... client contract reads." `PUBLIC` grants
     apply to every role including `anon` — this was a real gap, now closed.
   - Several worker/financial RPCs (`apply_invoice_late_fees`,
     `sync_successful_refund`, `validate_invoice_payment`,
     `validate_payment_refund`, `run_backend_maintenance`, and others in
     that group) had their named `anon`/`authenticated` grants revoked as
     claimed, but the `PUBLIC` grant Postgres adds by default on function
     creation was never separately revoked — functionally the same gap.
     Now closed.
   - `encrypt_sensitive_text`/`decrypt_sensitive_text` had an **explicit**
     `anon` grant, not just an inherited `PUBLIC` one. Inspected the bodies:
     both take the encryption key as a caller-supplied parameter rather
     than fetching one server-side, so this wasn't an active "decrypt
     anything" hole — but the contract's own rule ("Encryption functions
     remain server-side") was violated in principle, and it's bad hygiene
     regardless. Now `service_role`-only.
   - Everything else in §8 (search-path fixes on `prevent_audit_mutation`,
     the 3 client-creation/portal-invite/template-apply RPCs genuinely
     having `anon` revoked, the 7 service-role-only deny-policy tables)
     checked out as claimed.

4. **All 6 new "canonical"/contract tables confirmed to exist**:
   `business_entities`, `document_templates`, `document_template_versions`,
   `document_template_fields`, `platform_backend_contract`,
   `platform_canonical_statuses`. All 14 approved RPCs confirmed to exist
   with the signatures shown below (pulled live, not copied from the
   contract doc) — grants now verified and corrected per above.

5. **Not yet re-verified this session** (carried over from earlier
   findings, still open): the `status` vs `lifecycle_status` split on
   `clients` (frontend uses `status` everywhere; `lifecycle_status` exists
   but nothing reads it, contradicting the contract's client status
   registry in §6.1 which lists `lead/prospect/onboarding/active/inactive/archived`
   — the live `status` check constraint only allows
   `lead/active/inactive/archived`, no `prospect`); and the
   `client_type`/`account_type` compatibility shim in `ClientModal.tsx`.
   Both need a decision before more UI gets built against either.

# FirmFlow must be fully eliminated

Status: **done in application code** as of the corrections above. The three
legacy `workspace_settings` columns remain in the schema (unused, pending a
dependency-reviewed migration to drop them) and the Supabase project's
dashboard display name may still read "FirmFlow CRM" — that's a
project-level Supabase setting, not a database object, and needs to be
changed via the Supabase dashboard directly (no SQL/API path found for it).

# Confirmed approved RPCs (grants verified live, corrected 2026-07-21)

Read — all `authenticated`-only now, no `anon`/`PUBLIC`:

- `get_firm_dashboard_state(p_workspace_id uuid)`
- `get_firm_work_queue(p_workspace_id uuid)`
- `list_workspace_clients_v2(p_workspace_id uuid, p_search text, p_lifecycle text[], p_assigned_to uuid, p_service_type text, p_sort text, p_limit integer, p_offset integer)`
- `get_client_hub_state(p_workspace_id uuid, p_client_id uuid)`
- `get_client_profile_contract(p_workspace_id uuid, p_client_id uuid)`
- `get_client_work_contract(p_workspace_id uuid, p_client_id uuid)`
- `get_client_files_requests_contract(p_workspace_id uuid, p_client_id uuid)`
- `get_client_billing_activity_contract(p_workspace_id uuid, p_client_id uuid)`
- `get_client_portal_state(p_workspace_id uuid, p_client_id uuid)`

Write — all `authenticated`-only, no `anon`/`PUBLIC`:

- `create_client_with_services(p_workspace_id uuid, p_client jsonb, p_services text[])`
- `apply_service_template_to_client(p_client_id uuid, p_service_template_id uuid, p_start_date date, p_due_date date)`
- `save_task(p_workspace_id uuid, p_task_id uuid, p_client_id uuid, p_service_id uuid, p_task_title text, p_task_description text, p_task_status text, p_priority text, p_due_date date, p_assigned_to uuid)`
- `complete_task(p_workspace_id uuid, p_task_id uuid)`
- `prepare_client_portal_invitation(p_workspace_id uuid, p_client_id uuid, p_invite_email text)`

Grants are confirmed. Internal authorization logic (permission checks,
workspace-membership checks inside the function body) has **not** been
inspected function-by-function yet — do that before wiring each one into
the frontend, the same way `get_identity_vault_value` was inspected earlier
and found to have a real bug despite looking correct on the surface.

# Live schema

## `clients`

`id, workspace_id, client_type, first_name, last_name, middle_name, preferred_name, business_name, account_name, account_type, email, phone, address, city, state, zip_code, date_of_birth, ssn_last_four, filing_status, marital_status, occupation, primary_contact_name, primary_contact_required, is_household, status, lifecycle_status, source, assigned_to, archived_at, activated_at, preferred_contact_method, best_contact_time, communication_consent_status, created_at, updated_at`

## `contacts`

`id, workspace_id, first_name, middle_name, last_name, preferred_name, date_of_birth, ssn_last_four, ssn_encrypted, dob_encrypted, occupation, personal_email, business_email, personal_phone, business_phone, preferred_contact_method, best_contact_time, communication_consent_status, portal_access, notes, created_by, created_at, updated_at`

## `client_related_contacts`

`id, workspace_id, client_id, relationship_type, full_name, email, phone, date_of_birth, ssn_last_four, is_dependent, is_spouse, is_primary, job_title, portal_access, authorized_tax_info, authorized_financial_info, notes, created_at, updated_at`

## `account_contacts`

`id, workspace_id, account_id, contact_id, relationship_type, role_title, is_primary, receives_email, receives_sms, receives_billing, receives_tax, receives_bookkeeping, receives_payroll, receives_business_services, portal_access, authorized_tax_info, authorized_financial_info, created_at, updated_at`

## `client_contact_methods`

`id, workspace_id, client_id, related_contact_id, contact_kind, contact_type, contact_value, contact_person_name, is_primary, is_billing, is_portal, sms_allowed, calls_allowed, tax_communication, bookkeeping_communication, payroll_communication, business_services_communication, notes, created_at, updated_at`

## `client_addresses`

`id, workspace_id, client_id, address_type, is_primary, is_mailing, is_billing, is_tax_address, is_payroll_address, line1, line2, city, state, postal_code, country, county, move_in_date, move_out_date, notes, created_by, updated_by, created_at, updated_at`

## `client_business_details` (legacy — do not write new records here)

`id, workspace_id, client_id, legal_business_name, dba_name, entity_type, business_id_last4, business_id_secure_ref, business_start_date, state_registered, secretary_of_state_id, naics_code, accounting_method, bookkeeping_software, payroll_provider, sales_tax_id, registered_agent_name, registered_agent_address, registered_agent_expiration, is_self_registered, good_standing_status, good_standing_last_checked_at, notes, created_by, updated_by, created_at, updated_at`

## `business_entities` (canonical — use this for new work)

Exists and confirmed live. Columns not yet individually verified — inspect
before use rather than assuming parity with `client_business_details`.

## `client_service_interests`

`id, workspace_id, client_id, service_type, service_status, notes, created_at, updated_at`

## `services`

`id, workspace_id, client_id, service_type, service_name, service_status, service_year, price, start_date, due_date, completed_date, assigned_to, pipeline_id, pipeline_stage_id, billing_frequency, is_recurring, workflow_managed_by, created_at, updated_at`

## `tasks`

`id, workspace_id, client_id, service_id, task_title, task_description, task_status, priority, due_date, assigned_to, completed_at, engagement_id, created_at, updated_at`

## `deadlines`

`id, workspace_id, client_id, service_id, deadline_title, deadline_type, due_date, deadline_status, reminder_days, auto_add_to_calendar, calendar_event_id, assigned_to, source_table, source_id, engagement_id, notes, created_at, updated_at`

## `documents`

`id, workspace_id, client_id, service_id, document_name, document_category, document_status, requested_date, received_date, reviewed_date, storage_bucket, storage_path, original_file_name, mime_type, file_size_bytes, uploaded_by, uploaded_at, requested_by, submitted_by, reviewed_by, rejection_reason, client_message, is_visible_to_client, folder_id, document_year, document_tags, is_archived, retention_date, is_tax_document, irs_form_type, requires_kba_signature, document_catalog_id, custom_document_label, version_number, replaces_document_id, engagement_id, locked_until_paid, locked_until_signed, download_allowed, share_expires_at, notes, created_at, updated_at`

Default storage bucket is now `verexahq-client-documents` (renamed 2026-07-21).

## `document_folders`

`id, workspace_id, client_id, service_id, parent_folder_id, folder_name, folder_type, sort_order, is_visible_to_client, engagement_id, inherit_contact_permissions, created_by, created_at, updated_at`

## Legacy document request template tables (do not write new records here)

- `document_request_templates`
- `document_request_template_items`

## `document_templates` / `document_template_versions` / `document_template_fields` (canonical)

Exist and confirmed live. New template editor work must use these — columns
not yet individually verified, inspect before use.

## `invoices`

`id, workspace_id, client_id, invoice_number, invoice_status, issue_date, due_date, subtotal, discount_amount, tax_amount, total_amount, amount_paid, currency, stripe_invoice_id, stripe_payment_link, stripe_payment_link_url, stripe_payment_intent_id, payment_provider_connection_id, external_invoice_id, external_checkout_id, external_payment_url, external_provider_status, external_last_synced_at, payment_collection_mode, engagement_id, minimum_payment_amount, allow_partial_payments, deposit_amount, late_fee_type, late_fee_value, late_fee_grace_days, lock_documents_until_paid, late_fee_applied_at, sent_at, paid_at, created_by, created_at, updated_at`

## `invoice_line_items`

`id, workspace_id, invoice_id, service_type, item_name, item_description, quantity, unit_price, line_total, sort_order, created_at`

## `signature_requests`

`id, workspace_id, client_id, service_id, source_document_id, signed_document_id, request_title, request_message, signature_status, due_date, sent_at, completed_at, canceled_at, kba_required, identity_verification_provider, signer_full_name_required, signer_email_required, signer_company_name_required, signature_consent_required, ip_address_required, user_agent_required, created_by, created_at, updated_at`

## `secure_message_threads`

`id, workspace_id, client_id, contact_id, engagement_id, subject, thread_status, last_message_at, created_by, created_at, updated_at`

## `secure_messages`

`id, workspace_id, thread_id, client_id, contact_id, sender_user_id, sender_type, message_body, is_internal_note, read_at, created_at`

## `portal_invitations`

`id, workspace_id, client_id, portal_access_id, contact_id, invite_email, invite_status, invite_token_hash, sent_at, opened_at, accepted_at, accepted_by_auth_user_id, expires_at, revoked_at, resend_count, last_resent_at, delivery_status, delivery_error, token_version, created_by, created_at, updated_at`

## `client_portal_access`

`id, workspace_id, client_id, user_id, access_status, portal_email, invited_by, invited_at, activated_at, last_login_at, invite_token_hash, invite_expires_at, disabled_at, created_at, updated_at`

## `client_tax_years`

`id, workspace_id, client_id, tax_year, return_type, filing_status, tax_status, preparer_user_id, reviewer_user_id, due_date, extended_due_date, extension_filed, filed_at, accepted_at, notes, created_at, updated_at`

## `client_tags`

`id, workspace_id, tag_name, tag_color, is_active, created_at, updated_at`

## `client_tag_assignments`

`id, workspace_id, client_id, tag_id, created_at`

## `client_team_members` (added 2026-07-21 — not in original contract doc)

`id, workspace_id, client_id, user_id, granted_by, created_at`. Grants a
workspace member visibility/assignment on a client. Created because no
table existed for this despite the New Client wizard needing it; RLS
mirrors `user_has_workspace_access`/`can_staff_write`, the same pattern
`account_contacts`/`contacts` use.

## `notes`

`id, workspace_id, client_id, service_id, engagement_id, note_body, created_by, created_at, updated_at`

## `appointments`

`id, workspace_id, calendar_id, client_id, lead_id, appointment_title, appointment_status, start_time, end_time, attendee_name, attendee_email, attendee_phone, notes, external_calendar_event_id, created_by, created_at, updated_at`

## `service_templates`

`id, workspace_id, template_name, service_type, description, default_price, default_pipeline_id, is_active, is_platform_template, visibility_scope, owner_user_id, created_by, created_at, updated_at`

## `client_identity_vault` / `client_identity_change_events` (added prior session)

Encrypted SSN/EIN/ITIN storage. Table itself has zero grants for
`authenticated`/`anon` and RLS restricted to `service_role` — access only
through `save_identity_vault_value`, `get_identity_vault_value`,
`get_client_identity_vault_masked`, `check_identity_vault_duplicates`,
`set_identity_vault_verification`. Verified live and already wired into
`ClientModal.tsx`.

## `workspace_brand_profiles`

`workspace_id, legal_name, dba_name, logo_url, alternate_logo_url, primary_color, secondary_color, accent_color, heading_font, body_font, logo_alignment, logo_width, phone, email, website, address_line_1, address_line_2, city, state, postal_code, document_footer, legal_disclaimer, watermark_text, show_powered_by, created_at, updated_at`

## `workspace_settings`

Contains overlapping operational settings plus the 3 legacy FirmFlow
branding fields (unused by the frontend, not yet dropped — see corrections
above).

## `workspace_members`

`id, workspace_id, user_id, role, member_status, invited_by, invited_at, joined_at, display_name, job_title, phone, avatar_url, permissions, last_active_at, created_at, updated_at`

## `profiles`

`id, email, full_name, phone, onboarding_completed, created_at, updated_at`

## `platform_backend_contract` / `platform_canonical_statuses`

Exist and confirmed live, RLS-protected, not writable by frontend users.
Columns not yet individually inspected.

# Storage buckets

- `workspace-brand-assets` — public/controlled Brand Center delivery
- `verexahq-client-documents` — private client document bucket (renamed from `firmflow-client-documents` 2026-07-21, same policies, 0 objects at time of rename)
- `verexa-workspace-exports` — private

# Row-count snapshot

As of 2026-07-20 (not re-checked in full this session, only `documents`
re-confirmed at 0 rows before the bucket rename):

- Most client-facing tables are empty.
- `workspace_brand_profiles` has 1 real row.
- `workspace_settings` has 1 real row.
- `workspace_members` has 1 real row.
- `invoices` has 1 real row.
- Do not wipe these records.
- Integrations are not yet connected.

# Canonical vs legacy duplicates

Both canonical and legacy tables coexist, confirmed live:

Canonical:

- `business_entities`
- `document_templates`
- `document_template_versions`
- `document_template_fields`

Legacy:

- `client_business_details`
- `document_request_templates`
- `document_request_template_items`

Build new frontend code against canonical names. Leave legacy tables in
place. Report dependencies before migration.

# Navigation

Use:

- Home
- Clients
- Work
- Documents
- Communication
- Billing
- Calendar
- Reports
- Templates
- Settings

The current app shell's sidebar (`app/(app)/layout.tsx`) does not match this
yet — it groups Clients/Messages together, has no standalone Communication
or Templates section, and uses different group labels. Reconciling this is
part of the still-open navigation work, not yet done.

# Suggested first instruction to Claude Code

Read the Product Blueprint and PRD first, then the Canonical Backend
Contract, then this handoff — but verify contract claims against the live
database before trusting them, the same way this session's corrections
were found. Use the PRD for product behavior, the contract for canonical
backend rules (as corrected above), and this handoff for verified live
schema facts. Begin implementation with foundation cleanup, then app shell,
clients, work, documents, portal, templates/Brand Center and billing. Do
not stop after another audit document.
