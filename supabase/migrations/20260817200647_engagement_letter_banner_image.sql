-- Letterhead banner (JotForm/Cognito Forms style): an image staff upload
-- once that renders at the top of the letter -- in the editor, in the
-- client-facing paginated view, and in the rendered PDF (both the
-- automation-sent copy and the filed signed copy).

alter table public.engagement_letter_templates add column if not exists banner_image_url text;

create or replace function public.get_public_engagement_letter_template(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row record;
begin
  select elt.id, elt.name, elt.body_html, elt.requires_signature, elt.requires_portal_signup, elt.workspace_id, elt.banner_image_url,
         w.name as workspace_name, w.name as firm_name, w.mailing_address as firm_address, w.phone as firm_phone
  into v_row
  from public.engagement_letter_templates elt
  join public.workspaces w on w.id = elt.workspace_id
  where elt.public_token = p_token and elt.is_public = true and elt.status = 'published';

  if v_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'template', jsonb_build_object('id', v_row.id, 'name', v_row.name, 'body_html', v_row.body_html, 'requires_signature', v_row.requires_signature, 'banner_image_url', v_row.banner_image_url),
    'workspace_name', v_row.workspace_name,
    'firm_name', v_row.firm_name,
    'firm_address', v_row.firm_address,
    'firm_phone', v_row.firm_phone,
    'requires_portal_signup', v_row.requires_portal_signup,
    'password_min_length', coalesce((select password_min_length from public.workspace_security_policies where workspace_id = v_row.workspace_id), 8)
  );
end;
$function$;
