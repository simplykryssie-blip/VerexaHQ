# VerexaHQ Canonical Backend Contract

**Version:** 1.0  
**Verified production project:** `euxfopzgdmlmgcmmjvic`  
**Product:** VerexaHQ  
**Legacy project name:** FirmFlow CRM  
**Environment:** Production  
**Do-not-use project:** `aewqbffscdrziiwfomyf`

# 1. Purpose

This contract defines the approved production backend for VerexaHQ. It is the source of truth for canonical data ownership, approved frontend RPCs, tenant boundaries, official status values and backend governance.

Use the Product Blueprint and PRD for product behavior. Use this contract for the current approved Supabase implementation.

# 2. Official Project

| Field | Value |
| --- | --- |
| Product name | VerexaHQ |
| Official Supabase project ref | `euxfopzgdmlmgcmmjvic` |
| Current legacy display name | FirmFlow CRM |
| Target display name | VerexaHQ |
| Environment | Production |
| Status | Official |
| Do-not-use project ref | `aewqbffscdrziiwfomyf` |

# 3. Canonical Hierarchy

Workspace  
→ Client  
→ Contacts / Businesses  
→ Services  
→ Engagements / Service Work  
→ Tasks / Documents / Requests / Billing / Portal / Audit

# 4. Canonical Data Ownership

The frontend must not invent new database names. New frontend work should use canonical objects and approved RPCs. Legacy objects may remain temporarily but must not receive new writes unless explicitly approved.

## 4.1 Workspace and identity

- `workspaces`
- `workspace_members`
- `workspace_settings`
- `workspace_brand_profiles`
- `profiles`

## 4.2 CRM

- `clients`
- `contacts`
- `client_contact_methods`
- `client_addresses`
- `client_related_contacts`
- `account_contacts`
- `business_entities`
- `client_tags`
- `client_tag_assignments`
- `notes`

## 4.3 Services and work

- `service_templates`
- `services`
- workflow and engagement tables already present in production
- `tasks`
- `deadlines`
- service assignments and workflow state tables as defined in live schema

## 4.4 Documents

- `documents`
- `document_folders`
- `document_templates`
- `document_template_versions`
- `document_template_fields`
- request and request-item structures defined in the canonical registry
- `signature_requests`

## 4.5 Communication and portal

- `secure_message_threads`
- `secure_messages`
- `portal_invitations`
- `client_portal_access`
- communication preference and notification records in live schema

## 4.6 Billing

- `invoices`
- `invoice_line_items`
- payments, allocations, credits and recurring billing tables in live schema

## 4.7 Audit and operations

- `audit_events`
- automation execution logs
- integration/webhook logs
- import/export jobs
- platform contract/status registries

# 5. Approved Frontend RPC Contract

All approved RPCs exist in the live database. Before wiring any RPC, inspect its exact signature, return type, grants and authorization behavior.

## 5.1 Read RPCs

- `get_firm_dashboard_state`
- `get_firm_work_queue`
- `list_workspace_clients_v2`
- `get_client_hub_state`
- `get_client_profile_contract`
- `get_client_work_contract`
- `get_client_files_requests_contract`
- `get_client_billing_activity_contract`
- `get_client_portal_state`

## 5.2 Write RPCs

- `create_client_with_services`
- `apply_service_template_to_client`
- `save_task`
- `complete_task`
- `prepare_client_portal_invitation`

## 5.3 RPC rules

- Do not assume existence means browser-safe.
- Verify `EXECUTE` grants.
- Verify active workspace membership.
- Verify role, assignment and sensitive-data checks.
- Use trusted server routes for privileged operations.
- Do not expose service-role credentials.
- Prefer RPCs over broad direct selects when the RPC provides a permission-safe contract.

# 6. Canonical Status Registry

The canonical status table is:

`public.platform_canonical_statuses`

## 6.1 Client

- `lead`
- `prospect`
- `onboarding`
- `active`
- `inactive`
- `archived`

## 6.2 Service

- `draft`
- `active`
- `paused`
- `completed`
- `cancelled`

## 6.3 Engagement

- `not_started`
- `in_progress`
- `waiting_on_client`
- `ready_for_review`
- `in_review`
- `awaiting_approval`
- `completed`
- `cancelled`

## 6.4 Task

- `not_started`
- `in_progress`
- `blocked`
- `waiting`
- `completed`
- `cancelled`

## 6.5 Document Request

- `draft`
- `sent`
- `viewed`
- `partially_received`
- `received`
- `accepted`
- `needs_replacement`
- `completed`
- `cancelled`

