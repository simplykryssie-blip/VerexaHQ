-- Phase 4H-C follow-up: the prior migration in this phase
-- (20260915133417_phase4h_c_fix_firm_connections_consent_bypass.sql)
-- revoked INSERT/UPDATE on the (status, child_workspace_id) *columns* from
-- authenticated/anon, but live-testing (C1) immediately afterward proved it
-- had NO effect -- a forged active connection still inserted successfully.
--
-- Root cause of that failure, confirmed live via pg_class.relacl: both
-- roles hold the *table-level* INSERT/UPDATE privilege on firm_connections
-- (the standard `GRANT ALL ON ALL TABLES IN SCHEMA public`). Per Postgres's
-- actual privilege model, a table-level grant authorizes writing to every
-- column regardless of any column-level REVOKE -- column-level privileges
-- only matter as an *additive* grant for a role that lacks the table-level
-- privilege in the first place. Revoking a column privilege from a role
-- that still holds the table-level privilege is a silent no-op.
--
-- Corrected fix: revoke the table-level INSERT and UPDATE privileges from
-- authenticated/anon entirely, then grant back UPDATE on exactly the
-- columns real product code legitimately writes to directly (confirmed by
-- the same repo-wide caller audit as the prior migration:
-- components/firms/FirmDetailClient.tsx, app/(app)/partners/PartnerCard.tsx
-- -- none of them ever reference status or child_workspace_id). No INSERT
-- columns are granted back at all, since the audit found zero legitimate
-- direct .insert() callers anywhere in the app -- every real connection is
-- created by create_firm_connection_invite or create_manual_firm_connection,
-- both SECURITY DEFINER/postgres-owned and therefore unaffected by any of
-- this (table owners bypass both RLS and GRANT/REVOKE, confirmed in the
-- prior migration's own comment).
revoke insert, update on public.firm_connections from authenticated;
revoke insert, update on public.firm_connections from anon;

-- Exactly the columns confirmed (by full repo grep) to be written by a real
-- direct .update() call: components/firms/FirmDetailClient.tsx
-- (revenue_share_percent, revenue_share_scope, bank_partner_id,
-- software_partner_id, partner_software_used, partner_tax_programs, notes,
-- onboarding_stage, preparer_credential, filed_under_connection_id) and
-- app/(app)/partners/PartnerCard.tsx (notes, already covered). Every other
-- column (including package_id, manual_*, relationship_type,
-- default_reviewer_id, restrict_ptin_staff_assignment,
-- allows_learning_hub_downline_share, tags, shares_communications_identity,
-- allows_branding_override) is only ever written by a SECURITY
-- DEFINER/postgres-owned function and does not need a direct grant.
grant update (
  notes, bank_partner_id, software_partner_id, partner_software_used,
  partner_tax_programs, onboarding_stage, preparer_credential,
  filed_under_connection_id, revenue_share_percent, revenue_share_scope
) on public.firm_connections to authenticated;
