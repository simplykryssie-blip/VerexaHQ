# VerexaHQ Frontend Build — Handoff for Claude Code

This doc is the live, verified state of the production Supabase backend as of
2026-07-20, pulled directly from the database (not from memory or docs).
Use it to avoid inventing table/column names — a known failure mode when an
agent works from a spec instead of the live schema.

## Project identity
- GitHub repo: `simplykryssie-blip/VerexaHQ`
- Vercel deployment: `verexa-hq-phi.vercel.app`
- Supabase project ref: `euxfopzgdmlmgcmmjvic`
- Positioning: tax hub (tax prep, bookkeeping, payroll, business formation,
  compliance) intended to replace GoHighLevel + TaxDome + JotForm + Suitedash

## Hard constraints (do not violate)
- Do not delete/overwrite: `.env`, `.env.local`, Vercel env vars, git history,
  valid Supabase credentials, existing production data, existing migrations.
- Do not create a new Supabase project.
- Never put the Supabase **service-role key** in frontend/browser code.
- Never expose Stripe secret keys to the browser.
- Never show a toggle that disables "Powered by VerexaHQ" co-branding.

## ⚠️ Known branding leftover to fix
`workspace_settings` still has old FirmFlow-era columns actively defaulting to
FirmFlow branding:
- `show_firmflow_branding` (boolean, default `true`)
- `firmflow_branding_text` (default `'Powered by FirmFlow CRM'`)
- `firmflow_branding_url` (default `'https://firmflowcrm.com'`)

Meanwhile `workspace_brand_profiles` (the newer, correct table) has its own
`show_powered_by` (default `true`) with no text/URL columns — implying "Powered
by VerexaHQ" is meant to be hardcoded in the frontend, not stored as
FirmFlow's text. **Decide and implement one source of truth**: stop reading
`workspace_settings.show_firmflow_branding`/`firmflow_branding_text` in the
frontend, hardcode "Powered by VerexaHQ" gated only by
`workspace_brand_profiles.show_powered_by`, and consider a migration to
deprecate the three FirmFlow columns.

Also: the `documents.storage_bucket` column defaults to
`'firmflow-client-documents'` — that bucket still exists and is presumably
where existing document rows point. A `workspace-brand-assets` bucket (public)
and `verexa-workspace-exports` bucket also exist. Do not silently rename/move
the client-documents bucket — existing `documents.storage_path` rows depend on
it staying put unless you write a migration to move files and update rows.

## Confirmed RPC functions (exist, callable)
- `create_client_with_services`
- `get_firm_dashboard_state`
- `get_firm_work_queue`

Inspect their actual signatures/return shapes in the repo or via
`Supabase:execute_sql` before wiring the frontend — this doc confirms they
exist, not their exact parameters.

## Core schema (live, as of this turn)

### `clients` (the account/client record)
`id, workspace_id, client_type, first_name, last_name, middle_name,
preferred_name, business_name, account_name, account_type
('individual' default), email, phone, address, city, state, zip_code,
date_of_birth, ssn_last_four, filing_status, marital_status, occupation,
primary_contact_name, primary_contact_required (bool), is_household (bool),
status, lifecycle_status ('lead' default — this is the frontend status field
per the spec), source, assigned_to, archived_at, activated_at, preferred_contact_method,
best_contact_time, communication_consent_status, created_at, updated_at`

### `contacts` (standalone, richer contact entity — separate from clients)
`id, workspace_id, first_name, middle_name, last_name, preferred_name,
date_of_birth, ssn_last_four, ssn_encrypted (bytea), dob_encrypted (bytea),
occupation, personal_email, business_email, personal_phone, business_phone,
preferred_contact_method, best_contact_time, communication_consent_status,
portal_access (bool), notes, created_by, created_at, updated_at`

### `client_related_contacts` (contacts attached to a specific client — dependents, spouses, etc.)
`id, workspace_id, client_id, relationship_type, full_name, email, phone,
date_of_birth, ssn_last_four, is_dependent, is_spouse, is_primary, job_title,
portal_access, authorized_tax_info, authorized_financial_info, notes,
created_at, updated_at`

### `account_contacts` (business-side contact roles)
`id, workspace_id, account_id, contact_id, relationship_type, role_title,
is_primary, receives_email, receives_sms, receives_billing, receives_tax,
receives_bookkeeping, receives_payroll, receives_business_services,
portal_access, authorized_tax_info, authorized_financial_info, created_at,
updated_at`

### `client_contact_methods` (granular multi-method contact records)
`id, workspace_id, client_id, related_contact_id, contact_kind, contact_type,
contact_value, contact_person_name, is_primary, is_billing, is_portal,
sms_allowed, calls_allowed, tax_communication, bookkeeping_communication,
payroll_communication, business_services_communication, notes, created_at,
updated_at`

