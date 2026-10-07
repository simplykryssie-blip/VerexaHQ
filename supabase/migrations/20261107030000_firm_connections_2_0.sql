-- Firm Connections 2.0 -- platform-level capability, not a Doucet/MKB/Tax
-- Avenue Pro special case.
--
-- A Firm Connection represents an organizational relationship that may or
-- may not have a real Verexa workspace behind it yet (child_workspace_id
-- null = external/manual identity via manual_*; non-null = workspace-backed
-- identity). Nothing downstream (automation, communications, public
-- onboarding) may assume child_workspace_id is set -- that assumption was
-- the root cause of every bug found this session (recipient resolution,
-- and the deeper one this migration actually fixes: a partner's real
-- self-service application/agreement submission had nowhere connection-
-- scoped to land, so it got attached to an unrelated client record
-- instead and the automation chain never advanced).
--
-- This migration adds:
-- 1. resolve_firm_connection_identity -- the single centralized identity
--    resolver (workspace-backed vs external), so every caller (automation,
--    communications, public onboarding) consumes one implementation. Pure
--    internal helper -- no client-facing grants (see note at its GRANT).
-- 2. A connection-scoped public onboarding mechanism: partner_onboardings
--    gets its own cryptographically-random public_token (distinct from the
--    row's id, so a leaked id alone can't be used as a token), and three
--    SECURITY DEFINER RPCs scoped strictly to that token -- no login, no
--    client identity, no shared template token.
-- 3. Generic {{partner_application_link}}/{{partner_agreement_link}} merge
--    fields in execute_automation_step, resolved from the run's own
--    connection_id -- never hardcoded to any one workspace's links.
-- 4. execute_automation_step's send_email/send_sms recipient resolution now
--    calls the centralized resolver instead of duplicating the coalesce.
-- 5. link_firm_connection_to_workspace -- the A-to-B lifecycle transition:
--    attaches a real child workspace to an existing external connection
--    without creating a duplicate connection, preserving all history.
--
-- Deliberately NOT built: a parallel onboarding table, a new form-builder,
-- or a new e-signature pipeline. The agreement step reuses the same light
-- public-signature pattern already proven by engagement_letter_templates'
-- public link (render template -> capture typed+drawn signature -> store);
-- the application step is a small fixed structured-data capture (business
-- name/contact/notes) rather than a dynamic field builder, which was the
-- single biggest scope multiplier available and isn't needed to fix the
-- actual defect. Both are additive and don't touch the existing
-- authenticated partner-dashboard flow (app/(app)/partner-dashboard/onboarding),
-- which keeps working exactly as before for workspace-backed connections.
--
-- Verified end-to-end against a synthetic external Firm Connection on the
-- TEST project before being applied to production: external identity
-- resolution, application submission (status transition + review task
-- creation), agreement signing (incl. double-sign rejection), unknown/wrong
-- token rejection, the external-to-workspace-backed transition (incl.
-- duplicate-connection and cross-workspace rejection), and the grant
-- hardening below. Also exercised against real production data (Krystal
-- Esters' Tax Avenue Pro purchase), whose automation run had been stuck for
-- days on a workspace-specific wait condition that could never resolve for
-- a connection with no client attached -- see the companion migration
-- 20261107040000 for that evaluator fix.

-- ============================================================
-- 1. Schema additions (all additive, all nullable or defaulted)
-- ============================================================

alter table public.partner_onboardings
  add column public_token uuid not null default gen_random_uuid() unique,
  add column agreement_signed_at timestamptz,
  add column agreement_signer_name text,
  add column agreement_typed_name text,
  add column agreement_signature_image_path text;

comment on column public.partner_onboardings.public_token is
  'Cryptographically random token for the connection-scoped public onboarding link -- distinct from id, so a leaked onboarding id alone is never enough to access or act on this record.';
comment on column public.partner_onboardings.agreement_signed_at is
  'Set by sign_public_partner_onboarding_agreement for the lightweight public-link signing path. Independent of agreement_signature_request_id (the heavier attachment-based e-sign pipeline used by the authenticated partner-dashboard flow) -- get_my_partner_onboarding and the automation condition evaluator both treat either as "signed".';

alter table public.firm_packages
  add column agreement_template_id uuid references public.engagement_letter_templates(id);

comment on column public.firm_packages.agreement_template_id is
  'Which engagement_letter_template, if any, a partner_onboarding created from this package should present for signature on the public onboarding link. Null means no agreement template is configured yet -- the public page omits the agreement step rather than erroring.';

-- ============================================================
-- 2. Centralized Firm Connection identity resolution
-- ============================================================

create or replace function public.resolve_firm_connection_identity(p_connection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'name', coalesce(w.name, fc.manual_name),
    'owner_name', coalesce(fc.manual_owner_name, w.name),
    'email', coalesce(w.primary_contact_email, fc.manual_email),
    'phone', coalesce(w.phone, fc.manual_phone),
    'is_workspace_backed', fc.child_workspace_id is not null
  )
  into v_result
  from public.firm_connections fc
  left join public.workspaces w on w.id = fc.child_workspace_id
  where fc.id = p_connection_id;

  return v_result;
end;
$$;

comment on function public.resolve_firm_connection_identity(uuid) is
  'The single place that decides a Firm Connection''s identity (name/email/phone), regardless of whether it is workspace-backed (child_workspace_id set) or external/manual. Every caller that needs to contact or display a connected firm should call this instead of re-deriving coalesce(workspace, manual_*) logic independently.';

-- Pure internal helper (called only from other SECURITY DEFINER functions
-- below and from execute_automation_step) with no authorization check of
-- its own -- it must never be directly callable by anon/authenticated, or
-- any caller could pass an arbitrary connection_id and read another
-- workspace's connection name/email/phone. This project auto-grants EXECUTE
-- to PUBLIC and to anon/authenticated by default on function creation
-- (confirmed by comparing against already-hardened internal functions like
-- _maybe_enter_review, which have neither); all three are revoked here
-- rather than granted to anything.
revoke execute on function public.resolve_firm_connection_identity(uuid) from public, anon, authenticated;

-- ============================================================
-- 3. Connection-scoped public onboarding (no login required)
-- ============================================================

create or replace function public.get_public_partner_onboarding(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_onboarding record;
  v_identity jsonb;
  v_workspace_name text;
  v_branding record;
  v_agreement record;
  v_agreement_signed boolean;
  v_result jsonb;
begin
  select po.id, po.workspace_id, po.firm_connection_id, po.status, po.agreement_required, po.documents_required,
         po.application_submitted_at, po.application_data, po.agreement_signed_at, po.agreement_signature_request_id,
         po.rejected_reason, po.review_note, fp.agreement_template_id
  into v_onboarding
  from public.partner_onboardings po
  left join public.firm_packages fp on fp.id = po.package_id
  where po.public_token = p_token;

  if v_onboarding.id is null then
    return null;
  end if;

  v_identity := public.resolve_firm_connection_identity(v_onboarding.firm_connection_id);

  select name into v_workspace_name from public.workspaces where id = v_onboarding.workspace_id;

  select portal_logo_url, sidebar_logo_url, primary_color, secondary_color
  into v_branding
  from public.branding where workspace_id = v_onboarding.workspace_id;

  v_agreement_signed := v_onboarding.agreement_signed_at is not null or exists (
    select 1 from public.signature_requests sr
    where sr.id = v_onboarding.agreement_signature_request_id and sr.status = 'completed'
  );

  -- Guaranteed to assign v_agreement exactly once via the LEFT JOIN against
  -- a one-row source, even when no template applies (plpgsql record
  -- variables that are never assigned via SELECT INTO have no column
  -- structure yet, so later referencing v_agreement.body_html would raise
  -- "record is not assigned yet" instead of evaluating to null).
  select elt.name, elt.body_html, elt.banner_image_url, elt.custom_css
  into v_agreement
  from (select 1) as _one
  left join public.engagement_letter_templates elt
    on elt.id = v_onboarding.agreement_template_id
    and v_onboarding.agreement_required
    and not v_agreement_signed;

  v_result := jsonb_build_object(
    'id', v_onboarding.id,
    'status', v_onboarding.status,
    'connection_name', v_identity->>'name',
    'workspace_name', v_workspace_name,
    'branding', jsonb_build_object(
      'logo_url', coalesce(v_branding.portal_logo_url, v_branding.sidebar_logo_url),
      'primary_color', v_branding.primary_color,
      'secondary_color', v_branding.secondary_color
    ),
    'agreement_required', v_onboarding.agreement_required,
    'agreement_signed', v_agreement_signed,
    'agreement_template', case when v_agreement.body_html is not null then jsonb_build_object(
      'name', v_agreement.name, 'body_html', v_agreement.body_html,
      'banner_image_url', v_agreement.banner_image_url, 'custom_css', v_agreement.custom_css
    ) else null end,
    'documents_required', v_onboarding.documents_required,
    'application_submitted_at', v_onboarding.application_submitted_at,
    'application_data', v_onboarding.application_data,
    'rejected_reason', v_onboarding.rejected_reason,
    'review_note', v_onboarding.review_note
  );

  return v_result;
end;
$$;

comment on function public.get_public_partner_onboarding(uuid) is
  'Public read for the connection-scoped onboarding link. Scoped strictly by partner_onboardings.public_token -- never by id, never by client identity, never by a shared template token. Returns null for an unknown token rather than distinguishing "wrong token" from "not found", so a token can never be used to probe which ids exist.';

grant execute on function public.get_public_partner_onboarding(uuid) to anon, authenticated;

create or replace function public.submit_public_partner_onboarding_application(
  p_token uuid,
  p_business_name text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_onboarding record;
begin
  select id, status, workspace_id, firm_connection_id into v_onboarding from public.partner_onboardings where public_token = p_token;

  if v_onboarding.id is null then
    raise exception 'This link is no longer available';
  end if;

  if v_onboarding.status in ('rejected', 'withdrawn') then
    raise exception 'This onboarding is closed';
  end if;

  if nullif(btrim(coalesce(p_contact_email, '')), '') is null then
    raise exception 'Contact email is required';
  end if;

  -- Resubmission (e.g. fixing a typo) is allowed and overwrites the
  -- captured answers, but the submitted-at timestamp and the pending ->
  -- in_progress transition only ever happen once -- re-editing doesn't
  -- re-fire the "Application Submitted" automation a second time.
  update public.partner_onboardings
  set application_data = jsonb_build_object(
        'business_name', nullif(btrim(coalesce(p_business_name, '')), ''),
        'contact_name', nullif(btrim(coalesce(p_contact_name, '')), ''),
        'contact_email', nullif(btrim(coalesce(p_contact_email, '')), ''),
        'contact_phone', nullif(btrim(coalesce(p_contact_phone, '')), ''),
        'notes', nullif(btrim(coalesce(p_notes, '')), '')
      ),
      application_submitted_at = coalesce(application_submitted_at, now()),
      status = case when status = 'pending' then 'in_progress' else status end
  where id = v_onboarding.id;

  -- Mirrors the authenticated submit_partner_onboarding_application exactly
  -- (task creation + _maybe_enter_review) so staff get the same "Review new
  -- partner application" task and review-entry behavior regardless of
  -- whether the partner applied through the authenticated dashboard or this
  -- public, connection-scoped link.
  if not exists (
    select 1 from public.tasks
    where firm_connection_id = v_onboarding.firm_connection_id
      and title = 'Review new partner application'
      and status in ('pending', 'in_progress', 'blocked')
  ) then
    insert into public.tasks (workspace_id, firm_connection_id, title, description, priority, assigned_staff_id, visibility)
    values (
      v_onboarding.workspace_id, v_onboarding.firm_connection_id,
      'Review new partner application',
      'A partner application was submitted and is ready for review once all onboarding requirements are complete.',
      'medium', public._resolve_onboarding_default_reviewer(v_onboarding.workspace_id, v_onboarding.firm_connection_id), 'internal'
    );
  end if;

  perform public._maybe_enter_review(v_onboarding.id);

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.submit_public_partner_onboarding_application(uuid, text, text, text, text, text) is
  'Writes directly to the specific partner_onboardings row identified by public_token, and advances status pending -> in_progress exactly once -- the existing trg_fire_partner_onboarding_status_changed_automations trigger fires whatever automation a workspace has configured for that transition. Never touches a client or lead record. Mirrors submit_partner_onboarding_application''s task-creation and _maybe_enter_review behavior so the authenticated and public paths stay consistent.';

grant execute on function public.submit_public_partner_onboarding_application(uuid, text, text, text, text, text) to anon, authenticated;

create or replace function public.sign_public_partner_onboarding_agreement(
  p_token uuid,
  p_typed_name text,
  p_signature_image_path text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_onboarding record;
  v_identity jsonb;
begin
  select po.id, po.status, po.agreement_required, po.agreement_signed_at, po.agreement_signature_request_id, po.firm_connection_id
  into v_onboarding
  from public.partner_onboardings po
  where po.public_token = p_token;

  if v_onboarding.id is null then
    raise exception 'This link is no longer available';
  end if;

  if not v_onboarding.agreement_required then
    raise exception 'No agreement is required for this onboarding';
  end if;

  if v_onboarding.agreement_signed_at is not null
     or exists (select 1 from public.signature_requests sr where sr.id = v_onboarding.agreement_signature_request_id and sr.status = 'completed') then
    raise exception 'This agreement has already been signed';
  end if;

  if nullif(btrim(coalesce(p_typed_name, '')), '') is null then
    raise exception 'A typed signature is required';
  end if;
  if nullif(btrim(coalesce(p_signature_image_path, '')), '') is null then
    raise exception 'A drawn signature is required';
  end if;

  v_identity := public.resolve_firm_connection_identity(v_onboarding.firm_connection_id);

  update public.partner_onboardings
  set agreement_signed_at = now(),
      agreement_signer_name = v_identity->>'name',
      agreement_typed_name = btrim(p_typed_name),
      agreement_signature_image_path = p_signature_image_path
  where id = v_onboarding.id;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.sign_public_partner_onboarding_agreement(uuid, text, text) is
  'Records the connection-scoped agreement signature directly on partner_onboardings, scoped strictly by public_token. Independent of the heavier signature_requests/signature_request_signers pipeline the authenticated partner-dashboard flow uses -- get_my_partner_onboarding, get_public_partner_onboarding, and the automation condition evaluator all treat either mechanism as "signed".';

grant execute on function public.sign_public_partner_onboarding_agreement(uuid, text, text) to anon, authenticated;

-- get_my_partner_onboarding's agreement_signed must also recognize the new
-- public-link signing path, so a connection that later gets a real
-- workspace (section 4 below) sees a consistent checklist regardless of
-- which path the agreement was actually signed through. Purely additive --
-- an already-true case from the old mechanism is never flipped false; this
-- only adds a second, OR'd way to become true.
create or replace function public.get_my_partner_onboarding(p_workspace_id uuid)
returns table(id uuid, status text, agreement_required boolean, documents_required boolean, training_required boolean, bank_software_setup_required boolean, application_submitted_at timestamp with time zone, agreement_signed boolean, documents_completed boolean, training_completed_at timestamp with time zone, bank_software_setup_completed_at timestamp with time zone, review_note text, rejected_reason text, created_at timestamp with time zone, completed_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  return query
  select
    po.id, po.status,
    po.agreement_required, po.documents_required, po.training_required, po.bank_software_setup_required,
    po.application_submitted_at,
    po.agreement_signed_at is not null
      or exists (select 1 from public.signature_requests sr where sr.id = po.agreement_signature_request_id and sr.status = 'completed'),
    exists (select 1 from public.document_requests dr where dr.id = po.document_request_id and dr.status = 'completed'),
    po.training_completed_at, po.bank_software_setup_completed_at,
    po.review_note, po.rejected_reason, po.created_at, po.completed_at
  from public.partner_onboardings po
  join public.firm_connections fc on fc.id = po.firm_connection_id
  where fc.child_workspace_id = p_workspace_id
  order by po.created_at desc
  limit 1;
end;
$$;

-- ============================================================
-- 4. External -> workspace-backed connection transition
-- ============================================================

create or replace function public.link_firm_connection_to_workspace(p_connection_id uuid, p_child_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_connection record;
begin
  select id, parent_workspace_id, child_workspace_id into v_connection
  from public.firm_connections where id = p_connection_id;

  if v_connection.id is null then
    raise exception 'Firm connection not found';
  end if;

  if not (
    public.has_permission(v_connection.parent_workspace_id, 'firm_connections.manage')
    or public.is_platform_admin()
    or public.is_platform_it()
  ) then
    raise exception 'insufficient permissions to link this firm connection';
  end if;

  if v_connection.child_workspace_id is not null then
    raise exception 'This firm connection is already linked to a workspace';
  end if;

  if exists (select 1 from public.firm_connections where child_workspace_id = p_child_workspace_id and id <> p_connection_id) then
    raise exception 'That workspace is already linked to a different firm connection';
  end if;

  update public.firm_connections
  set child_workspace_id = p_child_workspace_id, updated_at = now()
  where id = p_connection_id;

  return jsonb_build_object('ok', true, 'connection_id', p_connection_id, 'child_workspace_id', p_child_workspace_id);
end;
$$;

comment on function public.link_firm_connection_to_workspace(uuid, uuid) is
  'The external-to-workspace-backed lifecycle transition: attaches a real child workspace to an existing external/manual Firm Connection in place -- preserves the connection id, package/purchase history, onboarding history, and automation history. Refuses to run if the connection already has a child workspace, or if the target workspace is already linked elsewhere, so this can never produce a duplicate connection.';

-- Staff-facing with its own permission check inside; close the default
-- PUBLIC+anon grant and keep only authenticated (matching the intent:
-- authenticated + permission-gated, never anon-callable).
revoke execute on function public.link_firm_connection_to_workspace(uuid, uuid) from public, anon;
grant execute on function public.link_firm_connection_to_workspace(uuid, uuid) to authenticated;

-- ============================================================
-- 5. Patch execute_automation_step: generic merge-field links +
--    centralized recipient resolution. Transforms the LIVE function body
--    rather than retyping it, so every other line stays byte-identical to
--    what's already deployed.
-- ============================================================

do $do_block$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.execute_automation_step(uuid,uuid)'::regprocedure) into v_def;
  v_new := v_def;

  -- 5a. New declarations for the generic partner link merge fields.
  v_new := replace(
    v_new,
    E'  v_partner_phone text;\nbegin',
    E'  v_partner_phone text;\n  v_partner_application_link text;\n  v_partner_agreement_link text;\nbegin'
  );

  -- 5b. Resolve the generic links once per run, right alongside the other
  -- always-available merge fields (office_phone, portal_link, etc.) --
  -- available to every action type, not just send_email/send_sms, same as
  -- those other fields.
  v_new := replace(
    v_new,
    E'    ''portal_link'', ''https://verexahq.com/portal/login''\n  );\n',
    E'    ''portal_link'', ''https://verexahq.com/portal/login''\n  );\n\n' ||
    E'  if v_connection_id is not null then\n' ||
    E'    select\n' ||
    E'      ''https://'' || coalesce(nullif(v_branding.custom_domain, ''''), ''verexahq.com'') || ''/partner-apply/'' || po.public_token::text,\n' ||
    E'      case when po.agreement_signed_at is null and po.agreement_required\n' ||
    E'        then ''https://'' || coalesce(nullif(v_branding.custom_domain, ''''), ''verexahq.com'') || ''/partner-apply/'' || po.public_token::text || ''#agreement''\n' ||
    E'        else null\n' ||
    E'      end\n' ||
    E'    into v_partner_application_link, v_partner_agreement_link\n' ||
    E'    from public.partner_onboardings po\n' ||
    E'    where po.firm_connection_id = v_connection_id\n' ||
    E'    order by po.created_at desc\n' ||
    E'    limit 1;\n\n' ||
    E'    v_context := v_context || jsonb_build_object(\n' ||
    E'      ''partner_application_link'', v_partner_application_link,\n' ||
    E'      ''partner_agreement_link'', v_partner_agreement_link\n' ||
    E'    );\n' ||
    E'  end if;\n'
  );

  -- 5c. send_email recipient resolution now goes through the centralized resolver.
  v_new := replace(
    v_new,
    E'          select coalesce(w.primary_contact_email, fc.manual_email)::text into v_partner_email\n' ||
    E'          from public.firm_connections fc\n' ||
    E'          left join public.workspaces w on w.id = fc.child_workspace_id\n' ||
    E'          where fc.id = v_connection_id;\n',
    E'          select (public.resolve_firm_connection_identity(v_connection_id)->>''email'') into v_partner_email;\n'
  );

  -- 5d. send_sms recipient resolution, same centralization.
  v_new := replace(
    v_new,
    E'          select coalesce(w.phone, fc.manual_phone) into v_partner_phone\n' ||
    E'          from public.firm_connections fc\n' ||
    E'          left join public.workspaces w on w.id = fc.child_workspace_id\n' ||
    E'          where fc.id = v_connection_id;\n',
    E'          select (public.resolve_firm_connection_identity(v_connection_id)->>''phone'') into v_partner_phone;\n'
  );

  if v_new = v_def then
    raise exception 'no change applied to execute_automation_step';
  end if;
  if v_new !~ 'partner_application_link' or v_new !~ 'resolve_firm_connection_identity' then
    raise exception 'expected substitutions missing after patch';
  end if;
  -- Exactly 4 independent substitutions above; if any one's anchor failed
  -- to match, replace() is a silent no-op for that call only -- the
  -- declare-block and v_context edits are each distinguishable by the
  -- substring checks above, and the two coalesce replacements are checked
  -- here by confirming the old literal text is now gone entirely.
  if v_new ~ 'coalesce\(w\.primary_contact_email, fc\.manual_email\)' then
    raise exception 'send_email coalesce replacement did not apply';
  end if;
  if v_new ~ 'coalesce\(w\.phone, fc\.manual_phone\)' then
    raise exception 'send_sms coalesce replacement did not apply';
  end if;

  execute v_new;
end;
$do_block$;
