-- Revision Sprint -- Verexa UX Standard #001 (Progressive Disclosure): drafts.
--
-- Automatic draft auto-save for Client / Engagement / Workflow / Blueprint /
-- Organizer / Document Request / Engagement Letter / Automation / Settings
-- editing, with a Restore/Discard prompt and a "Draft Saved" indicator. One
-- generic table instead of nine bespoke ones: the client upserts
-- (workspace_id, user_id, draft_type, entity_id) with a jsonb payload as the
-- user types, and reads it back on next visit to offer Restore/Discard.
-- entity_id is null while editing something not yet created (e.g. a brand
-- new Client before the first Save) -- Postgres unique constraints treat
-- distinct NULLs as non-equal, so concurrent "new X" drafts by the same user
-- don't collide; the UI resolves to the most recently updated one.

create table public.draft_saves (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_type text not null check (draft_type in (
    'client', 'engagement', 'workflow', 'blueprint', 'organizer',
    'document_request', 'engagement_letter', 'automation', 'settings'
  )),
  entity_id uuid,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, draft_type, entity_id)
);
comment on table public.draft_saves is 'Auto-saved in-progress edits, keyed by (workspace, user, draft_type, entity). Purely a UI convenience buffer -- not audited, not versioned; the underlying entity''s own save/version history is unaffected until the user commits.';

create index draft_saves_lookup_idx on public.draft_saves (workspace_id, user_id, draft_type, entity_id);

create trigger set_updated_at before update on public.draft_saves for each row execute function public.set_updated_at();

alter table public.draft_saves enable row level security;

create policy draft_saves_select on public.draft_saves for select using (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
create policy draft_saves_insert on public.draft_saves for insert with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
create policy draft_saves_update on public.draft_saves for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy draft_saves_delete on public.draft_saves for delete using (user_id = (select auth.uid()));
