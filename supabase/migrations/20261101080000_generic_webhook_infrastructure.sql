-- Automations reconciliation, Phase 16-18/17: generic webhook infrastructure.
--
-- Audited the existing webhook.received trigger before building anything
-- new, per instruction. It already exists (app/api/automations/webhook/[token]/route.ts)
-- but is weak relative to the required architecture: a single unguessable
-- per-AUTOMATION token as the only gate (no signature verification), no
-- workspace/integration model (the automation's own row IS the identity),
-- no persisted-event ledger, no dedup/replay protection, and a hardcoded
-- "this is always a new lead" field-extraction assumption. It is kept
-- exactly as-is (not touched by this migration) since existing workflows
-- depend on it and it is a legitimate, if narrow, way to start a workflow
-- from a public form -- but it is not extended to be the general mechanism,
-- since it cannot be (no room for a signing secret or real event identity
-- without changing its whole shape).
--
-- Also audited webhook_events (2260a... baseline) -- already the platform's
-- own Stripe billing webhook ledger (provider/event_type/external_id/
-- workspace_id/payload/status/attempts, used via claim_stripe_webhook_event).
-- Extended below (integration_id, is_test) rather than duplicated, per
-- instruction not to create a second webhook-event system.
--
-- New: webhook_integrations is the workspace-owned identity a customer's
-- own third-party webhook (or their own Stripe webhook, as one provider
-- among others) authenticates against. The endpoint URL embeds the
-- integration's id, but the id alone grants nothing -- every request must
-- also carry a valid signature computed with that integration's own
-- signing_secret, which is never selectable by ordinary workspace members
-- (column-level grant below) and is shown to a workspace admin only once,
-- at creation, by the create_webhook_integration RPC's return value (never
-- re-displayed after that, matching how API keys/webhook secrets are
-- everywhere).
--
-- Workspace/integration identity always comes from the endpoint itself
-- (webhook_integrations.id in the URL path, looked up server-side) -- never
-- from anything in the request body or headers, closing the exact class of
-- gap explicitly called out ("do not trust workspace_id supplied by an
-- external request body").

create table public.webhook_integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null default 'generic' check (provider in ('generic', 'stripe')),
  name text not null,
  signing_secret text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_event_at timestamptz
);

create unique index webhook_integrations_workspace_name_uidx on public.webhook_integrations(workspace_id, name);
create index webhook_integrations_workspace_id_idx on public.webhook_integrations(workspace_id);

alter table public.webhook_integrations enable row level security;

create policy webhook_integrations_select on public.webhook_integrations
  for select using (public.has_permission(workspace_id, 'automations.manage') or public.is_platform_admin());

create policy webhook_integrations_update on public.webhook_integrations
  for update using (public.has_permission(workspace_id, 'automations.manage')) with check (public.has_permission(workspace_id, 'automations.manage'));

create policy webhook_integrations_delete on public.webhook_integrations
  for delete using (public.has_permission(workspace_id, 'automations.manage'));

-- No insert policy: rows are only ever created via create_webhook_integration
-- below (SECURITY DEFINER), which is the only path that can set
-- signing_secret to a freshly generated value and return it once. A direct
-- client insert would either have to supply its own secret (defeats the
-- point) or leave it null (constraint violation) -- disallowing it entirely
-- keeps "how a secret is created" to one audited code path.

-- Column-level grant: workspace members with automations.manage can see
-- everything about their own integrations EXCEPT signing_secret, even
-- though the row-level policy above would otherwise let them select the
-- whole row. Postgres enforces column privileges independently of RLS, so
-- `select signing_secret` fails even for an authorized row.
revoke all on public.webhook_integrations from authenticated;
grant select (id, workspace_id, provider, name, status, created_by, created_at, updated_at, last_event_at) on public.webhook_integrations to authenticated;
grant update (name, status) on public.webhook_integrations to authenticated;
grant delete on public.webhook_integrations to authenticated;
grant all on public.webhook_integrations to service_role;

create trigger set_updated_at before update on public.webhook_integrations
  for each row execute function public.set_updated_at();

create or replace function public.create_webhook_integration(p_workspace_id uuid, p_provider text, p_name text)
returns table (id uuid, signing_secret text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_secret text;
  v_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'automations.manage') then
    raise exception 'insufficient permissions to create a webhook integration for this workspace';
  end if;
  if p_provider not in ('generic', 'stripe') then
    raise exception 'unsupported provider: %', p_provider;
  end if;

  -- 32 random bytes, hex-encoded -- same entropy class as a Stripe webhook
  -- signing secret (whsec_...), shown to the caller exactly once via this
  -- function's return value.
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.webhook_integrations (workspace_id, provider, name, signing_secret, created_by)
  values (p_workspace_id, p_provider, p_name, v_secret, auth.uid())
  returning webhook_integrations.id into v_id;

  return query select v_id, v_secret;
end;
$$;

