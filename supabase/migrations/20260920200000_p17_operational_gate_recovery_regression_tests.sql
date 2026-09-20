-- ============================================================================
-- MIGRATION RECONCILIATION PHASE 1.7 -- regression self-test
--
-- New content authored 2026-09-20 (today), not a recovery of a historical
-- production migration. Filename uses today's real authoring date, not a
-- fictional future date. Never applied to production; safe to apply
-- normally (fresh CREATE, no collision) whenever this branch is deployed.
--
-- Proves the operational-gate security property recovered in this phase
-- (batches 1-5 + the RLS-policies batch, six migration files, ~2026-09-17)
-- remains represented: every RPC and RLS policy those migrations touched
-- still enforces is_workspace_operational. Does not re-test batch6
-- (sites/services) -- that one was found already represented in main via
-- 20261028010000_operational_gate_audit_batch6_git_reconciliation.sql, with
-- no new file added for it in this phase.
-- ============================================================================
create or replace function public.test_p17_operational_gate_recovery()
returns table(check_name text, passed boolean, detail text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_gated_functions text[] := array[
    'add_client_address','add_client_email','add_client_phone','delete_client_email','delete_client_phone',
    'set_client_address_primary','set_client_email_primary','set_client_phone_primary','mark_client_lost','merge_clients',
    'create_client_relationship','record_client_service_interest','approve_client_pending_change','propose_client_contact_field',
    'propose_client_date_of_birth','propose_client_full_name','propose_client_mailing_address',
    'find_or_create_public_lead','submit_public_organizer_response','submit_public_organizer_response_with_signup','accept_quote',
    'create_workspace_invitation','accept_workspace_invitation_by_token','accept_workspace_invitation','invite_workspace_user',
    'create_engagement_share','copy_shared_engagement','respond_to_engagement_share','resubmit_engagement_share','share_engagement_with_ero',
    'create_irs_authorization','set_irs_authorization_status','set_firm_tax_profile','send_organizer_to_ero_review',
    'create_manual_firm_connection','update_manual_firm_connection','respond_to_firm_connection','create_workspace_tag',
    'create_document_request','fulfill_document_request_item','mark_document_request_item_received','mark_document_request_reviewed',
    'set_document_request_item_due_date','create_organizer_information_request','send_organizer_information_request',
    'resolve_organizer_information_request','mark_organizer_information_request_responded','approve_organizer_information_request_item',
    'flag_organizer_field_for_info','attest_signature_presence','set_signature_request_expiry','set_organizer_answer_review_status',
    'reorder_organizer_fields','delete_installed_template',
    'duplicate_config_object','advance_pipeline_stage','add_process_stage','add_process_stage_to_pipeline','delete_process_stage',
    'rename_process_stage','reorder_process_stage','create_workflow_pipeline','delete_workflow_pipeline','reorder_automation_step',
    'rename_workspace_tag','delete_workspace_tag'
  ];
  v_gated_policies text[] := array[
    'client_addresses_insert','client_addresses_update','client_addresses_delete',
    'client_emails_insert','client_emails_update','client_emails_delete',
    'client_phones_insert','client_phones_update','client_phones_delete',
    'client_relationships_insert','client_relationships_update','client_relationships_delete',
    'document_requests_insert','document_requests_update','document_requests_delete',
    'document_request_items_insert','document_request_items_update','document_request_items_delete',
    'engagement_letter_templates_insert','engagement_letter_templates_update','engagement_letter_templates_delete',
    'firm_connection_contacts_insert','firm_connection_contacts_update','firm_connection_contacts_delete',
    'irs_authorizations_insert','irs_authorizations_update',
    'quotes_write','quotes_update','quotes_delete',
    'signature_requests_insert','signature_requests_update','signature_requests_delete',
    'workspace_invitations_insert'
  ];
  v_missing_functions text[];
  v_missing_policies text[];
begin
  select array_agg(f) into v_missing_functions
  from unnest(v_gated_functions) f
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f and p.prosrc ilike '%is_workspace_operational%'
  );

  return query select
    'operational_gate_batch1_5_functions_gated'::text,
    v_missing_functions is null,
    coalesce('missing gate on: ' || array_to_string(v_missing_functions, ', '), 'all ' || array_length(v_gated_functions, 1)::text || ' functions gated');

  select array_agg(pol) into v_missing_policies
  from unnest(v_gated_policies) pol
  where not exists (
    select 1 from pg_policy p
    where p.polname = pol
      and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) ilike '%is_workspace_operational%'
  );

  return query select
    'operational_gate_rls_policies_gated'::text,
    v_missing_policies is null,
    coalesce('missing gate on: ' || array_to_string(v_missing_policies, ', '), 'all ' || array_length(v_gated_policies, 1)::text || ' policies gated');
end;
$function$;

revoke all on function public.test_p17_operational_gate_recovery() from public, anon, authenticated;
grant execute on function public.test_p17_operational_gate_recovery() to service_role;
