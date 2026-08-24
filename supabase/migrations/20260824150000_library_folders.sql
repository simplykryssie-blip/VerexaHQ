-- Pipelines, Workflows, Websites, and the two Templates libraries (Email &
-- SMS, and Form Templates) each render as one flat, growing list with no
-- way to group related items together. This adds a single generic
-- "library_folders" table -- one nested-folder tree per (workspace,
-- item_type) -- reused across all five lists instead of five bespoke
-- folder tables. Folders always sort alphabetically (no manual
-- display_order, unlike document_folders): the ask was "automatically in
-- ABC order", not staff-managed ordering.
--
-- item_type is kept at UI-surface granularity, not table granularity:
-- Email & SMS Templates (email_templates + sms_templates) share one tree
-- since they're one tab-switched page, and Form Templates
-- (engagement_letter_templates + organizer_templates) share another, for
-- the same reason. Pipeline/Workflow/Website each map to exactly one
-- table.
create table public.library_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  item_type text not null check (item_type in ('pipeline', 'workflow', 'website', 'email_sms_template', 'form_template')),
  parent_folder_id uuid references public.library_folders(id) on delete cascade,
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Same coalesce-to-sentinel trick as document_folders_unique_per_entity_name:
-- a plain unique index would never collide across top-level (null-parent)
-- folders, since Postgres treats every NULL as distinct.
create unique index library_folders_unique_per_scope_name
  on public.library_folders (workspace_id, item_type, coalesce(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create index library_folders_parent_idx on public.library_folders (parent_folder_id);

create trigger set_updated_at
  before update on public.library_folders
  for each row execute function public.set_updated_at();

alter table public.library_folders enable row level security;

create policy library_folders_select on public.library_folders
  for select using (public.is_workspace_member(workspace_id));

-- Same insert/update/delete predicate, mirrored three times: gate by
-- whichever existing "manage" permission already governs the underlying
-- item_type today, so a folder can't be created/renamed/deleted by
-- someone who couldn't touch the items inside it anyway. Templates has no
-- granular permission key of its own (its four tables are all gated by
-- is_workspace_admin), so folders over either template item_type use that
-- same check.
create policy library_folders_insert on public.library_folders
  for insert with check (
    public.is_workspace_member(workspace_id) and (
      (item_type = 'pipeline' and public.has_permission(workspace_id, 'pipelines.manage')) or
      (item_type = 'workflow' and public.has_permission(workspace_id, 'automations.manage')) or
      (item_type = 'website' and public.has_permission(workspace_id, 'site_pages.manage')) or
      (item_type in ('email_sms_template', 'form_template') and public.is_workspace_admin(workspace_id))
    )
  );

create policy library_folders_update on public.library_folders
  for update using (
    public.is_workspace_member(workspace_id) and (
      (item_type = 'pipeline' and public.has_permission(workspace_id, 'pipelines.manage')) or
      (item_type = 'workflow' and public.has_permission(workspace_id, 'automations.manage')) or
      (item_type = 'website' and public.has_permission(workspace_id, 'site_pages.manage')) or
      (item_type in ('email_sms_template', 'form_template') and public.is_workspace_admin(workspace_id))
    )
  );

create policy library_folders_delete on public.library_folders
  for delete using (
    public.is_workspace_member(workspace_id) and (
      (item_type = 'pipeline' and public.has_permission(workspace_id, 'pipelines.manage')) or
      (item_type = 'workflow' and public.has_permission(workspace_id, 'automations.manage')) or
      (item_type = 'website' and public.has_permission(workspace_id, 'site_pages.manage')) or
      (item_type in ('email_sms_template', 'form_template') and public.is_workspace_admin(workspace_id))
    )
  );

-- Deleting a folder deletes its subfolders (cascade, same as
-- document_folders' parent_folder_id) but only unlinks its items back to
-- the root (set null, same as attachments.folder_id) -- a folder is
-- purely organizational, never a reason to lose a pipeline/workflow/site/
-- template.
alter table public.processes add column folder_id uuid references public.library_folders(id) on delete set null;
alter table public.automations add column folder_id uuid references public.library_folders(id) on delete set null;
alter table public.site_websites add column folder_id uuid references public.library_folders(id) on delete set null;
alter table public.email_templates add column folder_id uuid references public.library_folders(id) on delete set null;
alter table public.sms_templates add column folder_id uuid references public.library_folders(id) on delete set null;
alter table public.engagement_letter_templates add column folder_id uuid references public.library_folders(id) on delete set null;
alter table public.organizer_templates add column folder_id uuid references public.library_folders(id) on delete set null;

create index processes_folder_idx on public.processes (folder_id);
create index automations_folder_idx on public.automations (folder_id);
create index site_websites_folder_idx on public.site_websites (folder_id);
create index email_templates_folder_idx on public.email_templates (folder_id);
create index sms_templates_folder_idx on public.sms_templates (folder_id);
create index engagement_letter_templates_folder_idx on public.engagement_letter_templates (folder_id);
create index organizer_templates_folder_idx on public.organizer_templates (folder_id);
