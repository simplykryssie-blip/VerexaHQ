-- Phase 2: Firm Configuration Engine
-- First Login Setup Wizard state. One row per workspace; the wizard itself
-- is a client-side flow that reads/writes this row plus branding,
-- office_locations, firm_tax_profile, and (if a blueprint is chosen)
-- triggers apply_blueprint().

create table public.firm_onboarding (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  current_step integer not null default 1 check (current_step between 1 and 6),
  business_info_completed boolean not null default false,
  tax_info_completed boolean not null default false,
  branding_completed boolean not null default false,
  startup_method text check (startup_method in ('use_verexa_blueprint', 'browse_blueprint_library', 'start_empty')),
  selected_blueprint_id uuid references public.blueprints(id) on delete set null,
  staff_invited boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.firm_onboarding is 'Tracks progress through the 6-step first-login setup wizard, one row per workspace.';

create trigger set_updated_at before update on public.firm_onboarding
  for each row execute function public.set_updated_at();
create trigger audit_firm_onboarding after insert or update or delete on public.firm_onboarding
  for each row execute function public.audit_trigger_fn();

alter table public.firm_onboarding enable row level security;

create policy firm_onboarding_select on public.firm_onboarding
  for select using (public.is_workspace_member(workspace_id));

create policy firm_onboarding_write on public.firm_onboarding
  for all using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- Every workspace created via create_workspace() starts the wizard at step 1.
create or replace function public.handle_new_workspace_onboarding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.firm_onboarding (workspace_id) values (new.id)
  on conflict (workspace_id) do nothing;
  return new;
end;
$$;

create trigger on_workspace_created_seed_onboarding
  after insert on public.workspaces
  for each row execute function public.handle_new_workspace_onboarding();

revoke execute on function public.handle_new_workspace_onboarding() from public, authenticated;

-- ============================================================================
-- advance_onboarding_step: admin-only step transition + completion.
-- ============================================================================
create or replace function public.advance_onboarding_step(
  p_workspace_id uuid,
  p_step integer,
  p_startup_method text default null,
  p_selected_blueprint_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to manage this workspace''s onboarding';
  end if;

  update public.firm_onboarding set
    current_step = greatest(current_step, least(p_step, 6)),
    business_info_completed = business_info_completed or p_step > 1,
    tax_info_completed = tax_info_completed or p_step > 2,
    branding_completed = branding_completed or p_step > 3,
    startup_method = coalesce(p_startup_method, startup_method),
    selected_blueprint_id = coalesce(p_selected_blueprint_id, selected_blueprint_id),
    staff_invited = staff_invited or p_step > 5,
    completed_at = case when p_step >= 6 then now() else completed_at end,
    updated_at = now()
  where workspace_id = p_workspace_id;
end;
$$;
comment on function public.advance_onboarding_step(uuid, integer, text, uuid) is 'Advances the first-login wizard to the given step, recording milestone flags along the way.';

revoke execute on function public.advance_onboarding_step(uuid, integer, text, uuid) from public;
grant execute on function public.advance_onboarding_step(uuid, integer, text, uuid) to authenticated;
