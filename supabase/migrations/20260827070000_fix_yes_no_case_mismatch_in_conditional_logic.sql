-- Systemic bug found while testing the 2026 Individual Tax Organizer:
-- organizer_fields.conditional_logic rules gating on a field_type='yes_no'
-- field almost always compared against the capitalized string "Yes", but
-- yes_no fields actually store the lowercase value "yes"
-- (components/portal/OrganizerForm.tsx's YES_NO_OPTIONS is
-- [{label:"Yes",value:"yes"},{label:"No",value:"no"}] -- distinct from
-- radio_button fields, whose options -- and therefore stored values -- are
-- author-defined and commonly capitalized "Yes"/"No"/"Not sure"). Every
-- affected condition could therefore never actually match, permanently
-- hiding whatever field/section it gated regardless of the client's answer.
--
-- Affects 490 conditions across 9 organizer templates, all in the same two
-- workspaces (Summit Tax & Financial Services, MKB Financial Group) --
-- clearly one systemic authoring issue, not isolated typos. Fixed globally
-- rather than per-template, in case it exists anywhere else too.
do $$
declare
  v_field record;
  v_conditions jsonb;
  v_new_conditions jsonb;
  v_cond jsonb;
  v_gate_type text;
  v_changed boolean;
begin
  for v_field in
    select id, conditional_logic
    from public.organizer_fields
    where conditional_logic ? 'show_if'
  loop
    v_conditions := v_field.conditional_logic->'show_if'->'conditions';
    if v_conditions is null or jsonb_typeof(v_conditions) <> 'array' then continue; end if;

    v_new_conditions := '[]'::jsonb;
    v_changed := false;

    for v_cond in select * from jsonb_array_elements(v_conditions)
    loop
      select field_type into v_gate_type from public.organizer_fields where id = (v_cond->>'field_id')::uuid;
      if v_gate_type = 'yes_no' and v_cond->>'operator' = 'equals' and v_cond->>'value' = 'Yes' then
        v_cond := jsonb_set(v_cond, '{value}', '"yes"'::jsonb);
        v_changed := true;
      elsif v_gate_type = 'yes_no' and v_cond->>'operator' = 'equals' and v_cond->>'value' = 'No' then
        v_cond := jsonb_set(v_cond, '{value}', '"no"'::jsonb);
        v_changed := true;
      elsif v_gate_type = 'yes_no' and v_cond->>'operator' = 'not_equals' and v_cond->>'value' = 'Yes' then
        v_cond := jsonb_set(v_cond, '{value}', '"yes"'::jsonb);
        v_changed := true;
      elsif v_gate_type = 'yes_no' and v_cond->>'operator' = 'not_equals' and v_cond->>'value' = 'No' then
        v_cond := jsonb_set(v_cond, '{value}', '"no"'::jsonb);
        v_changed := true;
      end if;
      v_new_conditions := v_new_conditions || jsonb_build_array(v_cond);
    end loop;

    if v_changed then
      update public.organizer_fields
      set conditional_logic = jsonb_set(v_field.conditional_logic, '{show_if,conditions}', v_new_conditions)
      where id = v_field.id;
    end if;
  end loop;
end $$;