revoke all on function public.create_webhook_integration(uuid, text, text) from public, anon;
grant execute on function public.create_webhook_integration(uuid, text, text) to authenticated;

create or replace function public.rotate_webhook_integration_secret(p_integration_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_secret text;
begin
  select workspace_id into v_workspace_id from public.webhook_integrations where id = p_integration_id;
  if v_workspace_id is null then
    raise exception 'webhook integration not found';
  end if;
  if not public.has_permission(v_workspace_id, 'automations.manage') then
    raise exception 'insufficient permissions to rotate this webhook integration''s secret';
  end if;

  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  update public.webhook_integrations set signing_secret = v_secret where id = p_integration_id;
  return v_secret;
end;
$$;

revoke all on function public.rotate_webhook_integration_secret(uuid) from public, anon;
grant execute on function public.rotate_webhook_integration_secret(uuid) to authenticated;

alter table public.webhook_events add column if not exists integration_id uuid references public.webhook_integrations(id) on delete set null;
alter table public.webhook_events add column if not exists is_test boolean not null default false;

-- Generalized dedup for customer-configured integrations, parallel to
-- webhook_events_stripe_external_id_uidx's existing (provider='stripe',
-- external_id is not null) index for the platform's OWN Stripe billing
-- webhook -- that index is untouched, this is a separate identity space.
create unique index webhook_events_integration_external_id_uidx on public.webhook_events(integration_id, external_id)
  where integration_id is not null and external_id is not null;

create index webhook_events_integration_id_idx on public.webhook_events(integration_id) where integration_id is not null;

