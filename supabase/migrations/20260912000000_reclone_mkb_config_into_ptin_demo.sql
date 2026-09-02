-- Wipes the PTIN demo workspace's existing business configuration and
-- re-clones it fresh from MKB Financial Group so the demo shows exactly
-- what the real business runs. No clients/engagements exist in the demo
-- workspace today (verified before writing this), so this only ever
-- touches reusable configuration, never client records.
--
-- This extends the pattern from 20260824030000_clone_config_into_demo_ptin_workspace.sql
-- (same temp-table id-remapping approach) with two things that migration
-- predates: engagement_letter_templates / document_request_templates are
-- now cloned too, and their ids -- along with organizer_template_id --
-- are now remapped where they appear embedded inside automation_steps
-- .action_config (send_organizer_template, send_document_request), which
-- the original script missed since those action types didn't exist yet.
do $$
declare
  v_src uuid := '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7'; -- MKB Financial Group LLC
  v_dst uuid := 'b41f7ee8-e811-4d4d-8156-5ebf43014462'; -- Summit Tax & Financial Services (PTIN demo)
  r record;
  v_new_id uuid;
  v_new_config jsonb;
begin
  -- ==================== DELETE existing demo config ====================
  -- Children first. services is deleted before its FK targets
  -- (processes/organizer_templates/service_categories/engagement_letter_templates
  -- /document_request_templates) since it references all of them.
  delete from public.automation_step_edges where automation_id in (select id from public.automations where workspace_id = v_dst);
  delete from public.automation_steps where automation_id in (select id from public.automations where workspace_id = v_dst);
  delete from public.automations where workspace_id = v_dst;
  delete from public.services where workspace_id = v_dst;
  delete from public.organizer_fields where organizer_template_id in (select id from public.organizer_templates where workspace_id = v_dst);
  delete from public.organizer_templates where workspace_id = v_dst;
  delete from public.process_stages where process_id in (select id from public.processes where workspace_id = v_dst);
  delete from public.processes where workspace_id = v_dst;
  delete from public.engagement_letter_templates where workspace_id = v_dst;
  delete from public.email_templates where workspace_id = v_dst;
  delete from public.sms_templates where workspace_id = v_dst;
  delete from public.document_request_templates where workspace_id = v_dst;
  delete from public.service_categories where workspace_id = v_dst;

  -- ==================== CLONE fresh config from MKB ====================
  create temp table _cat_map (old_id uuid primary key, new_id uuid) on commit drop;
  create temp table _proc_map (old_id uuid primary key, new_id uuid) on commit drop;
  create temp table _stage_map (old_id uuid primary key, new_id uuid) on commit drop;
  create temp table _org_tpl_map (old_id uuid primary key, new_id uuid) on commit drop;
  create temp table _org_field_map (old_id uuid primary key, new_id uuid) on commit drop;
  create temp table _elt_map (old_id uuid primary key, new_id uuid) on commit drop;
  create temp table _drt_map (old_id uuid primary key, new_id uuid) on commit drop;
  create temp table _automation_map (old_id uuid primary key, new_id uuid) on commit drop;
  create temp table _step_map (old_id uuid primary key, new_id uuid) on commit drop;

  -- service_categories
  for r in select * from public.service_categories where workspace_id = v_src loop
    insert into public.service_categories (workspace_id, name, slug, display_order)
    values (v_dst, r.name, r.slug, r.display_order)
    returning id into v_new_id;
    insert into _cat_map values (r.id, v_new_id);
  end loop;

  -- processes
  for r in select * from public.processes where workspace_id = v_src loop
    insert into public.processes (workspace_id, name, slug, description, status, created_by)
    values (v_dst, r.name, r.slug, r.description, r.status, null)
    returning id into v_new_id;
    insert into _proc_map values (r.id, v_new_id);
  end loop;

  -- process_stages
  for r in select ps.* from public.process_stages ps join _proc_map pm on pm.old_id = ps.process_id loop
    insert into public.process_stages (process_id, name, display_order, reviewer_role_id, completion_rule, due_date_rule, entry_conditions, notify_on_entry, expected_duration, warning_threshold, critical_threshold)
    values (
      (select new_id from _proc_map where old_id = r.process_id),
      r.name, r.display_order, null, r.completion_rule, r.due_date_rule, r.entry_conditions, r.notify_on_entry, r.expected_duration, r.warning_threshold, r.critical_threshold
    )
    returning id into v_new_id;
    insert into _stage_map values (r.id, v_new_id);
  end loop;

  -- organizer_templates (public_token gets a fresh default -- it's globally unique)
  for r in select * from public.organizer_templates where workspace_id = v_src loop
    insert into public.organizer_templates (workspace_id, name, slug, description, status, created_by, is_public, requires_portal_signup, banner_image_url)
    values (v_dst, r.name, r.slug, r.description, r.status, null, r.is_public, r.requires_portal_signup, r.banner_image_url)
    returning id into v_new_id;
    insert into _org_tpl_map values (r.id, v_new_id);
  end loop;

  -- organizer_fields, pass 1: insert flat (parent_field_id null for now)
  for r in select ofl.* from public.organizer_fields ofl join _org_tpl_map otm on otm.old_id = ofl.organizer_template_id order by ofl.display_order loop
    insert into public.organizer_fields (organizer_template_id, parent_field_id, field_type, label, help_text, display_order, is_required, options, conditional_logic, validation, body_html, client_profile_field, relationship_role, layout_width, include_in_document_checklist, document_checklist_name, document_checklist_category)
    values (
      (select new_id from _org_tpl_map where old_id = r.organizer_template_id),
      null, r.field_type, r.label, r.help_text, r.display_order, r.is_required, r.options, r.conditional_logic, r.validation, r.body_html, r.client_profile_field, r.relationship_role, r.layout_width, r.include_in_document_checklist, r.document_checklist_name, r.document_checklist_category
    )
    returning id into v_new_id;
    insert into _org_field_map values (r.id, v_new_id);
  end loop;

  -- organizer_fields, pass 2: backfill parent_field_id for repeating sections
  update public.organizer_fields f
  set parent_field_id = pfm.new_id
  from _org_field_map fm
  join public.organizer_fields orig on orig.id = fm.old_id
  join _org_field_map pfm on pfm.old_id = orig.parent_field_id
  where f.id = fm.new_id and orig.parent_field_id is not null;

  -- engagement_letter_templates (new vs. the original clone script)
  for r in select * from public.engagement_letter_templates where workspace_id = v_src loop
    insert into public.engagement_letter_templates (workspace_id, name, slug, body_html, merge_fields, requires_signature, status, created_by, is_public, requires_portal_signup, banner_image_url, source_type, pdf_storage_path, pdf_field_mode, pdf_field_mappings)
    values (v_dst, r.name, r.slug, r.body_html, r.merge_fields, r.requires_signature, r.status, null, r.is_public, r.requires_portal_signup, r.banner_image_url, r.source_type, r.pdf_storage_path, r.pdf_field_mode, r.pdf_field_mappings)
    returning id into v_new_id;
    insert into _elt_map values (r.id, v_new_id);
  end loop;

  -- document_request_templates (new vs. the original clone script)
  for r in select * from public.document_request_templates where workspace_id = v_src loop
    insert into public.document_request_templates (workspace_id, name, slug, description, status, created_by)
    values (v_dst, r.name, r.slug, r.description, r.status, null)
    returning id into v_new_id;
    insert into _drt_map values (r.id, v_new_id);
  end loop;

  -- services (now correctly remaps engagement_letter_template_id and
  -- document_request_template_id instead of copying them verbatim --
  -- document_folder_template_id has nothing to clone from MKB, left null)
  for r in select * from public.services where workspace_id = v_src loop
    insert into public.services (
      workspace_id, service_category_id, name, slug, description, estimated_duration_minutes, default_price,
      pricing_rule_id, billing_rule_id, process_id, organizer_template_id, document_request_template_id,
      is_bookable, is_portal_visible, requires_organizer, requires_engagement_letter, requires_documents,
      requires_signature, requires_review, requires_invoice, requires_payment_before_release,
      display_order, tags, status, created_by, document_folder_template_id, cloned_from_service_id, engagement_letter_template_id
    )
    values (
      v_dst,
      (select new_id from _cat_map where old_id = r.service_category_id),
      r.name, r.slug, r.description, r.estimated_duration_minutes, r.default_price,
      r.pricing_rule_id, r.billing_rule_id,
      (select new_id from _proc_map where old_id = r.process_id),
      (select new_id from _org_tpl_map where old_id = r.organizer_template_id),
      (select new_id from _drt_map where old_id = r.document_request_template_id),
      r.is_bookable, r.is_portal_visible, r.requires_organizer, r.requires_engagement_letter, r.requires_documents,
      r.requires_signature, r.requires_review, r.requires_invoice, r.requires_payment_before_release,
      r.display_order, r.tags, r.status, null, null, r.cloned_from_service_id,
      (select new_id from _elt_map where old_id = r.engagement_letter_template_id)
    );
  end loop;

  -- email_templates
  for r in select * from public.email_templates where workspace_id = v_src loop
    insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, schedule_rule, status, created_by)
    values (v_dst, r.name, r.slug, r.category, r.subject, r.body_html, r.merge_fields, r.schedule_rule, r.status, null);
  end loop;

  -- sms_templates
  for r in select * from public.sms_templates where workspace_id = v_src loop
    insert into public.sms_templates (workspace_id, name, slug, body, merge_fields, schedule_rule, status, created_by)
    values (v_dst, r.name, r.slug, r.body, r.merge_fields, r.schedule_rule, r.status, null);
  end loop;

  -- automations (webhook_token gets a fresh default -- it's globally unique)
  for r in select * from public.automations where workspace_id = v_src loop
    insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status, created_by, ai_config)
    values (v_dst, r.name, r.slug, r.description, r.trigger_type, r.trigger_config, r.conditions, r.is_enabled, r.status, null, r.ai_config)
    returning id into v_new_id;
    insert into _automation_map values (r.id, v_new_id);
  end loop;

  -- automation_steps -- remap every id-shaped reference embedded in
  -- action_config: process_id/process_stage_id/automation_id (as before),
  -- plus organizer_template_id (send_organizer_template) and
  -- document_request_template_id (send_document_request), which the
  -- original clone script predates. template_slug and the "current_run"
  -- sentinel resolve by convention at runtime, not by id, so they're left
  -- untouched; likewise any raw staff/user id (e.g. a fixed assignee) is
  -- copied as-is, same as the original script's behavior.
  for r in select ast.* from public.automation_steps ast join _automation_map am on am.old_id = ast.automation_id order by ast.automation_id, ast.display_order loop
    v_new_config := r.action_config;
    if v_new_config ? 'process_id' then
      v_new_config := jsonb_set(v_new_config, '{process_id}', to_jsonb((select new_id from _proc_map where old_id = (v_new_config->>'process_id')::uuid)::text));
    end if;
    if v_new_config ? 'process_stage_id' then
      v_new_config := jsonb_set(v_new_config, '{process_stage_id}', to_jsonb((select new_id from _stage_map where old_id = (v_new_config->>'process_stage_id')::uuid)::text));
    end if;
    if v_new_config ? 'automation_id' then
      v_new_config := jsonb_set(v_new_config, '{automation_id}', to_jsonb((select new_id from _automation_map where old_id = (v_new_config->>'automation_id')::uuid)::text));
    end if;
    if v_new_config ? 'organizer_template_id' then
      v_new_config := jsonb_set(v_new_config, '{organizer_template_id}', to_jsonb((select new_id from _org_tpl_map where old_id = (v_new_config->>'organizer_template_id')::uuid)::text));
    end if;
    if v_new_config ? 'document_request_template_id' then
      v_new_config := jsonb_set(v_new_config, '{document_request_template_id}', to_jsonb((select new_id from _drt_map where old_id = (v_new_config->>'document_request_template_id')::uuid)::text));
    end if;

    insert into public.automation_steps (automation_id, display_order, action_type, action_config, delay_minutes, requires_approval, approver_role_id, canvas_x, canvas_y)
    values (
      (select new_id from _automation_map where old_id = r.automation_id),
      r.display_order, r.action_type, v_new_config, r.delay_minutes, r.requires_approval, null, r.canvas_x, r.canvas_y
    )
    returning id into v_new_id;
    insert into _step_map values (r.id, v_new_id);
  end loop;

  -- automation_step_edges -- single set-based insert (see the original
  -- clone script's comment on why a per-row loop is unsafe here).
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
  select tam.new_id, tfs.new_id, tts.new_id, ase.branch_conditions, ase.label, ase.sort_order
  from public.automation_step_edges ase
  join _automation_map tam on tam.old_id = ase.automation_id
  join _step_map tfs on tfs.old_id = ase.from_step_id
  left join _step_map tts on tts.old_id = ase.to_step_id;

  -- system_settings (business hours, booking slot length)
  for r in select * from public.system_settings where workspace_id = v_src loop
    insert into public.system_settings (workspace_id, key, value, updated_by)
    values (v_dst, r.key, r.value, null)
    on conflict (workspace_id, key) do update set value = excluded.value;
  end loop;
end $$;
