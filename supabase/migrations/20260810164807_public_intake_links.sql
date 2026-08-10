-- Public, reusable per-template links for organizer and engagement-letter
-- templates -- Tier 2 "public intake form" from the competitive assessment,
-- generalized to any organizer/engagement-letter template per user request.
-- Filling out an organizer, or signing an engagement letter, via one of
-- these links auto-creates a lead client (matched by email/phone the same
-- way create_client() already does) and attaches the response/signature to
-- it -- no existing client_id or portal session required.

alter table public.organizer_templates
  add column if not exists public_token uuid not null default gen_random_uuid(),
  add column if not exists is_public boolean not null default false;
alter table public.organizer_templates
  add constraint organizer_templates_public_token_key unique (public_token);

alter table public.engagement_letter_templates
  add column if not exists public_token uuid not null default gen_random_uuid(),
  add column if not exists is_public boolean not null default false;
alter table public.engagement_letter_templates
  add constraint engagement_letter_templates_public_token_key unique (public_token);

-- Internal helper for the public RPCs below. Never granted to anon/
-- authenticated directly -- only callable from within another SECURITY
-- DEFINER function that has already validated a public token, so a caller
-- can't invoke this with an arbitrary workspace_id.
create or replace function public.find_or_create_public_lead(
  p_workspace_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_normalized_email citext;
  v_normalized_phone text;
  v_client_id uuid;
begin
  v_normalized_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_normalized_phone := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');

  select id into v_client_id
  from public.clients
  where workspace_id = p_workspace_id
    and merged_into_client_id is null
    and (
      (v_normalized_email is not null and normalized_email = v_normalized_email)
      or (v_normalized_phone is not null and normalized_phone = v_normalized_phone)
    )
  limit 1;

  if v_client_id is not null then
    return v_client_id;
  end if;

  insert into public.clients (workspace_id, client_type, lifecycle_status, first_name, last_name, primary_email, primary_phone, normalized_email, normalized_phone)
  values (
    p_workspace_id, 'individual', 'lead',
    nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''),
    nullif(btrim(coalesce(p_email, '')), ''), nullif(btrim(coalesce(p_phone, '')), ''),
    v_normalized_email, v_normalized_phone
  )
  returning id into v_client_id;

  return v_client_id;
end;
$$;

revoke all on function public.find_or_create_public_lead(uuid, text, text, text, text) from public, anon, authenticated;

-- Organizer public intake -----------------------------------------------

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
  select ot.id, ot.name, ot.description, ot.workspace_id, w.name as workspace_name
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
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'field_type', f.field_type, 'label', f.label, 'help_text', f.help_text,
        'display_order', f.display_order, 'is_required', f.is_required, 'options', f.options,
        'parent_field_id', f.parent_field_id, 'conditional_logic', f.conditional_logic
      ) order by f.display_order)
      from public.organizer_fields f
      where f.organizer_template_id = v_template.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_public_organizer_template(uuid) to anon, authenticated;

