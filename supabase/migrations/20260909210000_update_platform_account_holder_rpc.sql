-- Platform-admin's Accounts page (get_platform_account_holders) has been
-- read-only since it shipped -- there was no way to correct a customer's
-- name/phone/firm name short of a raw SQL update. Adding that now, at the
-- user's explicit request that it stay a *simple* contact-info form and
-- never grow into the tax-client intake form (NewClientButton/create_client)
-- -- no SSN, DOB, ITIN/EIN, or any other tax-specific field belongs here.
-- Email is deliberately excluded from this RPC: it's the account holder's
-- real Supabase Auth login email, not a separate contact field, so changing
-- it goes through the service-role admin API in a dedicated route instead
-- of SQL (same reasoning as the platform-admin invite flow already using
-- supabase.auth.admin.* for anything touching real credentials).
create or replace function public.update_platform_account_holder(
  p_workspace_id uuid,
  p_user_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_company_name text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions';
  end if;

  if not exists (
    select 1 from public.workspace_users
    where workspace_id = p_workspace_id and user_id = p_user_id and is_owner = true and status = 'active'
  ) then
    raise exception 'user % is not the owner of workspace %', p_user_id, p_workspace_id;
  end if;

  update public.user_profiles
  set
    first_name = nullif(btrim(p_first_name), ''),
    last_name = nullif(btrim(p_last_name), ''),
    phone = nullif(btrim(p_phone), ''),
    display_name = nullif(btrim(concat_ws(' ', p_first_name, p_last_name)), '')
  where id = p_user_id;

  update public.workspaces
  set name = coalesce(nullif(btrim(p_company_name), ''), name)
  where id = p_workspace_id;
end;
$function$;

revoke all on function public.update_platform_account_holder(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.update_platform_account_holder(uuid, uuid, text, text, text, text) to authenticated;
