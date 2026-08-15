-- Combine Organizers and Engagement Letters into one template type: a
-- Cognito Forms-style flow where a client reads terms (rich_text blocks,
-- merge-field driven exactly like engagement_letter_templates.body_html),
-- answers intake questions, and signs -- all in one linear document.
--
-- Verified before writing this: 'signature' was already a real, wired-up
-- field_type (builder palette entry in lib/organizer/fieldTypes.ts, and
-- rendered in components/organizer/PublicFieldInput) -- it just captured a
-- typed name as a plain answer value with no compliance-grade signed
-- record. The one real schema gap was static rich-text content; this
-- migration adds it and upgrades 'signature' answers to produce a real
-- signature_requests/signature_request_signers record.
--
-- Existing organizer_templates/engagement_letter_templates data, and every
-- page that reads them today, are untouched -- this is additive only.

-- 1. New field type: static rich-text content (legal/explanatory prose),
-- interleaved with input fields and page breaks the same way engagement
-- letters already interleave body_html with merge fields.
alter table public.organizer_fields drop constraint organizer_fields_field_type_check;
alter table public.organizer_fields add constraint organizer_fields_field_type_check
  check (field_type = any (array[
    'short_text','paragraph','number','currency','date','dropdown','checkbox',
    'radio_button','multiple_choice','address','ssn','ein','file_upload',
    'signature','repeating_section','page_break','rich_text'
  ]));

alter table public.organizer_fields add column body_html text;

-- 2. Consolidate signature capture onto signature_requests /
-- signature_request_signers (the more general of the two existing systems)
-- instead of adding a second use of engagement_letter_public_signatures.
--
-- attachment_id was NOT NULL because every existing signature_requests row
-- originates from an already-uploaded/generated file (see
-- lib/documents/createSignatureRequestFromTemplate.ts). A combined-template
-- signature has no such file at sign time -- the resolved HTML snapshot
-- *is* the record -- so attachment_id becomes optional. Existing rows are
-- unaffected; nothing that currently sets it stops setting it.
alter table public.signature_requests alter column attachment_id drop not null;

-- Mirrors engagement_letter_public_signatures.resolved_body_html -- the
-- exact resolved document text at the moment of signing, per signer, so
-- there's proof of exactly what was agreed to even if the template is
-- edited afterward.
alter table public.signature_request_signers add column resolved_document_html text;

-- Parallel to the existing engagement_letter_template_id link (added in
-- 20260812200000), so a signature_requests row arising from a combined
-- organizer template is traceable back to it.
alter table public.signature_requests
  add column organizer_template_id uuid references public.organizer_templates(id) on delete set null;
create index signature_requests_organizer_template_id_idx
  on public.signature_requests(organizer_template_id) where organizer_template_id is not null;

-- Lets a response point at the signature it produced, if any.
alter table public.organizer_responses
  add column signature_request_id uuid references public.signature_requests(id) on delete set null;
create index organizer_responses_signature_request_id_idx
  on public.organizer_responses(signature_request_id) where signature_request_id is not null;

-- 3. Small helpers for building the resolved snapshot.

