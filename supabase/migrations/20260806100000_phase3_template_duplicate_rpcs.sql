-- Fixes a real data-loss bug: the existing client-side "duplicate template"
-- flow only ever copied the top-level form_templates row and never copied
-- its form_questions children, so duplicating any of the four seeded
-- system intake/onboarding forms produced an empty shell with zero
-- questions. These RPCs perform a real deep copy (parent + children) for
-- the two template kinds that have child rows (form_templates/
-- form_questions, tax_organizer_templates/sections/questions). The other
-- template kinds used by the Templates page (document, engagement_letter,
-- email) have no child tables, so a plain client-side row insert (already
-- how the Forms page duplicates those) is sufficient and unchanged.
create or replace function public.duplicate_form_template(p_source_template_id uuid, p_workspace_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_source public.form_templates%rowtype;
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;
  if not public.can_view_form_template(p_source_template_id) then
    raise exception 'Template not found';
  end if;
  if not public.workspace_can_manage_templates(p_workspace_id) then
    raise exception 'You do not have permission to create templates for this workspace.';
  end if;

  select * into v_source from public.form_templates where id = p_source_template_id;
  if not found then
    raise exception 'Template not found';
  end if;

  insert into public.form_templates (
    workspace_id, template_name, template_category, description, content,
    is_active, is_platform_template, visibility_scope, source_template_id, created_by
  ) values (
    p_workspace_id, v_source.template_name || ' (copy)', v_source.template_category, v_source.description, v_source.content,
    true, false, 'workspace', v_source.id, auth.uid()
  )
  returning id into v_new_id;

  insert into public.form_questions (
    template_id, question_label, question_help, question_type, is_required, options, sort_order, conditional_logic, mapped_field
  )
  select v_new_id, question_label, question_help, question_type, is_required, options, sort_order, conditional_logic, mapped_field
  from public.form_questions
  where template_id = v_source.id
  order by sort_order;

  return v_new_id;
end;
$$;

revoke execute on function public.duplicate_form_template(uuid, uuid) from public;
revoke execute on function public.duplicate_form_template(uuid, uuid) from anon;
grant execute on function public.duplicate_form_template(uuid, uuid) to authenticated;

create or replace function public.duplicate_tax_organizer_template(p_source_template_id uuid, p_workspace_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_source public.tax_organizer_templates%rowtype;
  v_new_template_id uuid;
  v_section record;
  v_new_section_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_source
  from public.tax_organizer_templates t
  where t.id = p_source_template_id
    and (t.is_platform_template = true or public.is_platform_admin() or (t.workspace_id is not null and public.user_has_workspace_access(t.workspace_id)));
  if not found then
    raise exception 'Template not found';
  end if;

  if not public.workspace_can_manage_templates(p_workspace_id) then
    raise exception 'You do not have permission to create templates for this workspace.';
  end if;

  insert into public.tax_organizer_templates (workspace_id, template_name, tax_year, return_type, is_active, is_platform_template)
  values (p_workspace_id, v_source.template_name || ' (copy)', v_source.tax_year, v_source.return_type, true, false)
  returning id into v_new_template_id;

  for v_section in
    select * from public.tax_organizer_sections where template_id = v_source.id order by sort_order
  loop
    insert into public.tax_organizer_sections (template_id, section_title, section_description, sort_order, conditional_logic, estimated_minutes)
    values (v_new_template_id, v_section.section_title, v_section.section_description, v_section.sort_order, v_section.conditional_logic, v_section.estimated_minutes)
    returning id into v_new_section_id;

    insert into public.tax_organizer_questions (
      section_id, question_text, help_text, question_type, options, is_required, mapped_field, conditional_logic, sort_order,
      explanation, example_text, placeholder, not_sure_text, format_type
    )
    select v_new_section_id, question_text, help_text, question_type, options, is_required, mapped_field, conditional_logic, sort_order,
      explanation, example_text, placeholder, not_sure_text, format_type
    from public.tax_organizer_questions
    where section_id = v_section.id
    order by sort_order;
  end loop;

  return v_new_template_id;
end;
$$;

revoke execute on function public.duplicate_tax_organizer_template(uuid, uuid) from public;
revoke execute on function public.duplicate_tax_organizer_template(uuid, uuid) from anon;
grant execute on function public.duplicate_tax_organizer_template(uuid, uuid) to authenticated;
