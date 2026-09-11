-- Replace the uuid-only set_platform_ai_operator from the Phase 1 migration
-- with the exact set_platform_it / set_platform_it_by_id convention already
-- used for granting/revoking platform IT access, so the new AI-operator
-- manager UI can be a straight port of PlatformItManager.tsx (grant by
-- email, revoke by id) instead of diverging from an established pattern.

drop function if exists public.set_platform_ai_operator(uuid, boolean);

create or replace function public.set_platform_ai_operator(p_user_email text, p_is_platform_ai_operator boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to change Admin AI access';
  end if;

  select id into v_user_id from auth.users where email = p_user_email;
  if v_user_id is null then
    raise exception 'no user found with email %', p_user_email;
  end if;

  update public.user_profiles set is_platform_ai_operator = p_is_platform_ai_operator, updated_at = now() where id = v_user_id;
end;
$function$;

create or replace function public.set_platform_ai_operator_by_id(p_user_id uuid, p_is_platform_ai_operator boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to change Admin AI access';
  end if;

  update public.user_profiles set is_platform_ai_operator = p_is_platform_ai_operator, updated_at = now() where id = p_user_id;
end;
$function$;
