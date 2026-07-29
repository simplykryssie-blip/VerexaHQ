-- handle_new_firmflow_user() previously ran unconditionally on every new
-- auth.users row and always called provision_invited_beta_workspace, which
-- raises an exception when raw_user_meta_data has no valid beta_access_code
-- -- since this is an AFTER INSERT trigger, that exception would roll back
-- the auth.users insert itself. That's correct behavior for the legacy
-- /signup beta-code path (verified unchanged below), but it would make it
-- impossible to create an account through the new Early Access invitation
-- flow, which provisions the workspace itself via provision_early_access_
-- workspace() instead. Recognizing that path by a metadata marker and
-- stepping aside for it.
create or replace function public.handle_new_firmflow_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_workspace_id uuid;
begin
  if coalesce(new.raw_user_meta_data->>'provisioning_source','') = 'early_access_invitation' then
    return new;
  end if;

  v_workspace_id:=public.provision_invited_beta_workspace(
    new.id,coalesce(new.email,''),
    coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',''),
    coalesce(new.raw_user_meta_data->>'business_name',new.raw_user_meta_data->>'company_name',new.raw_user_meta_data->>'firm_name',''),
    coalesce(new.raw_user_meta_data->>'beta_access_code','')
  );
  return new;
end; $function$;
