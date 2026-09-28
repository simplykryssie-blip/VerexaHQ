-- Read helper for the Legal & Agreements UI (platform admin workspace detail
-- page, and the workspace owner's own Plan & Usage page) -- mirrors
-- get_platform_terms_acceptance_status's existing shape (SECURITY DEFINER,
-- self-checks who may call it) rather than relying on a client-side join to
-- auth.users, which isn't exposed via PostgREST. Returns every historical
-- archive for one workspace, not just the current LEGAL_VERSION.
create or replace function public.get_platform_terms_archives(p_workspace_id uuid)
returns table (
  id uuid,
  version text,
  status text,
  accepted_at timestamptz,
  pdf_generated_at timestamptz,
  pdf_storage_path text,
  generation_error text,
  accepted_by_name text,
  accepted_by_email text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    a.id, a.version, a.status, a.accepted_at, a.pdf_generated_at, a.pdf_storage_path, a.generation_error,
    up.display_name, au.email
  from public.platform_terms_acceptance_archive a
  left join public.user_profiles up on up.id = a.user_id
  left join auth.users au on au.id = a.user_id
  where a.workspace_id = p_workspace_id
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.workspace_users wu
        where wu.workspace_id = p_workspace_id
          and wu.user_id = auth.uid()
          and wu.is_owner = true
          and wu.status = 'active'
      )
    )
  order by a.accepted_at desc;
$function$;

revoke all on function public.get_platform_terms_archives(uuid) from public, anon;
grant execute on function public.get_platform_terms_archives(uuid) to authenticated, service_role;
