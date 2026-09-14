-- Stripe billing hardening, Part 1: durable event-level idempotency.
--
-- webhook_events already logs every delivery (provider, event_type,
-- external_id, payload, status) for Stripe, Twilio, and Resend, but nothing
-- ever enforced uniqueness on it -- both Stripe webhook routes
-- (app/api/stripe/webhook/route.ts and .../webhook/connect/route.ts)
-- unconditionally INSERT a fresh log row per delivery and then run the
-- event's business side effects regardless of whether that same event.id
-- was already seen (and already fully processed) before. A Stripe retry --
-- or two concurrent deliveries of the same event -- would double-run
-- side effects that are not all naturally idempotent (a duplicate
-- `payments` insert in handleCheckoutSessionCompleted double-counts
-- revenue and the ledger and double-sends a receipt; a duplicate
-- credit_prepaid_balance call in handleUsageTopupCheckoutCompleted
-- double-credits a top-up).
--
-- This adds a Stripe-scoped partial unique index on webhook_events and a
-- single atomic claim RPC that both routes call before dispatching to any
-- handler. Scoped to provider = 'stripe' only -- Twilio/Resend's existing
-- unconditional inserts into this same table are completely untouched.

-- No duplicate stripe external_id rows exist today (verified before
-- writing this migration), so this index applies cleanly.
create unique index webhook_events_stripe_external_id_uidx
  on public.webhook_events (external_id)
  where provider = 'stripe' and external_id is not null;

-- ---------------------------------------------------------------------------
-- claim_stripe_webhook_event: the transaction-safe claim/insert pattern.
--
-- First delivery of an event.id: INSERT succeeds outright -> should_process
-- = true. The caller runs its handlers, then flips status via the existing
-- markWebhookProcessed/markWebhookFailed helpers (unchanged).
--
-- Concurrent duplicate delivery of the same event.id: the second INSERT
-- hits the unique index and falls into ON CONFLICT ... DO UPDATE, but the
-- UPDATE's WHERE clause only matches a 'failed' row or a 'received' row
-- older than 5 minutes (a stuck/crashed attempt) -- a fresh 'received' row
-- (the other request's in-flight claim) or an already-'processed' row
-- matches neither, so the UPDATE touches nothing, RETURNING yields no row,
-- and this request gets should_process = false and exits without running
-- any handler. Exactly one request ever proceeds, decided atomically by
-- the database, not by application code.
--
-- Retry after a genuine failure: the existing row's status is 'failed', so
-- the UPDATE branch DOES match, attempts increments, status resets to
-- 'received', and should_process = true -- the retry is allowed to actually
-- reprocess. Retry after success (status='processed') is never allowed to
-- reprocess. A 'received' row stuck past 5 minutes (a crashed invocation
-- that never reached the try/catch's failure handler) is also treated as
-- retryable rather than permanently stuck -- deliberately narrow recovery,
-- not a queue system.
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
  on conflict (external_id) where provider = 'stripe'
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

  -- Conflict occurred but the UPDATE's WHERE didn't match: a duplicate of
  -- an already-processed event, or a concurrent in-flight (non-stale)
  -- claim by another request.
  select we.id into v_id from public.webhook_events we
  where we.provider = 'stripe' and we.external_id = p_event_id;
  return query select v_id, false;
end;
$$;

-- Internal-only: called exclusively from the Stripe webhook routes using
-- the service-role client. Never exposed to authenticated/anon clients --
-- a client-supplied event_id must never be trusted to control this table.
revoke execute on function public.claim_stripe_webhook_event(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_stripe_webhook_event(text, text, jsonb) to service_role;