create or replace function public.claim_webhook_event(
  p_integration_id uuid,
  p_event_type text,
  p_external_id text,
  p_payload jsonb,
  p_is_test boolean default false
)
returns table (id uuid, should_process boolean, workspace_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_workspace_id uuid;
  v_provider text;
begin
  select wi.workspace_id, wi.provider into v_workspace_id, v_provider
  from public.webhook_integrations wi
  where wi.id = p_integration_id and wi.status = 'active';

  if v_workspace_id is null then
    raise exception 'webhook integration not found or disabled';
  end if;

  -- Same claim-or-detect-duplicate shape as claim_stripe_webhook_event: an
  -- event already 'processed' is a pure duplicate delivery (should_process
  -- false); one stuck 'received' for more than 5 minutes or previously
  -- 'failed' is allowed a controlled retry rather than being silently
  -- dropped forever.
  insert into public.webhook_events (provider, event_type, external_id, workspace_id, integration_id, payload, status, is_test)
  values (v_provider, p_event_type, p_external_id, v_workspace_id, p_integration_id, p_payload, 'received', p_is_test)
  on conflict (integration_id, external_id) where integration_id is not null and external_id is not null
  do update set
    attempts = webhook_events.attempts + 1,
    status = 'received',
    last_error = null,
    received_at = now()
  where webhook_events.status = 'failed'
     or (webhook_events.status = 'received' and webhook_events.received_at < now() - interval '5 minutes')
  returning webhook_events.id into v_id;

  if v_id is not null then
    update public.webhook_integrations set last_event_at = now() where id = p_integration_id;
    return query select v_id, true, v_workspace_id;
    return;
  end if;

  select we.id into v_id from public.webhook_events we
  where we.integration_id = p_integration_id and we.external_id = p_external_id;
  return query select v_id, false, v_workspace_id;
end;
$$;

revoke all on function public.claim_webhook_event(uuid, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.claim_webhook_event(uuid, text, text, jsonb, boolean) to service_role;

create or replace function public.mark_webhook_event_processed(p_event_id uuid, p_status text, p_error text default null)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.webhook_events
  set status = p_status, processed_at = now(), last_error = p_error
  where id = p_event_id;
$$;

revoke all on function public.mark_webhook_event_processed(uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_webhook_event_processed(uuid, text, text) to service_role;

-- Fires automations.trigger_type='webhook.received' automations configured
-- for this specific integration (new-workflow path), AND merges the event
-- into the trigger_snapshot of every currently-running run in the workspace
-- that is paused on a Wait Until Condition step (resume-waiting-workflow
-- path) -- should_advance_wait_until_step already re-evaluates that step's
-- own wait_conditions against trigger_snapshot on every cron tick, so
-- merging here is sufficient; the actual "does this match what I'm waiting
-- for" decision stays entirely inside the existing condition engine (see
-- the run.webhook_received field added to _evaluate_condition_list below),
-- not duplicated here.
create or replace function public.fire_webhook_automations(p_integration_id uuid, p_event_type text, p_payload jsonb, p_is_test boolean default false)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_last_event jsonb;
begin
  select workspace_id into v_workspace_id from public.webhook_integrations where id = p_integration_id;
  if v_workspace_id is null then
    return;
  end if;

  v_last_event := jsonb_build_object(
    'webhook_integration_id', p_integration_id,
    'webhook_event_type', p_event_type,
    'webhook_payload', p_payload
  );
  v_context := v_last_event;

  if not p_is_test then
    for v_automation in
      select * from public.automations
      where workspace_id = v_workspace_id and is_enabled = true and status = 'published'
        and trigger_type = 'webhook.received'
        and trigger_config->>'integration_id' = p_integration_id::text
        and (nullif(trigger_config->>'event_type', '') is null or trigger_config->>'event_type' = p_event_type)
    loop
      if public.evaluate_automation_conditions(v_automation.conditions, v_context, v_workspace_id, null, null) then
        insert into public.automation_runs (workspace_id, automation_id, trigger_snapshot, status, is_test)
        values (v_workspace_id, v_automation.id, v_context, 'running', false)
        returning id into v_run_id;
        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;
  end if;

  update public.automation_runs
  set trigger_snapshot = coalesce(trigger_snapshot, '{}'::jsonb) || jsonb_build_object('last_webhook_event', v_last_event)
  where workspace_id = v_workspace_id
    and status = 'running'
    and exists (
      select 1 from public.automation_pending_steps aps
      join public.automation_steps ast on ast.id = aps.automation_step_id
      where aps.run_id = automation_runs.id
        and aps.status = 'pending_delay'
        and ast.action_config->>'wait_mode' = 'until_condition'
    );
end;
$$;

revoke all on function public.fire_webhook_automations(uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.fire_webhook_automations(uuid, text, jsonb, boolean) to service_role;

-- Patch _evaluate_condition_list in place (dynamic anchor patch, same
-- reasoning as validate_automation's -- its last committed migration may be
-- stale relative to production, and this project's own history shows
-- re-authoring the whole body from a snapshot risks silently reverting a
-- live-only fix). Anchors on the run.decision block added by
-- 20260927050000_decision_step.sql -- both its declare-block variables and
-- its condition-handling branch -- since that block is very unlikely to
-- have moved (removing it would break the Review Queue Decision feature
-- itself).
do $migration$
declare
  v_def text;
  v_declare_anchor text := $anchor$  v_decision_step_id_raw text;
  v_decision_expected_option text;
  v_decision_actual_option text;$anchor$;
  v_declare_insert text := $anchor$  v_decision_step_id_raw text;
  v_decision_expected_option text;
  v_decision_actual_option text;
  v_webhook_expected_integration_id text;
  v_webhook_expected_event_type text;
  v_webhook_actual jsonb;$anchor$;
  v_body_anchor text := $anchor$    elsif v_field = 'run.decision' then
      v_decision_step_id_raw := split_part(coalesce(v_expected, ''), '|', 1);
      v_decision_expected_option := split_part(coalesce(v_expected, ''), '|', 2);
      v_decision_actual_option := p_context->'decisions'->>v_decision_step_id_raw;
      v_match := v_decision_actual_option is not distinct from v_decision_expected_option;
      if v_op = 'neq' then
        v_match := not v_match;
      end if;$anchor$;
  v_body_insert text := $anchor$    elsif v_field = 'run.decision' then
      v_decision_step_id_raw := split_part(coalesce(v_expected, ''), '|', 1);
      v_decision_expected_option := split_part(coalesce(v_expected, ''), '|', 2);
      v_decision_actual_option := p_context->'decisions'->>v_decision_step_id_raw;
      v_match := v_decision_actual_option is not distinct from v_decision_expected_option;
      if v_op = 'neq' then
        v_match := not v_match;
      end if;
    elsif v_field = 'run.webhook_received' then
      v_webhook_expected_integration_id := split_part(coalesce(v_expected, ''), '|', 1);
      v_webhook_expected_event_type := nullif(split_part(coalesce(v_expected, ''), '|', 2), '');
      v_webhook_actual := p_context->'last_webhook_event';
      v_match := v_webhook_actual is not null
        and v_webhook_actual->>'webhook_integration_id' = v_webhook_expected_integration_id
        and (v_webhook_expected_event_type is null or v_webhook_actual->>'webhook_event_type' = v_webhook_expected_event_type);
      if v_op = 'neq' then
        v_match := not v_match;
      end if;$anchor$;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc
  where proname = '_evaluate_condition_list' and pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception '_evaluate_condition_list not found -- cannot patch run.webhook_received in';
  end if;

  if v_def not like '%' || v_declare_anchor || '%' then
    raise exception '_evaluate_condition_list''s declare block has changed in a way this migration did not expect (anchor not found) -- update this migration''s anchor to match the current function body before re-running';
  end if;
  if v_def not like '%' || v_body_anchor || '%' then
    raise exception '_evaluate_condition_list''s run.decision branch has changed in a way this migration did not expect (anchor not found) -- update this migration''s anchor to match the current function body before re-running';
  end if;

  v_def := replace(v_def, v_declare_anchor, v_declare_insert);
  v_def := replace(v_def, v_body_anchor, v_body_insert);
  execute v_def;
end;
$migration$;
