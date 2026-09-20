-- CONTACTS COMPLETION PASS -- Phase 6: GHL import automation guard
-- (Contacts Reconciliation Audit item #9). import-contacts/route.ts already
-- pauses automations-table rows for lead.created/client.tag_added
-- (PAUSE_TRIGGER_TYPES) for the duration of an import run, but that
-- mechanism only touches the automations table -- it has no effect on
-- trg_auto_start_lead_pipeline_on_create (an AFTER INSERT ON clients
-- trigger, added in 20260817202610_retire_lead_stages_use_real_pipelines.sql)
-- which unconditionally drops every new lead-status client onto the
-- workspace's default lead pipeline. Every GHL-imported contact was still
-- auto-enrolling in that pipeline regardless of the pause.
--
-- Fixed with a transaction-local GUC rather than a parameter on
-- create_client itself: create_client's signature is called from many
-- existing sites, and Postgres treats a changed argument list as a new
-- function identity (CREATE OR REPLACE cannot alter parameters -- it would
-- require DROP FUNCTION first, which risks orphaning any other overload).
-- The trigger function's own signature never changes (still zero args), so
-- CREATE OR REPLACE is safe there. A brand-new wrapper function carries the
-- opt-in for GHL import specifically, so every other create_client caller
-- is completely unaffected.
create or replace function public.auto_start_lead_pipeline_on_create()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_process_id uuid;
begin
  if current_setting('app.suppress_lead_pipeline_autostart', true) = 'true' then
    return new;
  end if;

  if new.lifecycle_status <> 'lead' then
    return new;
  end if;

  select default_lead_process_id into v_process_id from public.workspaces where id = new.workspace_id;
  if v_process_id is null then
    return new;
  end if;

  perform public.start_lead_pipeline_run(new.id, v_process_id);
  return new;
end;
$function$;

-- Same parameter list and behavior as create_client, plus suppressing the
-- lead-pipeline auto-start for the duration of this one insert. set_config's
-- third argument (is_local = true) scopes the GUC to the current
-- transaction only, so it reverts automatically and never leaks into any
-- other statement on the same connection.
create or replace function public.create_client_from_ghl_import(
  p_workspace_id uuid,
  p_client_type text,
  p_first_name text default null,
  p_last_name text default null,
  p_business_name text default null,
  p_date_of_birth date default null,
  p_primary_email text default null,
  p_primary_phone text default null,
  p_ssn text default null,
  p_ein text default null,
  p_itin text default null,
  p_force_create boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  perform set_config('app.suppress_lead_pipeline_autostart', 'true', true);

  return public.create_client(
    p_workspace_id => p_workspace_id,
    p_client_type => p_client_type,
    p_first_name => p_first_name,
    p_last_name => p_last_name,
    p_business_name => p_business_name,
    p_date_of_birth => p_date_of_birth,
    p_primary_email => p_primary_email,
    p_primary_phone => p_primary_phone,
    p_ssn => p_ssn,
    p_ein => p_ein,
    p_itin => p_itin,
    p_force_create => p_force_create
  );
end;
$function$;