create or replace function public.submit_public_organizer_response(
  p_token uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_template_id uuid;
  v_client_id uuid;
  v_response_id uuid;
  v_answer jsonb;
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

  insert into public.organizer_responses (workspace_id, client_id, organizer_template_id, status, submitted_at)
  values (v_workspace_id, v_client_id, v_template_id, 'submitted', now())
  returning id into v_response_id;

  for v_answer in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    insert into public.organizer_response_answers (organizer_response_id, organizer_field_id, value, instance_index)
    select v_response_id, (v_answer->>'field_id')::uuid, v_answer->'value', coalesce((v_answer->>'instance_index')::int, 0)
    where exists (
      select 1 from public.organizer_fields f where f.id = (v_answer->>'field_id')::uuid and f.organizer_template_id = v_template_id
    );
  end loop;

  return jsonb_build_object('ok', true, 'client_id', v_client_id);
end;
$$;

grant execute on function public.submit_public_organizer_response(uuid, text, text, text, text, jsonb) to anon, authenticated;

-- Engagement letter public signing ---------------------------------------

create table public.engagement_letter_public_signatures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  engagement_letter_template_id uuid not null references public.engagement_letter_templates(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  signer_name text not null,
  signer_email text not null,
  signer_phone text,
  resolved_body_html text not null,
  typed_name text not null,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.engagement_letter_public_signatures enable row level security;

create policy engagement_letter_public_signatures_select on public.engagement_letter_public_signatures
for select using (is_workspace_member(workspace_id));

create index engagement_letter_public_signatures_workspace_idx on public.engagement_letter_public_signatures(workspace_id);
create index engagement_letter_public_signatures_client_idx on public.engagement_letter_public_signatures(client_id);

-- Mirrors lib/templates/render.ts's {{token}} convention. Only the tokens
-- with a real value pre-engagement (client_name, firm_name, firm_address,
-- firm_phone -- the "auto" fields in lib/mergeFields.ts that don't depend on
-- an engagement/quote) are resolved; every other {{token}} is blanked, same
-- graceful-degradation behavior as the TS renderer. This is also the
-- authoritative resolution: the browser renders its own preview with the
-- same rules for display, but what actually gets stored as the signed
-- record is always re-resolved here, server-side, so a tampered client
-- payload can't change what was legally signed.
create or replace function public.render_engagement_letter_merge_fields(
  p_body text,
  p_client_name text,
  p_firm_name text,
  p_firm_address text,
  p_firm_phone text
)
returns text
language sql
immutable
as $$
  select regexp_replace(
    replace(replace(replace(replace(
      p_body,
      '{{client_name}}', coalesce(p_client_name, '')),
      '{{firm_name}}', coalesce(p_firm_name, '')),
      '{{firm_address}}', coalesce(p_firm_address, '')),
      '{{firm_phone}}', coalesce(p_firm_phone, '')),
    '\{\{\s*[\w.]+\s*\}\}', '', 'g'
  );
$$;

create or replace function public.get_public_engagement_letter_template(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row record;
begin
  select elt.id, elt.name, elt.body_html, elt.requires_signature, w.name as workspace_name,
         w.name as firm_name, w.mailing_address as firm_address, w.phone as firm_phone
  into v_row
  from public.engagement_letter_templates elt
  join public.workspaces w on w.id = elt.workspace_id
  where elt.public_token = p_token and elt.is_public = true and elt.status = 'published';

  if v_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'template', jsonb_build_object('id', v_row.id, 'name', v_row.name, 'body_html', v_row.body_html, 'requires_signature', v_row.requires_signature),
    'workspace_name', v_row.workspace_name,
    'firm_name', v_row.firm_name,
    'firm_address', v_row.firm_address,
    'firm_phone', v_row.firm_phone
  );
end;
$$;

grant execute on function public.get_public_engagement_letter_template(uuid) to anon, authenticated;

create or replace function public.sign_public_engagement_letter(
  p_token uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_typed_name text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_template record;
  v_client_id uuid;
  v_client_name text;
  v_resolved_html text;
  v_signature_id uuid;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;
  if p_typed_name is null or btrim(p_typed_name) = '' then
    raise exception 'A typed signature is required';
  end if;

  select elt.id, elt.workspace_id, elt.body_html, w.name as firm_name, w.mailing_address as firm_address, w.phone as firm_phone
  into v_template
  from public.engagement_letter_templates elt
  join public.workspaces w on w.id = elt.workspace_id
  where elt.public_token = p_token and elt.is_public = true and elt.status = 'published';

  if v_template.id is null then
    raise exception 'This link is no longer available';
  end if;

  v_client_id := public.find_or_create_public_lead(v_template.workspace_id, p_first_name, p_last_name, p_email, p_phone);
  v_client_name := btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));
  v_resolved_html := public.render_engagement_letter_merge_fields(v_template.body_html, v_client_name, v_template.firm_name, v_template.firm_address, v_template.firm_phone);

  insert into public.engagement_letter_public_signatures (
    workspace_id, engagement_letter_template_id, client_id,
    signer_name, signer_email, signer_phone, resolved_body_html, typed_name
  ) values (
    v_template.workspace_id, v_template.id, v_client_id,
    v_client_name, btrim(p_email), nullif(btrim(coalesce(p_phone, '')), ''), v_resolved_html, btrim(p_typed_name)
  )
  returning id into v_signature_id;

  return jsonb_build_object('ok', true, 'signature_id', v_signature_id);
end;
$$;

grant execute on function public.sign_public_engagement_letter(uuid, text, text, text, text, text) to anon, authenticated;
