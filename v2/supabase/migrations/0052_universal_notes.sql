-- Epic 3A: Engagement Foundation -- Part 5 (Universal Notes engine).
--
-- Same story as attachments in 0049: the external drift had already started
-- turning client_notes (Progressive Disclosure sprint, migration 0044) into
-- a polymorphic notes engine -- entity_type (default 'client'), entity_id
-- (renamed from client_id), is_private, is_internal, plus richer
-- rich_content/mentions/attachments jsonb columns than originally planned
-- here. Same bug as attachments too: the rename left the original
-- client_id_fkey constraint pointing entity_id at clients(id) only, so
-- entity_type values other than 'client' could never actually have worked.
-- entity_type/is_private/is_internal were also left nullable, and there was
-- no entity_type check constraint, no audit trigger, and the SELECT policy
-- didn't account for is_private at all. This migration adopts the richer
-- jsonb-based design (rather than reverting it) and finishes securing it:
-- drops the wrong FK, adds the check constraint, tightens the nullable
-- columns, adds the audit trigger, fixes the SELECT policy, and renames the
-- table to `notes`. 0 rows existed, so this is a pure schema fix.

alter table public.client_notes drop constraint if exists client_notes_client_id_fkey;

alter table public.client_notes add constraint client_notes_entity_type_check check (entity_type in (
  'client', 'engagement', 'task', 'document', 'invoice', 'blueprint', 'workflow'
));
alter table public.client_notes alter column entity_type set not null;
alter table public.client_notes alter column is_private set not null;
alter table public.client_notes alter column is_internal set not null;

create trigger audit_notes after insert or update or delete on public.client_notes for each row execute function public.audit_trigger_fn();

drop policy if exists client_notes_select on public.client_notes;
create policy client_notes_select on public.client_notes for select using (
  public.is_workspace_member(workspace_id)
  and (not is_private or author_id = (select auth.uid()) or public.is_workspace_admin(workspace_id))
);

alter table public.client_notes rename to notes;
alter index if exists client_notes_pkey rename to notes_pkey;
alter policy client_notes_select on public.notes rename to notes_select;
alter policy client_notes_insert on public.notes rename to notes_insert;
alter policy client_notes_update on public.notes rename to notes_update;
alter policy client_notes_delete on public.notes rename to notes_delete;

comment on table public.notes is 'Universal notes engine, replacing per-entity note tables. entity_id has no single-target FK -- same polymorphic tradeoff as attachments/blueprint_components. is_private restricts visibility to the author + workspace admins; is_internal marks a note as staff-only (vs. client-portal-visible, once the portal exists). rich_content/mentions/attachments are jsonb rather than a normalized shape, matching the existing free-form jsonb pattern used by pipeline stage rules and organizer field config elsewhere in this schema.';

alter table public.attachments drop constraint if exists client_documents_entity_type_check;
alter table public.attachments add constraint attachments_entity_type_check check (entity_type in (
  'client', 'engagement', 'workflow', 'task', 'invoice', 'document', 'blueprint', 'message', 'note'
));
