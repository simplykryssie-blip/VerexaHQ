-- Backs the Verexa HQ admin "Engagements" page: which account holders have
-- (and haven't) accepted the current Terms/Privacy version, mirroring the
-- gate in (app)/layout.tsx (has_accepted_platform_terms) so the two can
-- never disagree about who's actually accepted.
create or replace function public.get_platform_terms_acceptance_status(p_version text)
returns table (
  workspace_id uuid,
  workspace_name text,
  user_id uuid,
  display_name text,
  email text,
  accepted boolean,
  accepted_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    w.id,
    w.name,
    wu.user_id,
    up.display_name,
    au.email,
    (cr.id is not null) as accepted,
    cr.accepted_at
  from public.workspaces w
  join public.workspace_users wu on wu.workspace_id = w.id and wu.is_owner = true and wu.status = 'active'
  join public.user_profiles up on up.id = wu.user_id
  join auth.users au on au.id = wu.user_id
  left join public.consent_records cr
    on cr.user_id = wu.user_id and cr.consent_type = 'platform_terms' and cr.version = p_version
  where w.is_demo = false
    and w.is_platform_home = false
    and public.is_platform_admin()
  order by accepted asc, w.created_at desc;
$function$;

revoke all on function public.get_platform_terms_acceptance_status(text) from public, anon, authenticated;
grant execute on function public.get_platform_terms_acceptance_status(text) to authenticated, service_role;
