
-- The templates (document_request_templates/items) already existed, but
-- nothing tracked an actual request sent to a specific client/engagement --
-- "Request Documents" just posted a chat message referencing the
-- template. This is the missing instance-tracking layer: one row per
-- request sent, one row per requested item's fulfillment status.
create table public.document_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null default 'client',
  entity_id uuid not null,
  document_request_template_id uuid references public.document_request_templates(id),
  title text not null,
  due_date date,
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  created_by uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_request_item_statuses (
  id uuid primary key default gen_random_uuid(),
  document_request_id uuid not null references public.document_requests(id) on delete cascade,
  document_request_item_id uuid references public.document_request_items(id),
  name text not null,
  is_required boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'uploaded', 'waived')),
  fulfilled_by_attachment_id uuid references public.attachments(id),
  updated_at timestamptz not null default now()
);

create index idx_document_requests_entity on public.document_requests (entity_type, entity_id);
create index idx_document_requests_workspace on public.document_requests (workspace_id);
create index idx_document_requests_due_date on public.document_requests (due_date) where status = 'open';
create index idx_document_request_item_statuses_request on public.document_request_item_statuses (document_request_id);
create index idx_document_request_item_statuses_template_item on public.document_request_item_statuses (document_request_item_id);
create index idx_document_request_item_statuses_attachment on public.document_request_item_statuses (fulfilled_by_attachment_id);

alter table public.document_requests enable row level security;
alter table public.document_request_item_statuses enable row level security;

create policy document_requests_select on public.document_requests
  for select using (has_permission(workspace_id, 'documents.view'));
create policy document_requests_insert on public.document_requests
  for insert with check (has_permission(workspace_id, 'documents.request'));
create policy document_requests_update on public.document_requests
  for update using (has_permission(workspace_id, 'documents.request'));
create policy document_requests_delete on public.document_requests
  for delete using (has_permission(workspace_id, 'documents.request'));

create policy document_request_item_statuses_select on public.document_request_item_statuses
  for select using (exists (
    select 1 from public.document_requests r where r.id = document_request_item_statuses.document_request_id
      and has_permission(r.workspace_id, 'documents.view')
  ));
create policy document_request_item_statuses_insert on public.document_request_item_statuses
  for insert with check (exists (
    select 1 from public.document_requests r where r.id = document_request_item_statuses.document_request_id
      and has_permission(r.workspace_id, 'documents.request')
  ));
create policy document_request_item_statuses_update on public.document_request_item_statuses
  for update using (exists (
    select 1 from public.document_requests r where r.id = document_request_item_statuses.document_request_id
      and has_permission(r.workspace_id, 'documents.request')
  ));
create policy document_request_item_statuses_delete on public.document_request_item_statuses
  for delete using (exists (
    select 1 from public.document_requests r where r.id = document_request_item_statuses.document_request_id
      and has_permission(r.workspace_id, 'documents.request')
  ));

create trigger set_updated_at before update on public.document_requests
  for each row execute function public.set_updated_at();
create trigger audit_trigger after insert or update or delete on public.document_requests
  for each row execute function public.audit_trigger_fn();

-- Creates a request instance from a template, seeding one item-status row
-- per template item so completion % is trackable from the start.
create or replace function public.create_document_request(
  p_workspace_id uuid, p_entity_type text, p_entity_id uuid,
  p_template_id uuid, p_title text, p_due_date date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_request_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'documents.request') then
    raise exception 'insufficient permissions to request documents in this workspace';
  end if;

  insert into public.document_requests (workspace_id, entity_type, entity_id, document_request_template_id, title, due_date, created_by)
  values (p_workspace_id, p_entity_type, p_entity_id, p_template_id, p_title, p_due_date, auth.uid())
  returning id into v_request_id;

  insert into public.document_request_item_statuses (document_request_id, document_request_item_id, name, is_required)
  select v_request_id, id, name, is_required
  from public.document_request_items
  where document_request_template_id = p_template_id;

  return v_request_id;
end;
$$;

revoke execute on function public.create_document_request(uuid, text, uuid, uuid, text, date) from public, anon;
