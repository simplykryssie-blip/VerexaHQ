-- ============================================================================
-- MIGRATION RECONCILIATION PHASE 1.9 -- RECOVERED FROM PRODUCTION (PR #268)
--
-- Did not previously exist in Git main. Applied directly to production
-- during the MKB Tax Prep + Client Review + F1/F2/NW-1 security work
-- (PR #268, branch claude/verexa-schema-mismatch-i8c19u, never merged).
-- This filename's version already exactly matches the real recorded
-- production version in supabase_migrations.schema_migrations -- no rename
-- needed. Content verified byte-for-byte (modulo a single trailing
-- newline) against schema_migrations.statements. Confidence: A -- exact
-- original recovered.
-- ============================================================================
-- Phase 4E: MKB Financial Group (recreated as a demo/build workspace) had
-- zero workspace_usage_meters rows -- confirmed live, and confirmed this
-- is not a general provisioning bug (Doucet Financial Group, real
-- production, has the expected email/sms/storage rows from its real
-- signup flow). check_storage_capacity() returns false (hard deny) when
-- no 'storage' meter row exists for a workspace at all, so MKB could not
-- accept a single document upload -- blocking this phase's own testing
-- of the engagement-letter-signing step, which requires a real
-- attachment. This provisions the same free-allowance shape production
-- workspaces get, data-only, no billing rule changed. Summit was found
-- to have the same gap but is explicitly out of scope for this phase
-- (not the assigned build workspace) -- tracked as a new backlog item
-- instead of fixed here.
insert into public.workspace_usage_meters (workspace_id, resource_type, free_units_granted, free_units_consumed, prepaid_balance)
values
  ('2896bf43-95db-420f-9bb5-8854f537bbd1', 'email', 7500, 0, 0),
  ('2896bf43-95db-420f-9bb5-8854f537bbd1', 'sms', 750, 0, 0),
  ('2896bf43-95db-420f-9bb5-8854f537bbd1', 'storage', 50, 0, 0)
on conflict do nothing;
