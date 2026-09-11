-- resolve_and_sign_organizer_response() -- the function both public organizer
-- submission paths (submit_public_organizer_response,
-- submit_public_organizer_response_with_signup) call to turn a filled-out
-- signature field into a real signed record -- never enforced the app-wide
-- "signature requires BOTH typed name AND a drawn signature" rule restored
-- earlier for engagement letters and documents (see
-- 20260828190000_require_both_typed_and_drawn_signature_again.sql). It only
-- checked that typed_name was non-blank, completely ignored the
-- signature_image_path the frontend (PublicOrganizerForm.tsx /
-- components/portal/OrganizerForm.tsx) already collects and requires before
-- letting the client proceed, and hardcoded signature_type = 'typed' when
-- inserting into signature_request_signers -- so even a fully-drawn
-- signature was silently discarded and never stored anywhere, and any
-- direct API caller bypassing the frontend could get an organizer "signed"
-- with a typed name alone.
--
-- Found while QA-testing Phase 3 (organizer intake) of the PTIN test plan.
-- Fixed at the shared function level so it reaches every workspace, not
-- just the demo workspace where it was found.

create or replace function public.resolve_and_sign_organizer_response(p_response_id uuid, p_workspace_id uuid, p_template_id uuid, p_client_name text, p_client_email text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_signature_answer jsonb;
  v_typed_name text;
  v_signature_image_path text;
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
  v_signature_image_path := nullif(btrim(coalesce(v_signature_answer->>'signature_image_path', '')), '');
  if v_signature_image_path is null then
    raise exception 'A drawn signature is required';
  end if;

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
    signature_type, signature_image_path, typed_name, signed_at, resolved_document_html
  ) values (
    v_request_id, p_client_name, nullif(btrim(coalesce(p_client_email, '')), ''), 1, 'signed',
    'drawn', v_signature_image_path, v_typed_name, v_signed_at, v_html
  );

  update public.organizer_responses set signature_request_id = v_request_id where id = p_response_id;

  return v_request_id;
end;
$function$;
