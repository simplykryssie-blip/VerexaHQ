-- Lets the document-requests panel group checklist items by category
-- (Income, Investments, ...) instead of one flat list. category was never
-- carried from document_request_items (the template) onto the actual
-- document_request_item_statuses rows a request creates -- adding it here
-- and patching every writer that creates those rows (the manual
-- create_document_request RPC, the automation's send_document_request
-- action, and the new organizer-checklist sync route) so every kind of
-- document request gets grouping, not just the organizer-driven one.

alter table public.document_request_item_statuses
  add column category text;

-- Patch create_document_request: copy dri.category alongside the fields it
-- already copies from the template item. Done via regexp surgery on the
-- live function body instead of retyping the whole (unrelated) function,
-- so nothing else about it can drift from a manual transcription mistake.
do $do$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc where proname = 'create_document_request' and pronamespace = 'public'::regnamespace;

  v_new := replace(
    v_def,
    'insert into public.document_request_item_statuses (document_request_id, document_request_item_id, name, is_required, status, fulfilled_by_attachment_id)',
    'insert into public.document_request_item_statuses (document_request_id, document_request_item_id, name, is_required, category, status, fulfilled_by_attachment_id)'
  );
  v_new := replace(
    v_new,
    E'    dri.is_required,\n    coalesce(prior.status,',
    E'    dri.is_required,\n    dri.category,\n    coalesce(prior.status,'
  );

  if v_new = v_def then
    raise exception 'create_document_request: expected text not found, refusing to silently skip the patch';
  end if;

  execute v_new;
end;
$do$;

-- Same patch for execute_automation_step's send_document_request branch.
do $do$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc where proname = 'execute_automation_step' and pronamespace = 'public'::regnamespace;

  v_new := replace(
    v_def,
    'insert into public.document_request_item_statuses (document_request_id, document_request_item_id, name, is_required, status, fulfilled_by_attachment_id)',
    'insert into public.document_request_item_statuses (document_request_id, document_request_item_id, name, is_required, category, status, fulfilled_by_attachment_id)'
  );
  v_new := replace(
    v_new,
    E'        v_doc_request_id, dri.id, dri.name, dri.is_required,\n        coalesce(prior.status,',
    E'        v_doc_request_id, dri.id, dri.name, dri.is_required, dri.category,\n        coalesce(prior.status,'
  );

  if v_new = v_def then
    raise exception 'execute_automation_step: expected text not found, refusing to silently skip the patch';
  end if;

  execute v_new;
end;
$do$;
