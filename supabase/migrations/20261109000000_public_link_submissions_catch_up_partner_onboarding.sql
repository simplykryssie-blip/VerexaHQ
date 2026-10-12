-- The Tax Avenue Pro welcome letter links partners to the generic public
-- organizer page (/o/<token>) and the generic public engagement-letter page
-- (/e/<token>). Those pages file the documents and create/reuse a contact, but
-- they never touched partner_onboardings -- the record the "Software & Banking
-- Application is Complete" wait step (partner_onboarding.application_submitted
-- AND partner_onboarding.agreement_signed) actually reads. A partner could
-- complete both forms and their automation run would sit at that wait step
-- until it timed out.
--
-- This catches those submissions up. Matching is by workspace + the submitter's
-- email against the open onboarding's connection identity (the same identity
-- resolve_firm_connection_identity() uses), so no new column or link is needed.
-- The agreement match additionally prefers the onboarding whose package points
-- at the signed template. Writes mirror submit_public_partner_onboarding_application /
-- sign_public_partner_onboarding_agreement exactly, and only ever fill in a
-- step that is still outstanding -- nothing already submitted or signed is
-- overwritten. A failure here is downgraded to a warning so it can never block
-- the visitor's own submission.

create or replace function public._match_open_partner_onboarding(
  p_workspace_id uuid,
  p_email text,
  p_agreement_template_id uuid default null
)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select po.id
  from public.partner_onboardings po
  join public.firm_connections fc on fc.id = po.firm_connection_id
  left join public.workspaces w on w.id = fc.child_workspace_id
  left join public.firm_packages pk on pk.id = po.package_id
  where po.workspace_id = p_workspace_id
    and po.status in ('pending', 'in_progress')
    and nullif(btrim(coalesce(p_email, '')), '') is not null
    and lower(btrim(coalesce(w.primary_contact_email, fc.manual_email, ''))) = lower(btrim(p_email))
  order by
    (p_agreement_template_id is not null and pk.agreement_template_id is not distinct from p_agreement_template_id) desc,
    po.created_at desc
  limit 1;
$$;

create or replace function public._apply_public_application_to_onboarding(p_organizer_response_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_response record;
  v_client record;
  v_onboarding_id uuid;
  v_po record;
begin
  select id, workspace_id, client_id, is_public_submission, status
  into v_response
  from public.organizer_responses
  where id = p_organizer_response_id;

  if v_response.id is null or v_response.is_public_submission is not true
     or v_response.status <> 'submitted' or v_response.client_id is null then
    return null;
  end if;

  select first_name, last_name, business_name, primary_email::text as email, primary_phone
  into v_client
  from public.clients
  where id = v_response.client_id;

  v_onboarding_id := public._match_open_partner_onboarding(v_response.workspace_id, v_client.email);
  if v_onboarding_id is null then
    return null;
  end if;

  update public.partner_onboardings
  set application_data = jsonb_build_object(
        'business_name', nullif(btrim(coalesce(v_client.business_name, '')), ''),
        'contact_name', nullif(btrim(coalesce(v_client.first_name, '') || ' ' || coalesce(v_client.last_name, '')), ''),
        'contact_email', nullif(btrim(coalesce(v_client.email, '')), ''),
        'contact_phone', nullif(btrim(coalesce(v_client.primary_phone, '')), ''),
        'notes', null,
        'source', 'public_organizer_link',
        'organizer_response_id', v_response.id
      ),
      application_submitted_at = now(),
      status = case when status = 'pending' then 'in_progress' else status end
  where id = v_onboarding_id
    and application_submitted_at is null
  returning id, workspace_id, firm_connection_id into v_po;

  if v_po.id is null then
    return null;
  end if;

  if not exists (
    select 1 from public.tasks
    where firm_connection_id = v_po.firm_connection_id
      and title = 'Review new partner application'
      and status in ('pending', 'in_progress', 'blocked')
  ) then
    insert into public.tasks (workspace_id, firm_connection_id, title, description, priority, assigned_staff_id, visibility)
    values (
      v_po.workspace_id, v_po.firm_connection_id,
      'Review new partner application',
      'A partner application was submitted and is ready for review once all onboarding requirements are complete.',
      'medium', public._resolve_onboarding_default_reviewer(v_po.workspace_id, v_po.firm_connection_id), 'internal'
    );
  end if;

  perform public._maybe_enter_review(v_po.id);
  return v_po.id;
end;
$$;

create or replace function public._apply_public_agreement_to_onboarding(
  p_workspace_id uuid,
  p_email text,
  p_template_id uuid,
  p_typed_name text,
  p_signature_image_path text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_onboarding_id uuid;
  v_po record;
begin
  v_onboarding_id := public._match_open_partner_onboarding(p_workspace_id, p_email, p_template_id);
  if v_onboarding_id is null then
    return null;
  end if;

  update public.partner_onboardings po
  set agreement_signed_at = now(),
      agreement_signer_name = public.resolve_firm_connection_identity(po.firm_connection_id)->>'name',
      agreement_typed_name = nullif(btrim(coalesce(p_typed_name, '')), ''),
      agreement_signature_image_path = nullif(btrim(coalesce(p_signature_image_path, '')), '')
  where po.id = v_onboarding_id
    and po.agreement_required
    and po.agreement_signed_at is null
    and not exists (
      select 1 from public.signature_requests sr
      where sr.id = po.agreement_signature_request_id and sr.status = 'completed'
    )
  returning po.id into v_po;

  if v_po.id is null then
    return null;
  end if;

  perform public._maybe_enter_review(v_po.id);
  return v_po.id;
end;
$$;

create or replace function public.trg_catch_up_onboarding_from_public_organizer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.is_public_submission is true and new.status = 'submitted' then
    begin
      perform public._apply_public_application_to_onboarding(new.id);
    exception when others then
      raise warning 'onboarding catch-up (organizer response %) failed: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

create or replace function public.trg_catch_up_onboarding_from_public_agreement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  begin
    perform public._apply_public_agreement_to_onboarding(
      new.workspace_id, new.signer_email, new.engagement_letter_template_id,
      new.typed_name, new.signature_image_path
    );
  exception when others then
    raise warning 'onboarding catch-up (agreement signature %) failed: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public._match_open_partner_onboarding(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public._apply_public_application_to_onboarding(uuid) from public, anon, authenticated;
revoke all on function public._apply_public_agreement_to_onboarding(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.trg_catch_up_onboarding_from_public_organizer() from public, anon, authenticated;
revoke all on function public.trg_catch_up_onboarding_from_public_agreement() from public, anon, authenticated;

do $do_block$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_catch_up_onboarding_from_public_organizer' and not tgisinternal) then
    create trigger trg_catch_up_onboarding_from_public_organizer
      after insert on public.organizer_responses
      for each row execute function public.trg_catch_up_onboarding_from_public_organizer();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_catch_up_onboarding_from_public_agreement' and not tgisinternal) then
    create trigger trg_catch_up_onboarding_from_public_agreement
      after insert on public.engagement_letter_public_signatures
      for each row execute function public.trg_catch_up_onboarding_from_public_agreement();
  end if;
end;
$do_block$;
