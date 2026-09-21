-- Audit against the re-stated QuickBooks Setup & Bookkeeping Consultation
-- spec found the form, tags, pipeline, services, automations, and the
-- qualification trigger already live and matching (built in
-- 20260920120000_quickbooks_bookkeeping_consultation_intake.sql). The one
-- structural gap: this spec's section list names "Existing Books / Cleanup"
-- as its own section (11), separate from "Current Bookkeeping" (7); the
-- live template still had the cleanup questions on the same page as
-- bookkeeping-ownership/frequency/reconciliation/volume. This only moves a
-- page_break -- no field is added, removed, retyped, or reworded, and no
-- conditional_logic/tag/automation reference changes (those all key off
-- field ids, never display_order).
--
-- Idempotent: re-running with the split already applied is a no-op (the
-- "already split" guard below checks for the target page_break by id).

do $$
declare
  v_template_id constant uuid := 'a5000000-0000-0000-0000-000000000001';
  v_cleanup_break_id constant uuid := 'a6000029-1000-0000-0000-000000000000';
  v_cleanup_start_order int;
begin
  if exists (select 1 from public.organizer_fields where id = v_cleanup_break_id) then
    return; -- already split
  end if;

  select display_order into v_cleanup_start_order
  from public.organizer_fields
  where organizer_template_id = v_template_id and id = 'a6000029-0000-0000-0000-000000000000'; -- "Do your books need to be caught up or cleaned up?"

  if v_cleanup_start_order is null then
    raise exception 'Expected QuickBooks intake cleanup field not found -- template may have changed shape';
  end if;

  -- Make room for the new page_break right before the cleanup question.
  update public.organizer_fields
  set display_order = display_order + 1
  where organizer_template_id = v_template_id and display_order >= v_cleanup_start_order;

  insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic)
  values (v_cleanup_break_id, v_template_id, 'page_break', 'Existing Books / Cleanup', v_cleanup_start_order, false, '[]', '{}');
end $$;