### `client_addresses`
`id, workspace_id, client_id, address_type, is_primary, is_mailing,
is_billing, is_tax_address, is_payroll_address, line1, line2, city, state,
postal_code, country, county, move_in_date, move_out_date, notes, created_by,
updated_by, created_at, updated_at`

### `client_business_details`
`id, workspace_id, client_id, legal_business_name, dba_name, entity_type,
business_id_last4, business_id_secure_ref, business_start_date,
state_registered, secretary_of_state_id, naics_code, accounting_method,
bookkeeping_software, payroll_provider, sales_tax_id,
registered_agent_name, registered_agent_address, registered_agent_expiration,
is_self_registered, good_standing_status, good_standing_last_checked_at,
notes, created_by, updated_by, created_at, updated_at`

### `client_service_interests`
`id, workspace_id, client_id, service_type, service_status ('interested'
default), notes, created_at, updated_at`

### `services` (active/assigned services per client)
`id, workspace_id, client_id, service_type, service_name, service_status
('New' default), service_year, price, start_date, due_date, completed_date,
assigned_to, pipeline_id, pipeline_stage_id, billing_frequency, is_recurring,
workflow_managed_by, created_at, updated_at`

### `tasks`
`id, workspace_id, client_id, service_id, task_title, task_description,
task_status ('To Do' default), priority ('Normal' default), due_date,
assigned_to, completed_at, engagement_id, created_at, updated_at`

### `deadlines`
`id, workspace_id, client_id, service_id, deadline_title, deadline_type,
due_date, deadline_status ('Upcoming' default), reminder_days (array,
default [30,14,7,1]), auto_add_to_calendar, calendar_event_id, assigned_to,
source_table, source_id, engagement_id, notes, created_at, updated_at`

### `documents`
`id, workspace_id, client_id, service_id, document_name, document_category,
document_status ('Needed' default), requested_date, received_date,
reviewed_date, storage_bucket ('firmflow-client-documents' default!),
storage_path, original_file_name, mime_type, file_size_bytes, uploaded_by,
uploaded_at, requested_by, submitted_by, reviewed_by, rejection_reason,
client_message, is_visible_to_client, folder_id, document_year,
document_tags (array), is_archived, retention_date, is_tax_document,
irs_form_type, requires_kba_signature, document_catalog_id,
custom_document_label, version_number, replaces_document_id, engagement_id,
locked_until_paid, locked_until_signed, download_allowed, share_expires_at,
notes, created_at, updated_at`

### `document_folders`
`id, workspace_id, client_id, service_id, parent_folder_id, folder_name,
folder_type ('Client' default), sort_order, is_visible_to_client,
engagement_id, inherit_contact_permissions, created_by, created_at,
updated_at`

### `document_request_templates` / `document_request_template_items`
Templates: `id, workspace_id, template_name, service_type, tax_year,
is_platform_template, is_active, created_by, created_at, updated_at`
Items: `id, template_id, item_name, item_description, document_category,
is_required, applies_to, conditional_logic (jsonb), sort_order, created_at`

### `invoices` / `invoice_line_items`
Invoices: `id, workspace_id, client_id, invoice_number, invoice_status
('draft' default), issue_date, due_date, subtotal, discount_amount,
tax_amount, total_amount, amount_paid, currency, stripe_invoice_id,
stripe_payment_link, stripe_payment_link_url, stripe_payment_intent_id,
payment_provider_connection_id, external_invoice_id, external_checkout_id,
external_payment_url, external_provider_status, external_last_synced_at,
payment_collection_mode ('external_tracking' default), engagement_id,
minimum_payment_amount, allow_partial_payments, deposit_amount,
late_fee_type, late_fee_value, late_fee_grace_days, lock_documents_until_paid,
late_fee_applied_at, sent_at, paid_at, created_by, created_at, updated_at`
Line items: `id, workspace_id, invoice_id, service_type, item_name,
item_description, quantity, unit_price, line_total, sort_order, created_at`

### `signature_requests`
`id, workspace_id, client_id, service_id, source_document_id,
signed_document_id, request_title, request_message, signature_status
('Draft' default), due_date, sent_at, completed_at, canceled_at, kba_required,
identity_verification_provider, signer_full_name_required,
signer_email_required, signer_company_name_required,
signature_consent_required, ip_address_required, user_agent_required,
created_by, created_at, updated_at`

### `secure_message_threads` / `secure_messages`
Threads: `id, workspace_id, client_id, contact_id, engagement_id, subject,
thread_status ('open' default), last_message_at, created_by, created_at,
updated_at`
Messages: `id, workspace_id, thread_id, client_id, contact_id,
sender_user_id, sender_type, message_body, is_internal_note, read_at,
created_at`

