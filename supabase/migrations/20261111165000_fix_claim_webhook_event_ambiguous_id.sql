-- Live-tested (fixture prefix 90000000-/9000000b-/9000000c-, since cleaned
-- up) and found claim_webhook_event completely broken: its own
-- `RETURNS TABLE (id uuid, should_process boolean, workspace_id uuid)`
-- introduces an implicit `id` OUT parameter that shadows the bare `id`
-- column reference in `update public.webhook_integrations set
-- last_event_at = now() where id = p_integration_id` later in the same
-- function body -- Postgres raises "column reference \"id\" is ambiguous"
-- on every call that reaches that statement (i.e. every first-time,
-- non-duplicate delivery, which is the common case). Confirmed live: the
-- call fails every time a genuinely new webhook event is claimed.
--
-- Fix: qualify the column reference. No other change -- the duplicate-
-- detection branch below it already qualifies `we.id`/`we.integration_id`
-- correctly and was never affected by this bug.
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
    update public.webhook_integrations set last_event_at = now() where webhook_integrations.id = p_integration_id;
    return query select v_id, true, v_workspace_id;
    return;
  end if;

  select we.id into v_id from public.webhook_events we
  where we.integration_id = p_integration_id and we.external_id = p_external_id;
  return query select v_id, false, v_workspace_id;
end;
$$;
