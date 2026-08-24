-- Companion to 20260824030000: the actual test clients (Shanti and
-- Octavionna Esters) and everything tied to them -- automation runs,
-- tasks, documents, organizer responses, portal accounts -- were created
-- directly in the real "Verexa HQ CRM" workspace. This moves them (in
-- place, same row ids) into "Demo - Independent PTIN" so the real
-- workspace goes back to being clean for actual clients, while everything
-- these two clients are mid-flight on (a running automation delay, a
-- submitted organizer, a staff task) keeps working uninterrupted.
--
-- Config-object references embedded in the moved rows (automation_id,
-- service_id, organizer_template_id, organizer_field_id, ...) still point
-- at Verexa HQ CRM's copies, so each is remapped by slug/display_order to
-- its counterpart in Demo - Independent PTIN, cloned by the companion
-- migration moments earlier. Everything else (name, answers, history) is
-- untouched -- only workspace_id and those embedded ids move.
do $$
declare
  v_src uuid := '74321fb2-9a18-4625-ab12-01c98e888667'; -- Verexa HQ CRM
  v_dst uuid := 'b41f7ee8-e811-4d4d-8156-5ebf43014462'; -- Demo - Independent PTIN
  v_shanti uuid := '8ae13ee6-ed2b-430b-973a-be4854f35fdd';
  v_octavionna uuid := '58e8deb7-faed-45a3-b195-7fc4411a22f6';
begin
  -- clients + directly client-scoped tables. client_number is unique per
  -- workspace and Demo - Independent PTIN already has two seeded demo
  -- clients occupying CLI-2026-000001/000002, so these two get reassigned
  -- the next numbers in that workspace's sequence.
  update public.clients set workspace_id = v_dst, client_number = 'CLI-2026-000003' where id = v_shanti;
  update public.clients set workspace_id = v_dst, client_number = 'CLI-2026-000004' where id = v_octavionna;
  update public.client_addresses set workspace_id = v_dst where client_id in (v_shanti, v_octavionna);
  update public.client_emails set workspace_id = v_dst where client_id in (v_shanti, v_octavionna);
  update public.client_phones set workspace_id = v_dst where client_id in (v_shanti, v_octavionna);
  update public.client_relationships set workspace_id = v_dst where client_id in (v_shanti, v_octavionna);
  update public.client_portal_users set workspace_id = v_dst where client_id in (v_shanti, v_octavionna);
  update public.pending_portal_invites set workspace_id = v_dst where client_id in (v_shanti, v_octavionna);
  update public.tasks set workspace_id = v_dst where client_id in (v_shanti, v_octavionna);
  update public.attachments set workspace_id = v_dst where entity_type = 'client' and entity_id in (v_shanti, v_octavionna);
  update public.document_folders set workspace_id = v_dst where entity_type = 'client' and entity_id in (v_shanti, v_octavionna);
  update public.notification_queue set workspace_id = v_dst where entity_id in (v_shanti, v_octavionna);
  update public.activity_log set workspace_id = v_dst where entity_id in (v_shanti, v_octavionna);
  update public.audit_log set workspace_id = v_dst where entity_id in (v_shanti, v_octavionna);

  update public.messages set workspace_id = v_dst
  where thread_id in (select id from public.message_threads where entity_id in (v_shanti, v_octavionna));
  update public.message_threads set workspace_id = v_dst where entity_id in (v_shanti, v_octavionna);

  -- client_service_interests: remap service_id / service_category_id by slug
  update public.client_service_interests csi
  set workspace_id = v_dst,
      service_id = (select ns.id from public.services ns join public.services os on os.slug = ns.slug where os.id = csi.service_id and ns.workspace_id = v_dst),
      service_category_id = case when csi.service_category_id is null then null
        else (select nc.id from public.service_categories nc join public.service_categories oc on oc.slug = nc.slug where oc.id = csi.service_category_id and nc.workspace_id = v_dst) end
  where csi.client_id in (v_shanti, v_octavionna);

  -- organizer_responses: remap organizer_template_id / resolved_service_id by slug
  update public.organizer_responses o
  set workspace_id = v_dst,
      organizer_template_id = (select nt.id from public.organizer_templates nt join public.organizer_templates ot on ot.slug = nt.slug where ot.id = o.organizer_template_id and nt.workspace_id = v_dst),
      resolved_service_id = case when o.resolved_service_id is null then null
        else (select ns.id from public.services ns join public.services os on os.slug = ns.slug where os.id = o.resolved_service_id and ns.workspace_id = v_dst) end
  where o.client_id in (v_shanti, v_octavionna);

  -- organizer_response_answers: remap organizer_field_id by (template slug, display_order)
  update public.organizer_response_answers a
  set organizer_field_id = (
    select nf.id
    from public.organizer_fields nf
    join public.organizer_fields ofd on ofd.display_order = nf.display_order
    join public.organizer_templates nt on nt.id = nf.organizer_template_id
    join public.organizer_templates ot on ot.id = ofd.organizer_template_id and ot.slug = nt.slug
    where ofd.id = a.organizer_field_id and nt.workspace_id = v_dst
  )
  where a.organizer_response_id in (
    select id from public.organizer_responses where client_id in (v_shanti, v_octavionna)
  );

  -- automation_runs: remap automation_id by slug, current_step_id by (automation slug, display_order)
  update public.automation_runs r
  set workspace_id = v_dst,
      automation_id = (select na.id from public.automations na join public.automations oa on oa.slug = na.slug where oa.id = r.automation_id and na.workspace_id = v_dst),
      current_step_id = case when r.current_step_id is null then null else (
        select ns.id
        from public.automation_steps ns
        join public.automation_steps os on os.display_order = ns.display_order
        join public.automations na2 on na2.id = ns.automation_id
        join public.automations oa2 on oa2.id = os.automation_id and oa2.slug = na2.slug
        where os.id = r.current_step_id and na2.workspace_id = v_dst
      ) end
  where r.client_id in (v_shanti, v_octavionna);

  -- automation_pending_steps: remap automation_step_id the same way (run_id itself is unchanged -- rows keep their id)
  update public.automation_pending_steps p
  set workspace_id = v_dst,
      automation_step_id = (
        select ns.id
        from public.automation_steps ns
        join public.automation_steps os on os.display_order = ns.display_order
        join public.automations na on na.id = ns.automation_id
        join public.automations oa on oa.id = os.automation_id and oa.slug = na.slug
        where os.id = p.automation_step_id and na.workspace_id = v_dst
      )
  where p.workspace_id = v_src
    and p.run_id in (select id from public.automation_runs where client_id in (v_shanti, v_octavionna));

  -- automation_execution_logs: historical log, remap automation_id for consistency
  update public.automation_execution_logs l
  set workspace_id = v_dst,
      automation_id = case when l.automation_id is null then null
        else (select na.id from public.automations na join public.automations oa on oa.slug = na.slug where oa.id = l.automation_id and na.workspace_id = v_dst) end
  where l.workspace_id = v_src;
end $$;