### `portal_invitations` / `client_portal_access`
Invitations: `id, workspace_id, client_id, portal_access_id, contact_id,
invite_email, invite_status ('draft' default), invite_token_hash, sent_at,
opened_at, accepted_at, accepted_by_auth_user_id, expires_at, revoked_at,
resend_count, last_resent_at, delivery_status, delivery_error, token_version,
created_by, created_at, updated_at`
Access: `id, workspace_id, client_id, user_id, access_status ('Active'
default), portal_email, invited_by, invited_at, activated_at, last_login_at,
invite_token_hash, invite_expires_at, disabled_at, created_at, updated_at`

### `client_tax_years`
`id, workspace_id, client_id, tax_year, return_type, filing_status,
tax_status ('not_started' default), preparer_user_id, reviewer_user_id,
due_date, extended_due_date, extension_filed, filed_at, accepted_at, notes,
created_at, updated_at`

### `client_tags` / `client_tag_assignments`
Tags: `id, workspace_id, tag_name, tag_color, is_active, created_at, updated_at`
Assignments: `id, workspace_id, client_id, tag_id, created_at`

### `notes`
`id, workspace_id, client_id, service_id, engagement_id, note_body,
created_by, created_at, updated_at`

### `appointments`
`id, workspace_id, calendar_id, client_id, lead_id, appointment_title,
appointment_status ('Scheduled' default), start_time, end_time,
attendee_name, attendee_email, attendee_phone, notes,
external_calendar_event_id, created_by, created_at, updated_at`

### `service_templates`
`id, workspace_id, template_name, service_type, description, default_price,
default_pipeline_id, is_active, is_platform_template, visibility_scope
('workspace' default), owner_user_id, created_by, created_at, updated_at`

### `workspace_brand_profiles` (Brand Center — CONFIRMED, has 1 row already)
`workspace_id, legal_name, dba_name, logo_url, alternate_logo_url,
primary_color (default #108A64), secondary_color (default #0F2F2A),
accent_color (default #D6A84B), heading_font (default Georgia), body_font
(default Arial), logo_alignment (default left), logo_width (default 180),
phone, email, website, address_line_1, address_line_2, city, state,
postal_code, document_footer, legal_disclaimer, watermark_text,
show_powered_by (default true), created_at, updated_at`

### `workspace_settings` (separate from brand_profiles — has overlapping/legacy fields, see branding warning above)
`id, workspace_id, brand_name, logo_url, primary_color, secondary_color,
accent_color, portal_welcome_message, default_timezone, default_currency,
default_service_status, default_lead_status, notification_preferences
(jsonb), portal_settings (jsonb), business_legal_name, business_dba_name,
business_phone, business_email, business_website, business_address_line1/2,
business_city, business_state, business_postal_code, business_country,
support_email, support_phone, client_portal_custom_domain,
firm_logo_storage_path, firm_favicon_storage_path, allow_firm_branding,
show_firmflow_branding ⚠️, firmflow_branding_text ⚠️, firmflow_branding_url ⚠️,
footer_disclaimer, email_signature, onboarding_required,
onboarding_completed, onboarding_completed_at,
billing_required_for_activation, firm_owner_full_name, firm_owner_email,
firm_owner_phone, business_ein, business_type, primary_service_type,
estimated_client_count, tax_ptin, tax_efin, tax_caf_number,
tax_software_used, created_at, updated_at`

### `workspace_members`
`id, workspace_id, user_id, role ('Staff' default), member_status ('Active'
default), invited_by, invited_at, joined_at, display_name, job_title, phone,
avatar_url, permissions (jsonb), last_active_at, created_at, updated_at`

### `profiles`
`id, email, full_name, phone, onboarding_completed, created_at, updated_at`

## Storage buckets (confirmed live)
- `workspace-brand-assets` — **public** (used by Brand Center)
- `firmflow-client-documents` — private (default bucket for `documents` rows —
  old naming, but still the active bucket referenced by existing records)
- `verexa-workspace-exports` — private

## Row counts snapshot (2026-07-20)
Everything client-facing (`clients`, `services`, `documents`, `tasks`,
`deadlines`, most workflow tables) is currently **0 rows** — clean slate, no
test/fake data to worry about breaking. `workspace_brand_profiles` (1 row),
`invoices` (1 row), `workspace_settings` (1 row), `workspace_members` (1 row)
already have real data — don't wipe these.

`integration_connections`, `communication_messages`, `booking_calendars`,
`landing_pages`, `ai_agents` are all 0 rows — no third-party provider (SMS,
email, e-sign, booking) is connected yet. That's phase 2, after this frontend
build.

## Suggested first prompt to Claude Code
Paste the "VerexaHQ Frontend Completion Prompt" you already have, and prepend:
"Before making any changes, read VEREXAHQ_CLAUDE_CODE_HANDOFF.md in this repo
root for the verified live schema, known branding leftover issue, and
confirmed RPC functions — use these exact table/column names instead of
inspecting or guessing from generated types alone."
