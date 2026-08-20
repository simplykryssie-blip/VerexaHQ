create or replace function public.format_mailing_address(p_raw text)
returns text
language plpgsql
immutable
as $function$
declare
  v_json jsonb;
  v_street text;
  v_city_state text;
  v_city_state_zip text;
begin
  if p_raw is null or btrim(p_raw) = '' then
    return null;
  end if;

  begin
    v_json := p_raw::jsonb;
  exception when others then
    return p_raw;
  end;

  if jsonb_typeof(v_json) <> 'object' then
    return p_raw;
  end if;

  v_street := nullif(trim(both ', ' from concat_ws(', ', v_json->>'street', v_json->>'street2')), '');
  v_city_state := nullif(trim(both ', ' from concat_ws(', ', v_json->>'city', v_json->>'state')), '');
  v_city_state_zip := nullif(trim(both ' ' from concat_ws(' ', v_city_state, v_json->>'zip')), '');
  return nullif(trim(both ', ' from concat_ws(', ', v_street, v_city_state_zip)), '');
end;
$function$;

create or replace function public.sign_public_engagement_letter(p_token uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_typed_name text)
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
  if p_typed_name is null or btrim(p_typed_name) = '' then
    raise exception 'A typed signature is required';
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
    signer_name, signer_email, signer_phone, resolved_body_html, typed_name
  ) values (
    v_template.workspace_id, v_template.id, v_client_id,
    v_client_name, btrim(p_email), nullif(btrim(coalesce(p_phone, '')), ''), v_resolved_html, btrim(p_typed_name)
  )
  returning id into v_signature_id;

  return jsonb_build_object('ok', true, 'signature_id', v_signature_id);
end;
$function$;

create or replace function public.sign_public_engagement_letter_with_signup(p_token uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_typed_name text, p_auth_user_id uuid)
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
  if p_typed_name is null or btrim(p_typed_name) = '' then
    raise exception 'A typed signature is required';
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
    signer_name, signer_email, signer_phone, resolved_body_html, typed_name
  ) values (
    v_template.workspace_id, v_template.id, v_client_id,
    v_client_name, btrim(p_email), nullif(btrim(coalesce(p_phone, '')), ''), v_resolved_html, btrim(p_typed_name)
  )
  returning id into v_signature_id;

  perform public.link_public_portal_account(v_template.workspace_id, v_client_id, p_auth_user_id, p_email, v_client_name);

  return jsonb_build_object('ok', true, 'signature_id', v_signature_id);
end;
$function$;
