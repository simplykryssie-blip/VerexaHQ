-- Phase 2: Firm Configuration Engine -- Advisor cleanup
-- Same fix as Phase 0 migration 0012: Supabase grants EXECUTE on
-- public-schema functions to anon directly (a schema-level default
-- privilege separate from PUBLIC), so `revoke ... from public` alone never
-- touched it. Every Phase 2 SECURITY DEFINER RPC needs an explicit
-- `revoke ... from anon` -- this migration catches every one that was
-- missed. Also pins search_path on is_valid_config_table.

create or replace function public.is_valid_config_table(p_table text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_table = any(array[
    'service_categories', 'services', 'processes', 'pipelines', 'organizer_templates',
    'document_request_templates', 'engagement_letter_templates', 'email_templates',
    'sms_templates', 'pricing_rules', 'billing_rules', 'automations', 'dashboards', 'blueprints'
  ]);
$$;

revoke execute on function public.respond_to_firm_connection(uuid, boolean) from anon;
revoke execute on function public.set_firm_tax_profile(uuid, text, text, text, boolean, boolean, boolean, text[], jsonb, jsonb) from anon;
revoke execute on function public.reveal_firm_ein(uuid) from anon;
revoke execute on function public.reveal_firm_efin(uuid) from anon;
revoke execute on function public.reveal_firm_ptin(uuid) from anon;
revoke execute on function public.advance_onboarding_step(uuid, integer, text, uuid) from anon;
revoke execute on function public.handle_new_workspace_onboarding() from anon, authenticated;
revoke execute on function public.duplicate_config_object(text, uuid, uuid, text) from anon;
revoke execute on function public.set_config_object_status(text, uuid, text) from anon;
revoke execute on function public.get_config_object_versions(text, uuid) from anon;
revoke execute on function public.compare_config_object_versions(text, uuid, integer, integer) from anon;
revoke execute on function public.apply_blueprint(uuid, uuid) from anon;
revoke execute on function public.share_case_with_ero(uuid, uuid, uuid, jsonb, integer) from anon;
revoke execute on function public.respond_to_case_share(uuid, boolean, text) from anon;
