-- Bootstrap gap found while wiring onboarding: workspace_members' INSERT
-- policy requires has_workspace_role(workspace_id, ['owner','admin']),
-- which itself only ever checks existing workspace_members rows. A brand
-- new workspace has none, so its very first member (the owner) can never
-- be inserted through an ordinary client-side insert under RLS -- there
-- is no bootstrap fallback to workspaces.owner_user_id in
-- has_workspace_role(). No existing RPC in this project covers workspace
-- creation. This adds exactly one SECURITY DEFINER function to close that
-- gap, following the same pattern already used throughout this schema
-- (has_workspace_role, is_workspace_member, etc.) -- no table changes, no
-- RLS policy changes, no new duplicate concepts.
--
-- The function only ever creates a workspace owned by auth.uid() and
-- inserts exactly one workspace_members row for that same user as
-- 'owner' -- it cannot be used to join an existing workspace or grant
-- membership to anyone else.
create or replace function public.create_workspace_with_owner(
  p_name text,
  p_workspace_type public.workspace_type,
  p_legal_name text default null,
  p_dba_name text default null,
  p_email text default null,
  p_phone text default null,
  p_website text default null,
  p_settings jsonb default '{}'::jsonb,
  p_plan_code text default 'solo'
)
returns public.workspaces
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_slug text;
  v_workspace public.workspaces%rowtype;
  v_plan_id uuid;
  v_trial_days int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Workspace name is required.';
  end if;

  v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then
    v_slug := 'workspace';
  end if;
  while exists (select 1 from public.workspaces w where lower(w.slug) = lower(v_slug)) loop
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 5);
  end loop;

  insert into public.workspaces (name, slug, workspace_type, legal_name, dba_name, email, phone, website, settings, owner_user_id, status)
  values (trim(p_name), v_slug, p_workspace_type, p_legal_name, p_dba_name, p_email, p_phone, p_website, coalesce(p_settings, '{}'::jsonb), auth.uid(), 'active')
  returning * into v_workspace;

  insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
  values (v_workspace.id, auth.uid(), 'owner', 'active', now());

  select id, trial_days into v_plan_id, v_trial_days
  from public.subscription_plans
  where code = coalesce(p_plan_code, 'solo') and is_active
  limit 1;

  if v_plan_id is null then
    select id, trial_days into v_plan_id, v_trial_days
    from public.subscription_plans
    where is_active
    order by monthly_price nulls last
    limit 1;
  end if;

  if v_plan_id is not null then
    insert into public.workspace_subscriptions (workspace_id, plan_id, status, trial_ends_at, current_period_start)
    values (v_workspace.id, v_plan_id, 'trialing', now() + make_interval(days => coalesce(v_trial_days, 30)), now());
  end if;

  return v_workspace;
end;
$function$;

revoke all on function public.create_workspace_with_owner(text, public.workspace_type, text, text, text, text, text, jsonb, text) from public, anon;
grant execute on function public.create_workspace_with_owner(text, public.workspace_type, text, text, text, text, text, jsonb, text) to authenticated;
