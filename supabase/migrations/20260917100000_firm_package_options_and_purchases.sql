-- Lets a package (firm_packages) define a menu of choices under its one
-- flat/recurring price -- e.g. a Service Bureau reselling tax software and
-- bank products lets a connected firm pick which vendor(s) they want,
-- within a min/max the Service Bureau sets per group, all at the package's
-- one price. Then lets the connected firm actually pay for it themselves
-- (Stripe Connect direct charge on the *parent* workspace's own account,
-- one-time or recurring depending on the package's existing billing_cadence)
-- and fires a new automation trigger in the parent's workspace on purchase/
-- cancellation, so onboarding onto the chosen vendor doesn't require the
-- Service Bureau to manually handle every signup.

create table public.firm_package_option_groups (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.firm_packages(id) on delete cascade,
  name text not null,
  min_select int not null default 1,
  max_select int, -- null = unlimited
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index firm_package_option_groups_package_idx on public.firm_package_option_groups(package_id);

alter table public.firm_package_option_groups enable row level security;

create policy firm_package_option_groups_select on public.firm_package_option_groups for select using (
  exists (
    select 1 from public.firm_packages p
    where p.id = firm_package_option_groups.package_id
      and (
        public.is_workspace_member(p.workspace_id)
        or exists (select 1 from public.firm_connections fc where fc.package_id = p.id and public.is_workspace_member(fc.child_workspace_id))
      )
  )
);
create policy firm_package_option_groups_insert on public.firm_package_option_groups for insert with check (
  exists (select 1 from public.firm_packages p where p.id = package_id and public.is_workspace_admin(p.workspace_id))
);
create policy firm_package_option_groups_update on public.firm_package_option_groups for update using (
  exists (select 1 from public.firm_packages p where p.id = firm_package_option_groups.package_id and public.is_workspace_admin(p.workspace_id))
);
create policy firm_package_option_groups_delete on public.firm_package_option_groups for delete using (
  exists (select 1 from public.firm_packages p where p.id = firm_package_option_groups.package_id and public.is_workspace_admin(p.workspace_id))
);

create table public.firm_package_options (
  id uuid primary key default gen_random_uuid(),
  option_group_id uuid not null references public.firm_package_option_groups(id) on delete cascade,
  label text not null, -- free text, tenant-defined ("TaxSlayer", "Republic Bank", ...) -- nothing hardcoded
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index firm_package_options_group_idx on public.firm_package_options(option_group_id);

alter table public.firm_package_options enable row level security;

create policy firm_package_options_select on public.firm_package_options for select using (
  exists (
    select 1 from public.firm_package_option_groups g join public.firm_packages p on p.id = g.package_id
    where g.id = firm_package_options.option_group_id
      and (
        public.is_workspace_member(p.workspace_id)
        or exists (select 1 from public.firm_connections fc where fc.package_id = p.id and public.is_workspace_member(fc.child_workspace_id))
      )
  )
);
create policy firm_package_options_insert on public.firm_package_options for insert with check (
  exists (
    select 1 from public.firm_package_option_groups g join public.firm_packages p on p.id = g.package_id
    where g.id = option_group_id and public.is_workspace_admin(p.workspace_id)
  )
);
create policy firm_package_options_update on public.firm_package_options for update using (
  exists (
    select 1 from public.firm_package_option_groups g join public.firm_packages p on p.id = g.package_id
    where g.id = firm_package_options.option_group_id and public.is_workspace_admin(p.workspace_id)
  )
);
create policy firm_package_options_delete on public.firm_package_options for delete using (
  exists (
    select 1 from public.firm_package_option_groups g join public.firm_packages p on p.id = g.package_id
    where g.id = firm_package_options.option_group_id and public.is_workspace_admin(p.workspace_id)
  )
);

create table public.firm_package_purchases (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.firm_packages(id) on delete cascade,
  connection_id uuid not null references public.firm_connections(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,      -- buyer (child)
  parent_workspace_id uuid not null references public.workspaces(id) on delete cascade, -- seller
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'canceled')),
  billing_cadence text, -- snapshot of the package's cadence at purchase time
  amount numeric,       -- snapshot of the package's price at purchase time
  selected_option_ids uuid[],
  stripe_checkout_session_id text,
  stripe_subscription_id text,
  stripe_customer_id text,
  current_period_end timestamptz,
  purchased_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live purchase per connection at a time -- matches the "1 package"
-- business rule (a re-checkout to change tiers/selections must first
-- supersede/cancel the existing row, not create a second concurrent one).
create unique index firm_package_purchases_active_per_connection
  on public.firm_package_purchases(connection_id) where status in ('pending', 'active', 'past_due');
create index firm_package_purchases_workspace_idx on public.firm_package_purchases(workspace_id);
create index firm_package_purchases_parent_idx on public.firm_package_purchases(parent_workspace_id);

alter table public.firm_package_purchases enable row level security;

create policy firm_package_purchases_select on public.firm_package_purchases for select using (
  public.is_workspace_member(workspace_id) or public.is_workspace_member(parent_workspace_id)
);
-- Checkout is initiated by the buyer's own admin; status/stripe fields are
-- only ever written by the webhook's service-role path afterward -- no
-- client-facing update/delete policy at all (RLS defaults to deny).
create policy firm_package_purchases_insert on public.firm_package_purchases for insert with check (
  public.is_workspace_admin(workspace_id)
);

-- Mirrors fire_engagement_share_created_automations()'s shape exactly: fires
-- in the SELLER's (parent) workspace off an event on a row that belongs to
-- the buyer, passing cross-workspace context through trigger_snapshot with
-- client_id/engagement_id left null. One function handles both the
-- "purchased" and "canceled" transitions, multiplexed on the new status.
create function public.fire_firm_package_purchase_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_event text;
  v_package record;
  v_buyer_name text;
  v_selected_labels jsonb;
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    v_event := 'firm_package.purchased';
  elsif new.status = 'canceled' and old.status is distinct from 'canceled' then
    v_event := 'firm_package.canceled';
  else
    return new;
  end if;

  select name, billing_cadence into v_package from public.firm_packages where id = new.package_id;
  select name into v_buyer_name from public.workspaces where id = new.workspace_id;
  select coalesce(jsonb_agg(o.label), '[]'::jsonb) into v_selected_labels
    from public.firm_package_options o where o.id = any(coalesce(new.selected_option_ids, '{}'::uuid[]));

  v_context := jsonb_build_object(
    'purchase_id', new.id,
    'package_id', new.package_id,
    'package_purchase.package_name', v_package.name,
    'package_purchase.billing_cadence', coalesce(new.billing_cadence, v_package.billing_cadence),
    'connection_id', new.connection_id,
    'buyer_workspace_name', v_buyer_name,
    'amount', new.amount,
    'selected_options', v_selected_labels
  );

  for v_automation in
    select * from public.automations
    where workspace_id = new.parent_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = v_event
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.parent_workspace_id, null, null) then
      insert into public.automation_runs (workspace_id, automation_id, trigger_snapshot, status)
      values (new.parent_workspace_id, v_automation.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger firm_package_purchases_fire_automations
after update of status on public.firm_package_purchases
for each row execute function public.fire_firm_package_purchase_automations();
