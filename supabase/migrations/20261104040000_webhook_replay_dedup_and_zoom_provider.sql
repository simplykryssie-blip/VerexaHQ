-- P16-03 / P16-05; P18-07: the inbound automation webhook
-- (app/api/automations/webhook/[token]/route.ts) accepts arbitrary JSON
-- with no rate/size control and no event-id dedup, and the Zoom/Resend
-- inbound webhooks verify their signature correctly but never check
-- timestamp freshness (a captured valid request can be replayed forever)
-- and never dedup on the provider's own event id (a retried/duplicate
-- delivery reprocesses and double-applies its side effects). Stripe
-- already has exactly this protection (claim_stripe_webhook_event,
-- migration stripe_webhook_event_idempotency) but that fix was
-- deliberately scoped to provider = 'stripe' only, leaving Zoom/Resend
-- and the automation webhook unprotected -- this generalizes the same
-- proven pattern rather than inventing a new one.
--
-- This is unrelated to the separate webhook_integrations/claim_webhook_event/
-- fire_webhook_automations infrastructure already live in production
-- (confirmed via direct inspection: 0 webhook_integrations rows, 0
-- automations with trigger_type='webhook.received' configured against an
-- integration_id, no migration file for it in this repo, no application
-- code referencing it anywhere). That infrastructure is workspace-scoped
-- (webhook_integrations.workspace_id is NOT NULL) and entirely unused --
-- a fit for a not-yet-built per-workspace "connect your own webhook
-- provider" feature, not for Zoom/Resend (single platform-level
-- credentials, not per-workspace) or the existing token-only automation
-- webhook (already live with 46 real automations holding a webhook_token,
-- would require a net-new configuration UI to move onto integration_id).
-- Migrating onto it here would be exactly the "redesign the entire
-- webhook architecture" this fix is scoped to avoid. Left untouched and
-- out of scope; noted for a separate backlog item if ever adopted.

-- 'zoom' was never an allowed provider (the Zoom route never logged to
-- webhook_events at all) -- widen the existing check constraint so it can
-- now participate in the same dedup table as every other provider.
alter table public.webhook_events drop constraint webhook_events_provider_check;
alter table public.webhook_events add constraint webhook_events_provider_check
  check (provider = any (array['stripe'::text, 'resend'::text, 'twilio'::text, 'generic'::text, 'zoom'::text, 'automation_webhook'::text]));

-- Mirrors webhook_events_stripe_external_id_uidx exactly, just generalized
-- to every non-Stripe, non-integration-scoped provider sharing this new
-- claim function (Stripe keeps its own already-proven index/function
-- untouched; integration-scoped rows keep using their own existing
-- (integration_id, external_id) index).
create unique index webhook_events_provider_external_id_uidx
  on public.webhook_events (provider, external_id)
  where provider <> 'stripe' and integration_id is null and external_id is not null;

-- Same atomic claim semantics as claim_stripe_webhook_event (first
-- delivery of an event id succeeds outright; a concurrent or already-
-- processed duplicate comes back should_process = false; a genuinely
-- failed or >5-minutes-stuck attempt is retryable) -- generalized by
-- provider instead of hardcoded to Stripe.
create or replace function public.claim_provider_webhook_event(
  p_provider text,
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
  values (p_provider, p_event_type, p_event_id, p_payload, 'received')
  on conflict (provider, external_id) where provider <> 'stripe' and integration_id is null and external_id is not null
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
  where we.provider = p_provider and we.external_id = p_event_id and we.integration_id is null;
  return query select v_id, false;
end;
$$;

-- Internal-only, exactly matching claim_stripe_webhook_event's own grant
-- shape -- a client-supplied event id must never be trusted to control
-- this table directly.
revoke execute on function public.claim_provider_webhook_event(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_provider_webhook_event(text, text, text, jsonb) to service_role;
