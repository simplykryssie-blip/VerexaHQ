-- Phase 2: unify Early Access invitations with signup + Stripe billing.
-- Purely additive: new nullable column, new table, new RLS, no existing
-- table/column/constraint is altered destructively.

-- Admins may optionally pin which subscription plan an Early Access
-- invitation grants. NULL falls back to the 'beta' (Founding Beta) plan
-- code in application logic -- never hardcoded to a dollar amount.
alter table public.early_access_invitations add column if not exists plan_code text;

-- Billing authorization acceptance record -- mirrors the shape of
-- early_access_agreements (version, snapshot of what was shown, ip/user
-- agent, timestamps) since that table is the established, reviewed pattern
-- for consent records in this schema.
create table if not exists public.workspace_billing_authorizations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  invitation_id uuid references public.early_access_invitations(id) on delete set null,
  terms_version text not null,
  ea_agreement_version text,
  billing_authorization_version text not null,
  authorization_text text not null,
  displayed_price numeric,
  currency text not null default 'usd',
  trial_end timestamptz,
  accepted_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_billing_authorizations_workspace
  on public.workspace_billing_authorizations(workspace_id);

alter table public.workspace_billing_authorizations enable row level security;

-- Selectable by the workspace itself or a platform admin; never across
-- workspaces. No direct INSERT/UPDATE/DELETE policy for anon/authenticated
-- -- writes only happen through record_billing_authorization() below,
-- consistent with the service_role-only pattern used for other consent-
-- and invitation-adjacent tables in this schema.
create policy "workspace members can view their billing authorizations"
  on public.workspace_billing_authorizations for select
  to authenticated
  using (public.is_workspace_member(workspace_id) or public.is_platform_admin());

create policy "service role manages billing authorizations"
  on public.workspace_billing_authorizations for all
  to service_role
  using (true)
  with check (true);

create or replace function public.record_billing_authorization(
  p_workspace_id uuid,
  p_invitation_id uuid,
  p_terms_version text,
  p_ea_agreement_version text,
  p_billing_authorization_version text,
  p_authorization_text text,
  p_displayed_price numeric,
  p_currency text,
  p_trial_end timestamptz,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' and auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if auth.role() <> 'service_role' and not public.is_workspace_member(p_workspace_id) then
    raise exception 'Not allowed to record a billing authorization for this workspace';
  end if;
  if nullif(trim(coalesce(p_terms_version,'')),'') is null then raise exception 'Terms version is required'; end if;
  if nullif(trim(coalesce(p_billing_authorization_version,'')),'') is null then raise exception 'Billing authorization version is required'; end if;
  if nullif(trim(coalesce(p_authorization_text,'')),'') is null then raise exception 'Authorization text is required'; end if;

  insert into public.workspace_billing_authorizations(
    workspace_id, user_id, invitation_id, terms_version, ea_agreement_version,
    billing_authorization_version, authorization_text, displayed_price, currency,
    trial_end, ip_address, user_agent
  ) values (
    p_workspace_id, coalesce(auth.uid(), (select owner_id from public.workspaces where id = p_workspace_id)),
    p_invitation_id, trim(p_terms_version), nullif(trim(coalesce(p_ea_agreement_version,'')),''),
    trim(p_billing_authorization_version), p_authorization_text, p_displayed_price,
    coalesce(nullif(trim(coalesce(p_currency,'')),''), 'usd'), p_trial_end, p_ip_address, p_user_agent
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.record_billing_authorization(uuid, uuid, text, text, text, text, numeric, text, timestamptz, inet, text) from anon;
grant execute on function public.record_billing_authorization(uuid, uuid, text, text, text, text, numeric, text, timestamptz, inet, text) to authenticated, service_role;
