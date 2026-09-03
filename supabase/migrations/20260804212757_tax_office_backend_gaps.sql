-- Tax-specific attributes, kept off the module-agnostic engagements table
-- (engagements.comment already documents it stays module-agnostic so other
-- modules can attach later without a redesign -- same reasoning that
-- produced client_addresses/client_phones/etc as satellites of clients).
create table public.engagement_tax_details (
  engagement_id uuid primary key references public.engagements(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tax_year integer,
  return_type text,
  is_amended boolean not null default false,
  original_engagement_id uuid references public.engagements(id),
  is_extended boolean not null default false,
  extension_filed_date date,
  extension_due_date date,
  efile_status text not null default 'not_filed'
    check (efile_status in ('not_filed','ready_to_file','transmitted','accepted','rejected','paper_filed')),
  efile_transmitted_at timestamptz,
  efile_accepted_at timestamptz,
  efile_rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_engagement_tax_details_workspace on public.engagement_tax_details (workspace_id);
create index idx_engagement_tax_details_tax_year on public.engagement_tax_details (workspace_id, tax_year);

alter table public.engagement_tax_details enable row level security;
create policy engagement_tax_details_select on public.engagement_tax_details for select using (has_permission(workspace_id, 'engagements.view'));
create policy engagement_tax_details_insert on public.engagement_tax_details for insert with check (has_permission(workspace_id, 'engagements.manage'));
create policy engagement_tax_details_update on public.engagement_tax_details for update using (has_permission(workspace_id, 'engagements.manage'));
create policy engagement_tax_details_delete on public.engagement_tax_details for delete using (has_permission(workspace_id, 'engagements.manage'));

create trigger set_updated_at before update on public.engagement_tax_details for each row execute function public.set_updated_at();
create trigger audit_trigger after insert or update or delete on public.engagement_tax_details for each row execute function public.audit_trigger_fn();

-- IRS Notices: reuses the same polymorphic entity_type/entity_id convention
-- already used by notes/attachments/message_threads, so it can hang off a
-- client or a specific engagement without two separate tables.
create table public.irs_notices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('client','engagement')),
  entity_id uuid not null,
  notice_type text not null,
  notice_date date not null,
  response_due_date date,
  status text not null default 'open' check (status in ('open','responded','resolved','escalated')),
  description text,
  resolution_notes text,
  resolved_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_irs_notices_entity on public.irs_notices (entity_type, entity_id);
create index idx_irs_notices_workspace on public.irs_notices (workspace_id);
create index idx_irs_notices_due_date on public.irs_notices (response_due_date) where status = 'open';

alter table public.irs_notices enable row level security;
create policy irs_notices_select on public.irs_notices for select using (has_permission(workspace_id, 'engagements.view'));
create policy irs_notices_insert on public.irs_notices for insert with check (has_permission(workspace_id, 'engagements.manage'));
create policy irs_notices_update on public.irs_notices for update using (has_permission(workspace_id, 'engagements.manage'));
create policy irs_notices_delete on public.irs_notices for delete using (has_permission(workspace_id, 'engagements.manage'));

create trigger set_updated_at before update on public.irs_notices for each row execute function public.set_updated_at();
create trigger audit_trigger after insert or update or delete on public.irs_notices for each row execute function public.audit_trigger_fn();

create or replace function public.record_irs_notice_activity()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.activity_log (workspace_id, entity_type, entity_id, activity_type, description)
  values (new.workspace_id, new.entity_type, new.entity_id, 'irs_notice_received', 'IRS notice received: ' || new.notice_type);
  return new;
end;
$$;
revoke execute on function public.record_irs_notice_activity() from public, anon, authenticated;
create trigger trg_record_irs_notice_activity after insert on public.irs_notices for each row execute function public.record_irs_notice_activity();
