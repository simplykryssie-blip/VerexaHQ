-- CONTACTS COMPLETION PASS -- Phase 5b: complete the signature audit trail
-- (Contacts Reconciliation Audit item #5). signed_at/declined_at/
-- decline_reason already existed; user_agent existed but was never
-- populated; there was no IP capture and no "viewed" event. Adds exactly
-- what's needed to answer "who received/viewed, who signed/declined, when"
-- -- no new event types beyond the one genuinely missing one (viewed).
--
-- Deliberately three new, separately-named functions rather than adding
-- parameters to record_signature_by_token/decline_signature_by_token/
-- record_signature/decline_signature: changing an existing function's
-- parameter list requires dropping it first (Postgres treats a changed
-- argument list as a new identity even under CREATE OR REPLACE -- the exact
-- gotcha this codebase's own migrations already document), which is a
-- destructive-class operation this pass has no live approval for mid-task.
-- New, additive functions carry zero risk to the four already-working
-- signing/declining RPCs and are called fire-and-forget alongside them from
-- the client, exactly like /api/sign/finalize already is.
--
-- IP is captured server-side (via a new /api/sign/[token]/track route using
-- the same clientIp() helper checkRateLimit already relies on) rather than
-- trusted from the client, since a self-reported IP would defeat the point
-- of an audit trail for anonymous public-token signers. user_agent is
-- accepted as a parameter and self-reported by the browser (navigator.
-- userAgent) -- the definitive source for that value regardless of who
-- reports it, unlike IP.

alter table public.signature_request_signers
  add column if not exists ip_address text,
  add column if not exists viewed_at timestamptz;

-- One combined "viewed" tracker (IP + first-view timestamp) rather than two
-- separate calls -- both are captured together the moment the public
-- signing page loads, and IP doesn't need re-capturing at sign time since
-- it won't have changed within the same visit.
create or replace function public.track_signature_view_by_token(p_token uuid, p_ip_address text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.signature_request_signers
  set ip_address = coalesce(p_ip_address, ip_address),
      viewed_at = coalesce(viewed_at, now())
  where access_token = p_token;
end;
$function$;

-- Supplementary metadata only (never a state transition) -- safe to set
-- unconditionally regardless of the signer's current status.
create or replace function public.set_signature_user_agent_by_token(p_token uuid, p_user_agent text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.signature_request_signers
  set user_agent = p_user_agent
  where access_token = p_token;
end;
$function$;

create or replace function public.set_signature_user_agent(p_signer_id uuid, p_user_agent text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_signer_email text;
  v_caller_email text;
begin
  select r.workspace_id, a.entity_type, a.entity_id, s.signer_email
  into v_workspace_id, v_entity_type, v_entity_id, v_signer_email
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  join public.attachments a on a.id = r.attachment_id
  where s.id = p_signer_id;

  if v_workspace_id is null then
    raise exception 'signer not found';
  end if;

  select email into v_caller_email from auth.users where id = auth.uid();

  if not (
    public.has_permission(v_workspace_id, 'signatures.request')
    or (
      v_signer_email is not null and lower(v_caller_email) = lower(v_signer_email)
      and public.is_portal_user_for_entity(v_entity_type, v_entity_id)
    )
  ) then
    raise exception 'insufficient permissions';
  end if;

  update public.signature_request_signers set user_agent = p_user_agent where id = p_signer_id;
end;
$function$;
