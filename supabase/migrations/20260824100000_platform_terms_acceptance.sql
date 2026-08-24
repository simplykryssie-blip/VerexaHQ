-- Any workspace owner (a real paying account holder, or Krystal herself
-- for Verexa HQ CRM's own ownership row) must accept the current Terms of
-- Service / Privacy Policy version before using the app -- enforced at the
-- (app) layout level (every authenticated app route passes through it), not
-- a dismissible client-side modal, so there is no page to navigate around
-- it. Reuses consent_records (already supports a bare user_id with no
-- client_id) rather than a new table.
create or replace function public.has_accepted_platform_terms(p_version text)
returns boolean
language sql
security definer
set search_path to 'public'
stable
as $function$
  select exists (
    select 1 from public.consent_records
    where user_id = auth.uid()
      and consent_type = 'platform_terms'
      and version = p_version
  );
$function$;

revoke all on function public.has_accepted_platform_terms(text) from public, anon;
grant execute on function public.has_accepted_platform_terms(text) to authenticated, service_role;

create or replace function public.accept_platform_terms(p_version text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select workspace_id into v_workspace_id
  from public.workspace_users
  where user_id = auth.uid() and is_owner = true and status = 'active'
  order by created_at
  limit 1;

  insert into public.consent_records (workspace_id, user_id, client_id, consent_type, version, accepted_at)
  values (v_workspace_id, auth.uid(), null, 'platform_terms', p_version, now());
end;
$function$;

revoke all on function public.accept_platform_terms(text) from public, anon;
grant execute on function public.accept_platform_terms(text) to authenticated, service_role;