create or replace function public.escape_html(p_text text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(replace(replace(
    coalesce(p_text, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

-- Mirrors displayValue() in app/api/documents/file-organizer-response/route.ts
-- (same ssn/ein masking -- a signed record is still not a way to read a
-- sensitive value in cleartext outside reveal_organizer_answer()'s
-- permission gate and audit log).
create or replace function public.format_organizer_answer(p_field_type text, p_value jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_text text;
  v_digits text;
begin
  if p_value is null then
    return '--';
  end if;

  if p_field_type in ('ssn', 'ein') then
    v_digits := regexp_replace(coalesce(p_value #>> '{}', ''), '\D', '', 'g');
    if length(v_digits) >= 4 then
      return '••••' || right(v_digits, 4);
    end if;
    return 'on file';
  end if;

  if jsonb_typeof(p_value) = 'string' then
    v_text := p_value #>> '{}';
  else
    v_text := p_value::text;
  end if;

  return nullif(v_text, '');
end;
$$;

-- Builds the resolved snapshot and, only when the template actually has a
-- signed signature field, creates the signature_requests/_signers record.
-- Internal helper only (see revoke below) -- called from
-- submit_public_organizer_response{,_with_signup} with values those
-- functions already validated (token -> template/workspace, submitted
-- answers), never with caller-supplied ids directly.
create or replace function public.resolve_and_sign_organizer_response(
  p_response_id uuid,
  p_workspace_id uuid,
  p_template_id uuid,
  p_client_name text,
  p_client_email text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_signature_answer jsonb;
  v_typed_name text;
  v_signed_at timestamptz;
  v_firm_name text;
  v_firm_address text;
  v_firm_phone text;
  v_template_name text;
  v_html text := '';
  v_field record;
  v_answer_value jsonb;
  v_max_instance int;
  v_i int;
  v_child record;
  v_request_id uuid;
begin
  select a.value into v_signature_answer
  from public.organizer_fields f
  join public.organizer_response_answers a
    on a.organizer_field_id = f.id and a.organizer_response_id = p_response_id
  where f.organizer_template_id = p_template_id and f.field_type = 'signature'
  limit 1;

  if v_signature_answer is null or nullif(btrim(coalesce(v_signature_answer->>'typed_name', '')), '') is null then
    return null;
  end if;

  v_typed_name := btrim(v_signature_answer->>'typed_name');
  v_signed_at := coalesce((v_signature_answer->>'signed_at')::timestamptz, now());

  select ot.name into v_template_name from public.organizer_templates ot where ot.id = p_template_id;
  select w.name, public.format_mailing_address(w.mailing_address), w.phone
    into v_firm_name, v_firm_address, v_firm_phone
    from public.workspaces w where w.id = p_workspace_id;

  for v_field in
    select f.id, f.field_type, f.label, f.body_html
    from public.organizer_fields f
    where f.organizer_template_id = p_template_id and f.parent_field_id is null
    order by f.display_order
  loop
    if v_field.field_type = 'page_break' then
      continue;

    elsif v_field.field_type = 'rich_text' then
      v_html := v_html || public.render_engagement_letter_merge_fields(
        coalesce(v_field.body_html, ''), p_client_name, v_firm_name, v_firm_address, v_firm_phone
      );

    elsif v_field.field_type = 'signature' then
      v_html := v_html || '<p><strong>Signed by:</strong> ' || public.escape_html(v_typed_name)
        || ' on ' || to_char(v_signed_at, 'FMMonth FMDD, YYYY') || '</p>';

    elsif v_field.field_type = 'repeating_section' then
      select coalesce(max(a.instance_index), -1) into v_max_instance
      from public.organizer_response_answers a
      join public.organizer_fields cf on cf.id = a.organizer_field_id
      where cf.parent_field_id = v_field.id and a.organizer_response_id = p_response_id;

      if v_max_instance >= 0 then
        v_html := v_html || '<p><strong>' || public.escape_html(v_field.label) || '</strong></p>';
        for v_i in 0..v_max_instance loop
          v_html := v_html || '<ul>';
          for v_child in
            select cf.id, cf.label, cf.field_type
            from public.organizer_fields cf
            where cf.parent_field_id = v_field.id
            order by cf.display_order
          loop
            select a.value into v_answer_value
            from public.organizer_response_answers a
            where a.organizer_field_id = v_child.id and a.organizer_response_id = p_response_id and a.instance_index = v_i;

            v_html := v_html || '<li>' || public.escape_html(v_child.label) || ': '
              || public.escape_html(coalesce(public.format_organizer_answer(v_child.field_type, v_answer_value), '--')) || '</li>';
          end loop;
          v_html := v_html || '</ul>';
        end loop;
      end if;

    else
      select a.value into v_answer_value
      from public.organizer_response_answers a
      where a.organizer_field_id = v_field.id and a.organizer_response_id = p_response_id
      limit 1;

      v_html := v_html || '<p><strong>' || public.escape_html(v_field.label) || ':</strong> '
        || public.escape_html(coalesce(public.format_organizer_answer(v_field.field_type, v_answer_value), '--')) || '</p>';
    end if;
  end loop;

  insert into public.signature_requests (workspace_id, attachment_id, organizer_template_id, title, status)
  values (p_workspace_id, null, p_template_id, coalesce(v_template_name, 'Signed document'), 'completed')
  returning id into v_request_id;

  insert into public.signature_request_signers (
    signature_request_id, signer_name, signer_email, sign_order, status,
    signature_type, typed_name, signed_at, resolved_document_html
  ) values (
    v_request_id, p_client_name, nullif(btrim(coalesce(p_client_email, '')), ''), 1, 'signed',
    'typed', v_typed_name, v_signed_at, v_html
  );

  update public.organizer_responses set signature_request_id = v_request_id where id = p_response_id;

  return v_request_id;
end;
$$;

-- Internal helper only -- not meant to be callable directly via PostgREST
-- with arbitrary ids (it trusts p_workspace_id/p_template_id as already
-- validated by its caller). The two functions below still reach it fine:
-- SECURITY DEFINER functions execute as their owner, so this revoke only
-- blocks *direct* external RPC calls, not calls from within another
-- SECURITY DEFINER function.
revoke execute on function public.resolve_and_sign_organizer_response(uuid, uuid, uuid, text, text) from public, anon, authenticated;

-- 4. Wire it into the public organizer flow.

create or replace function public.get_public_organizer_template(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_template record;
  v_result jsonb;
begin
  select ot.id, ot.name, ot.description, ot.workspace_id, ot.requires_portal_signup, w.name as workspace_name
  into v_template
  from public.organizer_templates ot
  join public.workspaces w on w.id = ot.workspace_id
  where ot.public_token = p_token and ot.is_public = true and ot.status = 'published';

  if v_template.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'template', jsonb_build_object('id', v_template.id, 'name', v_template.name, 'description', v_template.description),
    'workspace_name', v_template.workspace_name,
    'requires_portal_signup', v_template.requires_portal_signup,
    'branding', (
      select jsonb_build_object(
        'logo_url', coalesce(b.portal_logo_url, b.sidebar_logo_url),
        'primary_color', b.primary_color,
        'secondary_color', b.secondary_color,
        'support_email', b.support_email,
        'support_phone', b.support_phone
      )
      from public.branding b
      where b.workspace_id = v_template.workspace_id
    ),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'field_type', f.field_type, 'label', f.label, 'help_text', f.help_text,
        'display_order', f.display_order, 'is_required', f.is_required, 'options', f.options,
        'parent_field_id', f.parent_field_id, 'conditional_logic', f.conditional_logic,
        'body_html', f.body_html
      ) order by f.display_order)
      from public.organizer_fields f
      where f.organizer_template_id = v_template.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.submit_public_organizer_response(p_token uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_template_id uuid;
  v_client_id uuid;
  v_client_name text;
  v_response_id uuid;
  v_answer jsonb;
  v_signature_request_id uuid;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;

  select id, workspace_id into v_template_id, v_workspace_id
  from public.organizer_templates
  where public_token = p_token and is_public = true and status = 'published';

  if v_template_id is null then
    raise exception 'This link is no longer available';
  end if;

  v_client_id := public.find_or_create_public_lead(v_workspace_id, p_first_name, p_last_name, p_email, p_phone);
  v_client_name := btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));

  insert into public.organizer_responses (workspace_id, client_id, organizer_template_id, status, submitted_at, is_public_submission)
  values (v_workspace_id, v_client_id, v_template_id, 'submitted', now(), true)
  returning id into v_response_id;

  for v_answer in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    insert into public.organizer_response_answers (organizer_response_id, organizer_field_id, value, instance_index)
    select v_response_id, (v_answer->>'field_id')::uuid, v_answer->'value', coalesce((v_answer->>'instance_index')::int, 0)
    where exists (
      select 1 from public.organizer_fields f where f.id = (v_answer->>'field_id')::uuid and f.organizer_template_id = v_template_id
    );
  end loop;

  perform public.resolve_organizer_response_service(v_response_id);
  v_signature_request_id := public.resolve_and_sign_organizer_response(v_response_id, v_workspace_id, v_template_id, v_client_name, p_email);

  return jsonb_build_object('ok', true, 'client_id', v_client_id, 'response_id', v_response_id, 'signature_request_id', v_signature_request_id);
end;
$$;

create or replace function public.submit_public_organizer_response_with_signup(p_token uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_answers jsonb, p_auth_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_template_id uuid;
  v_requires_signup boolean;
  v_client_id uuid;
  v_client_name text;
  v_response_id uuid;
  v_answer jsonb;
  v_signature_request_id uuid;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;
  if p_auth_user_id is null then
    raise exception 'A portal account is required for this link';
  end if;

  select id, workspace_id, requires_portal_signup into v_template_id, v_workspace_id, v_requires_signup
  from public.organizer_templates
  where public_token = p_token and is_public = true and status = 'published';

  if v_template_id is null then
    raise exception 'This link is no longer available';
  end if;
  if not v_requires_signup then
    raise exception 'This organizer does not use portal signup';
  end if;

  v_client_id := public.find_or_create_public_lead(v_workspace_id, p_first_name, p_last_name, p_email, p_phone);
  v_client_name := btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));

  insert into public.organizer_responses (workspace_id, client_id, organizer_template_id, status, submitted_at, is_public_submission)
  values (v_workspace_id, v_client_id, v_template_id, 'submitted', now(), true)
  returning id into v_response_id;

  for v_answer in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    insert into public.organizer_response_answers (organizer_response_id, organizer_field_id, value, instance_index)
    select v_response_id, (v_answer->>'field_id')::uuid, v_answer->'value', coalesce((v_answer->>'instance_index')::int, 0)
    where exists (
      select 1 from public.organizer_fields f where f.id = (v_answer->>'field_id')::uuid and f.organizer_template_id = v_template_id
    );
  end loop;

  perform public.resolve_organizer_response_service(v_response_id);
  perform public.link_public_portal_account(v_workspace_id, v_client_id, p_auth_user_id, p_email, btrim(coalesce(p_first_name,'') || ' ' || coalesce(p_last_name,'')));
  v_signature_request_id := public.resolve_and_sign_organizer_response(v_response_id, v_workspace_id, v_template_id, v_client_name, p_email);

  return jsonb_build_object('ok', true, 'client_id', v_client_id, 'response_id', v_response_id, 'signature_request_id', v_signature_request_id);
end;
$$;
