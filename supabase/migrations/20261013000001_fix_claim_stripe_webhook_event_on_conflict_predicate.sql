-- Live-tested (fixture prefix 60f00000-) and found claim_stripe_webhook_event
-- completely broken: "on conflict (external_id) where provider = 'stripe'"
-- does not match webhook_events_stripe_external_id_uidx's actual predicate
-- ("where provider = 'stripe' and external_id is not null") -- Postgres
-- requires the ON CONFLICT target's WHERE clause to match a partial unique
-- index's predicate exactly (syntactic equality, not just semantic
-- equivalence for non-null external_id), and raises "no unique or
-- exclusion constraint matching the ON CONFLICT specification" otherwise.
-- Every call failed until this was caught during live testing.

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_payload jsonb
)
returns table (id uuid, should_process boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.webhook_events (provider, event_type, external_id, payload, status)
  values ('stripe', p_event_type, p_event_id, p_payload, 'received')
  on conflict (external_id) where provider = 'stripe' and external_id is not null
  do update set
    attempts = webhook_events.attempts + 1,
    status = 'received',
    last_error = null,
    received_at = now()
  where webhook_events.status = 'failed'
     or (webhook_events.status = 'received' and webhook_events.received_at < now() - interval '5 minutes')
  returning webhook_events.id into v_id;

  if v_id is not null then
    return query select v_id, true;
    return;
  end if;

  select we.id into v_id from public.webhook_events we
  where we.provider = 'stripe' and we.external_id = p_event_id;
  return query select v_id, false;
end;
$$;
