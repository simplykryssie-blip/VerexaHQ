-- Moves the lead -> client conversion point from "organizer submitted" to
-- "quote accepted," per the intended process: a submitted organizer is
-- still an opportunity being evaluated (Lead: YES, Client: Not yet), not
-- a commitment. The firm hasn't offered the work or priced it yet at that
-- point, so nothing should convert the client's status there. It converts
-- only once the client has actually accepted a quote for the work.

drop trigger if exists trg_flip_lead_on_organizer_submission on public.organizer_responses;
drop function if exists public.flip_lead_on_organizer_submission();

-- Mirrors _notify_admins_of_new_public_lead / _notify_admins_of_pending_client_change's
-- shape: loop workspace owners/admins, queue an in-app notification each.
create or replace function public._notify_admins_of_quote_response(p_workspace_id uuid, p_client_id uuid, p_quote_id uuid, p_response text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_recipient record;
begin
  for v_recipient in
    select wu.user_id from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = p_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    perform public.create_notification(
      p_workspace_id, v_recipient.user_id,
      case when p_response = 'accepted' then 'QUOTE_ACCEPTED' else 'QUOTE_DECLINED' end,
      case when p_response = 'accepted' then 'quote_accepted' else 'quote_declined' end,
      jsonb_build_object('client_id', p_client_id, 'quote_id', p_quote_id),
      array['In-App'::text], 'Medium', 'quote', p_quote_id
    );
  end loop;
end;
$$;

-- A quote flipping to accepted is the actual "this person has been
-- accepted by the firm" moment -- same hardcoded 'lead' -> 'active'
-- transition the old organizer-submission trigger used, just moved to
-- the right event.
create or replace function public.flip_lead_on_quote_acceptance()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    update public.clients
      set lifecycle_status = 'active'
      where id = new.client_id and lifecycle_status = 'lead';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_flip_lead_on_quote_acceptance on public.quotes;
create trigger trg_flip_lead_on_quote_acceptance
  after update of status on public.quotes
  for each row execute function public.flip_lead_on_quote_acceptance();

-- Portal-facing accept/decline. quotes_update RLS requires billing.manage
-- (staff only) -- a portal client can already SELECT their own quotes
-- (quotes_select already has an is_portal_user branch) but can't update
-- them directly, so this is a SECURITY DEFINER RPC, same shape as
-- accept_portal_invitation: resolve identity via is_portal_user(), guard
-- the quote's current status, then apply the change.
create or replace function public.accept_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quote public.quotes;
begin
  select * into v_quote from public.quotes where id = p_quote_id;
  if v_quote.id is null then
    raise exception 'quote not found';
  end if;
  if not public.is_portal_user(v_quote.client_id) then
    raise exception 'not authorized to respond to this quote';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'this quote is no longer awaiting a response';
  end if;

  update public.quotes set status = 'accepted', accepted_at = now() where id = p_quote_id;

  perform public._notify_admins_of_quote_response(v_quote.workspace_id, v_quote.client_id, p_quote_id, 'accepted');
end;
$$;

create or replace function public.decline_quote(p_quote_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quote public.quotes;
begin
  select * into v_quote from public.quotes where id = p_quote_id;
  if v_quote.id is null then
    raise exception 'quote not found';
  end if;
  if not public.is_portal_user(v_quote.client_id) then
    raise exception 'not authorized to respond to this quote';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'this quote is no longer awaiting a response';
  end if;

  update public.quotes
  set status = 'declined',
      declined_at = now(),
      notes = case when p_reason is not null and btrim(p_reason) <> ''
        then coalesce(notes || E'\n\n', '') || 'Client declined: ' || btrim(p_reason)
        else notes
      end
  where id = p_quote_id;

  perform public._notify_admins_of_quote_response(v_quote.workspace_id, v_quote.client_id, p_quote_id, 'declined');
end;
$$;

revoke all on function public.accept_quote(uuid) from public, anon;
grant execute on function public.accept_quote(uuid) to authenticated;
revoke all on function public.decline_quote(uuid, text) from public, anon;
grant execute on function public.decline_quote(uuid, text) to authenticated;
