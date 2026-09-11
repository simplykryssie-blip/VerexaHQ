-- Per-user "star" / favorite on list items across Form Templates, Workflows,
-- Pipelines, Websites (and easy to extend to more later) -- one shared table
-- keyed by (user, entity_type, entity_id) rather than an is_starred column
-- on every individual table, so a single StarButton component and a single
-- RLS policy pair cover every entity type without a migration per surface.
create table if not exists starred_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'organizer_template',
    'engagement_letter_template',
    'document_request_template',
    'automation',
    'pipeline',
    'website'
  )),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);

create index if not exists starred_items_user_workspace_type_idx
  on starred_items (user_id, workspace_id, entity_type);

alter table starred_items enable row level security;

-- A star is purely personal state -- a user can only ever see or change
-- their own rows. No workspace-membership check needed beyond that: the
-- entity itself is already access-controlled by its own table's RLS, so a
-- stray star row for something the user can no longer see is harmless and
-- just won't resolve to a visible card.
create policy "starred_items_select_own" on starred_items
  for select using (user_id = auth.uid());

create policy "starred_items_insert_own" on starred_items
  for insert with check (user_id = auth.uid());

create policy "starred_items_delete_own" on starred_items
  for delete using (user_id = auth.uid());
