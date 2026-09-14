-- Phase 6G: Partner Onboarding Completion Engine.
--
-- Fixes the operational dead-end the Phase 6F audit found: agreement_required
-- and documents_required default to true, but nothing anywhere ever sets
-- partner_onboardings.agreement_signature_request_id /
-- document_request_id, so _maybe_enter_review() can never see them satisfied
-- and a valid application sits in in_progress forever. Both linking RPCs
-- (set_partner_onboarding_agreement_request, set_partner_onboarding_document_request)
-- already existed with zero callers -- this migration gives the document
-- half a real, reusable server-side path and tightens the agreement half's
-- existing linking RPC so it's safe to drive from a UI. It also fixes the
-- companion setup->ready dead-end: an onboarding with both setup
-- requirements turned off could never reach ready, because nothing called
-- the readiness check on approval.
--
-- Nothing here creates a second onboarding/document/signature system, adds
-- a status, or touches Phase 5B/6D/6E.

-- ---------------------------------------------------------------------------
-- Documents: compose the existing create_document_request() (already used
-- by RequestsPanel for entity_type='firm_connection') with the existing
-- document-request link column. Idempotent: re-calling this after it has
-- already configured the onboarding returns the existing request instead of
-- creating a second one (Phase 6G test J).
-- ---------------------------------------------------------------------------
create or replace function public.configure_partner_onboarding_document_request(
  p_workspace_id uuid,
  p_onboarding_id uuid,
  p_document_request_template_id uuid,
  p_title text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_onboarding record;
  v_template_name text;
  v_request_id uuid;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to configure this onboarding';
  end if;

  -- Row-locked so two near-simultaneous clicks can't both pass the
  -- "not yet configured" check before either writes back.
  select * into v_onboarding from public.partner_onboardings
  where id = p_onboarding_id and workspace_id = p_workspace_id
  for update;

  if v_onboarding.id is null then
    raise exception 'onboarding record not found';
  end if;
  if not v_onboarding.documents_required then
    raise exception 'this onboarding does not require documents';
  end if;
  if v_onboarding.document_request_id is not null then
    return v_onboarding.document_request_id;
  end if;

  select name into v_template_name
  from public.document_request_templates
  where id = p_document_request_template_id and workspace_id = p_workspace_id;
  if v_template_name is null then
    raise exception 'template not found for this workspace';
  end if;

  v_request_id := public.create_document_request(
    p_workspace_id, 'firm_connection', v_onboarding.firm_connection_id, p_document_request_template_id,
    coalesce(nullif(btrim(p_title), ''), v_template_name)
  );

  update public.partner_onboardings set document_request_id = v_request_id where id = p_onboarding_id;

  return v_request_id;
end;
$function$;

revoke all on function public.configure_partner_onboarding_document_request(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.configure_partner_onboarding_document_request(uuid, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Agreement: the signature-request itself still has to be created
-- client-side (PDF rendering + Storage upload, via the existing
-- createSignatureRequestFromTemplate() helper SignaturesPanel already
-- uses) -- that cannot run inside a Postgres function. This RPC is only
-- the linking half, tightened so it can safely be called from a UI:
-- rejects re-linking once an agreement is already configured, instead of
-- silently overwriting it (closing the same double-submit risk the
-- document RPC above closes with a row lock + early return). Every other
-- existing check (admin-gated, same-workspace signature request) is
-- unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.set_partner_onboarding_agreement_request(p_workspace_id uuid, p_onboarding_id uuid, p_signature_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existing uuid;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to manage this onboarding';
  end if;

  select agreement_signature_request_id into v_existing
  from public.partner_onboardings
  where id = p_onboarding_id and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'onboarding record not found';
  end if;
  if v_existing is not null then
    raise exception 'this onboarding already has an agreement configured';
  end if;
  if not exists (select 1 from public.signature_requests where id = p_signature_request_id and workspace_id = p_workspace_id) then
    raise exception 'signature request not found for this workspace';
  end if;

  update public.partner_onboardings set agreement_signature_request_id = p_signature_request_id where id = p_onboarding_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Setup -> ready dead end: an onboarding approved with both
-- training_required and bank_software_setup_required already false could
-- never reach ready, because _maybe_reach_partner_onboarding_ready was only
-- ever invoked from the two manual-completion RPCs. It's a guarded no-op
-- for any onboarding that still has an outstanding requirement, so calling
-- it unconditionally after every review decision is safe.
-- ---------------------------------------------------------------------------
create or replace function public.record_partner_onboarding_review(p_workspace_id uuid, p_onboarding_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_onboarding record;
begin
  if p_decision not in ('approved', 'rejected', 'info_requested') then
    raise exception 'invalid review decision: %', p_decision;
  end if;
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to review onboarding for this workspace';
  end if;

  select * into v_onboarding from public.partner_onboardings where id = p_onboarding_id and workspace_id = p_workspace_id;
  if v_onboarding.id is null then
    raise exception 'onboarding record not found';
  end if;
  if v_onboarding.status <> 'under_review' then
    raise exception 'this onboarding is not currently under review';
  end if;

  update public.partner_onboardings
  set review_decision = p_decision,
      review_note = p_note,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      status = case p_decision
        when 'approved' then 'setup'
        when 'rejected' then 'rejected'
        else 'in_progress'
      end,
      rejected_reason = case when p_decision = 'rejected' then p_note else rejected_reason end,
      rejected_at = case when p_decision = 'rejected' then now() else rejected_at end
  where id = p_onboarding_id;

  perform public._maybe_reach_partner_onboarding_ready(p_onboarding_id);
end;
$function$;
