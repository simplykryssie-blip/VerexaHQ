-- signature_request_signers already supports signature_type/signature_image_path
-- (drawn vs typed), but engagement_letter_public_signatures -- the separate
-- table backing the standalone public engagement-letter link at /e/[token] --
-- only ever recorded a typed name. This brings it up to the same shape and
-- makes both sign_public_engagement_letter* RPCs accept a drawn signature
-- the same way record_signature_by_token already does.

alter table public.engagement_letter_public_signatures add column if not exists signature_type text not null default 'typed' check (signature_type in ('typed', 'drawn'));
alter table public.engagement_letter_public_signatures add column if not exists signature_image_path text;

create or replace function public.sign_public_engagement_letter(
  p_token uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_typed_name text,
  p_signature_type text default 'typed',
  p_signature_image_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
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
  if p_signature_type not in ('typed', 'drawn') then
    raise exception 'Invalid signature type';
  end if;
  if p_signature_type = 'typed' and (p_typed_name is null or btrim(p_typed_name) = '') then
    raise exception 'A typed signature is required';
  end if;
  if p_signature_type = 'drawn' and (p_signature_image_path is null or btrim(p_signature_image_path) = '') then
    raise exception 'A drawn signature is required';
  end if;

  select elt.id, elt.workspace_id, elt.body_html, w.name as firm_name, public.format_mailing_address(w.mailing_address) as firm_address, w.phone as firm_phone
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
    signer_name, signer_email, signer_phone, resolved_body_html, typed_name,
    signature_type, signature_image_path
  ) values (
    v_template.workspace_id, v_template.id, v_client_id,
    v_client_name, btrim(p_email), nullif(btrim(coalesce(p_phone, '')), ''), v_resolved_html, nullif(btrim(coalesce(p_typed_name, '')), ''),
    p_signature_type, p_signature_image_path
  )
  returning id into v_signature_id;

  return jsonb_build_object('ok', true, 'signature_id', v_signature_id);
end;
$function$;

create or replace function public.sign_public_engagement_letter_with_signup(
  p_token uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_typed_name text,
  p_auth_user_id uuid,
  p_signature_type text default 'typed',
  p_signature_image_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
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
  if p_signature_type not in ('typed', 'drawn') then
    raise exception 'Invalid signature type';
  end if;
  if p_signature_type = 'typed' and (p_typed_name is null or btrim(p_typed_name) = '') then
    raise exception 'A typed signature is required';
  end if;
  if p_signature_type = 'drawn' and (p_signature_image_path is null or btrim(p_signature_image_path) = '') then
    raise exception 'A drawn signature is required';
  end if;
  if p_auth_user_id is null then
    raise exception 'A portal account is required for this link';
  end if;

  select elt.id, elt.workspace_id, elt.body_html, elt.requires_portal_signup,
         w.name as firm_name, public.format_mailing_address(w.mailing_address) as firm_address, w.phone as firm_phone
  into v_template
  from public.engagement_letter_templates elt
  join public.workspaces w on w.id = elt.workspace_id
  where elt.public_token = p_token and elt.is_public = true and elt.status = 'published';

  if v_template.id is null then
    raise exception 'This link is no longer available';
  end if;
  if not v_template.requires_portal_signup then
    raise exception 'This engagement letter does not use portal signup';
  end if;

  v_client_id := public.find_or_create_public_lead(v_template.workspace_id, p_first_name, p_last_name, p_email, p_phone);
  v_client_name := btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));
  v_resolved_html := public.render_engagement_letter_merge_fields(v_template.body_html, v_client_name, v_template.firm_name, v_template.firm_address, v_template.firm_phone);

  insert into public.engagement_letter_public_signatures (
    workspace_id, engagement_letter_template_id, client_id,
    signer_name, signer_email, signer_phone, resolved_body_html, typed_name,
    signature_type, signature_image_path
  ) values (
    v_template.workspace_id, v_template.id, v_client_id,
    v_client_name, btrim(p_email), nullif(btrim(coalesce(p_phone, '')), ''), v_resolved_html, nullif(btrim(coalesce(p_typed_name, '')), ''),
    p_signature_type, p_signature_image_path
  )
  returning id into v_signature_id;

  perform public.link_public_portal_account(v_template.workspace_id, v_client_id, p_auth_user_id, p_email, v_client_name);

  return jsonb_build_object('ok', true, 'signature_id', v_signature_id);
end;
$function$;

-- Private bucket for drawn signature images. Uploads only ever happen
-- server-side (a signing link has no logged-in user to gate an insert
-- policy against), so the only RLS needed is staff read access for review.
insert into storage.buckets (id, name, public)
values ('signatures', 'signatures', false)
on conflict (id) do nothing;

create policy signatures_storage_select on storage.objects for select
using (bucket_id = 'signatures' and public.has_permission(((storage.foldername(name))[1])::uuid, 'documents.view'));
