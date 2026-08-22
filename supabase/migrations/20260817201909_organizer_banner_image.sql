-- Same letterhead banner capability as engagement letters, for organizers.

alter table public.organizer_templates add column if not exists banner_image_url text;

create or replace function public.get_public_organizer_template(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_template record;
  v_result jsonb;
begin
  select ot.id, ot.name, ot.description, ot.workspace_id, ot.requires_portal_signup, ot.banner_image_url, w.name as workspace_name
  into v_template
  from public.organizer_templates ot
  join public.workspaces w on w.id = ot.workspace_id
  where ot.public_token = p_token and ot.is_public = true and ot.status = 'published';

  if v_template.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'template', jsonb_build_object('id', v_template.id, 'name', v_template.name, 'description', v_template.description, 'banner_image_url', v_template.banner_image_url),
    'workspace_name', v_template.workspace_name,
    'requires_portal_signup', v_template.requires_portal_signup,
    'password_min_length', coalesce((select password_min_length from public.workspace_security_policies where workspace_id = v_template.workspace_id), 8),
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
        'body_html', f.body_html, 'client_profile_field', f.client_profile_field
      ) order by f.display_order)
      from public.organizer_fields f
      where f.organizer_template_id = v_template.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;