## 6.6 Portal Invitation

- `pending`
- `sent`
- `accepted`
- `expired`
- `revoked`

# 7. Contract Registry

The production database includes:

- `public.platform_backend_contract`
- `public.platform_canonical_statuses`

`platform_backend_contract` records the official project identity, canonical hierarchy, canonical tables and approved RPC contract.

Both registry tables are protected by RLS and are not writable by frontend users.

# 8. Security Hardening Already Applied

## 8.1 Search paths fixed

Immutable search paths were set for:

- `prevent_audit_mutation()`
- `encrypt_sensitive_text(text,text)`
- `decrypt_sensitive_text(bytea,text)`

## 8.2 Backend maintenance RPC restricted

Anonymous and authenticated execution was revoked from:

- `run_backend_maintenance()`

## 8.3 Worker RPCs restricted

Anonymous and authenticated execution was revoked from:

- `claim_automation_runs(integer)`
- `claim_notification_deliveries(integer)`
- `process_database_automation_actions(integer)`
- `enqueue_automation_actions(uuid)`
- `generate_due_recurring_engagements(integer)`

## 8.4 Financial and administrative RPCs restricted

Anonymous and authenticated execution was revoked from:

- `apply_invoice_late_fees()`
- `sync_successful_refund()`
- `validate_invoice_payment()`
- `validate_payment_refund()`
- `backfill_legacy_engagement_links()`

## 8.5 Anonymous client/portal access restricted

Anonymous execution was revoked from approved client and portal RPCs, including client creation, portal invitation, engagement advancement, credit application, template application and client contract reads.

## 8.6 Service-role-only tables documented

Explicit deny policies for browser roles were created on:

- `beta_access_codes`
- `billing_events`
- `billing_sync`
- `platform_workspace_deletion_log`
- `workspace_deletion_requests`
- `workspace_member_invitations`
- `workspace_stripe_subscription_items`

# 9. Canonical vs Legacy Structures

Known duplicate structures coexist.

## 9.1 Business data

Canonical:

- `business_entities`

Legacy:

- `client_business_details`

Rule:

- New frontend work uses `business_entities`.
- Do not write new records to `client_business_details`.
- Do not drop the legacy table until dependency testing is complete.

## 9.2 Document template data

Canonical:

- `document_templates`
- `document_template_versions`
- `document_template_fields`

Legacy:

- `document_request_templates`
- `document_request_template_items`

Rule:

- New template editor work uses canonical document template tables.
- Report existing dependencies before migration.
- Do not delete legacy tables yet.

# 10. Brand Center Contract

Source of truth:

- `workspace_brand_profiles`

Storage:

- `workspace-brand-assets`

Do not create duplicate branding tables or buckets.

`Powered by VerexaHQ` is controlled by:

- `workspace_brand_profiles.show_powered_by`

The frontend must not read or display FirmFlow branding fields from `workspace_settings`.

# 11. Sensitive Data Rules

- Sensitive identifiers are masked by default.
- Reveal and edit are separate permissions.
- Sensitive reads must be audited.
- Browser code must not directly select broad sensitive records when an approved masked contract exists.
- Encryption functions remain server-side.
- Never log decrypted identifiers.
- Never expose service-role keys.

# 12. Storage Rules

- Storage paths must be tenant-scoped.
- Client documents must remain private.
- Use signed expiring URLs.
- Do not rename a bucket without migrating objects, defaults, policies, helper functions and database references together.
- `workspace-brand-assets` is the approved Brand Center bucket.
- The current legacy client-document bucket requires a controlled migration.

# 13. Frontend Rules for Claude

- Read this contract before editing data access.
- Use generated Supabase types.
- Map every direct query to a canonical table or approved RPC.
- Preserve tenant isolation.
- Do not invent table or column names.
- Do not silently migrate legacy structures.
- Do not create new SECURITY DEFINER functions without approval.
- Do not broaden RLS policies for convenience.
- Do not expose private keys.
- Show actionable errors.
- Keep every commit deployable.

# 14. Backend Governance

A new table, bucket, status, policy or privileged function requires:

- documented need
- existing-structure analysis
- migration
- compatibility assessment
- rollback plan
- RLS/security review
- acceptance test
- owner approval

# 15. Definition of Backend Compliance

A frontend module complies with this contract when:

- it uses the official project
- it uses canonical data ownership
- it uses approved RPCs where appropriate
- it does not expose privileged secrets
- it preserves workspace isolation
- it does not write to legacy duplicates
- it respects status registry values
- it passes typecheck/build
- its real database actions are demonstrated
