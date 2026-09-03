-- Bug fix: messages.read_at (added for read receipts) had no UPDATE policy
-- at all -- neither staff nor portal could ever mark a message read, so
-- the Messaging Hub's "mark read on open" silently no-opped under RLS.
create policy messages_update on public.messages
  for update using (has_permission(workspace_id, 'messages.view'))
  with check (has_permission(workspace_id, 'messages.view'));

create policy messages_portal_update on public.messages
  for update using (
    exists (select 1 from public.message_threads t where t.id = messages.thread_id and public.is_portal_user_for_entity(t.entity_type, t.entity_id))
  )
  with check (
    exists (select 1 from public.message_threads t where t.id = messages.thread_id and public.is_portal_user_for_entity(t.entity_type, t.entity_id))
  );
