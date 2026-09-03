-- The missing instance layer for organizer_templates/organizer_fields --
-- same shape as document_requests/document_request_item_statuses: a
-- template defines the questions, this captures one client's actual
-- answers. Powers both the Tax Organizer workflow and the future Portal
-- Organizer API (client fills this in from the portal).
create table public.organizer_responses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  engagement_id uuid references public.engagements(id) on delete cascade,
  organizer_template_id uuid not null references public.organizer_templates(id),
  status text not null default 'not_started' check (status in ('not_started','in_progress','submitted','reviewed')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_organizer_responses_client on public.organizer_responses (client_id);
create index idx_organizer_responses_engagement on public.organizer_responses (engagement_id);
create index idx_organizer_responses_workspace on public.organizer_responses (workspace_id);

create table public.organizer_response_answers (
  id uuid primary key default gen_random_uuid(),
  organizer_response_id uuid not null references public.organizer_responses(id) on delete cascade,
  organizer_field_id uuid not null references public.organizer_fields(id) on delete cascade,
  value jsonb,
  updated_at timestamptz not null default now(),
  unique (organizer_response_id, organizer_field_id)
);
create index idx_organizer_response_answers_response on public.organizer_response_answers (organizer_response_id);

alter table public.organizer_responses enable row level security;
create policy organizer_responses_select on public.organizer_responses for select using (has_permission(workspace_id, 'engagements.view'));
create policy organizer_responses_insert on public.organizer_responses for insert with check (has_permission(workspace_id, 'engagements.manage'));
create policy organizer_responses_update on public.organizer_responses for update using (has_permission(workspace_id, 'engagements.manage'));
create policy organizer_responses_delete on public.organizer_responses for delete using (has_permission(workspace_id, 'engagements.manage'));

alter table public.organizer_response_answers enable row level security;
create policy organizer_response_answers_select on public.organizer_response_answers for select using (
  exists (select 1 from public.organizer_responses r where r.id = organizer_response_answers.organizer_response_id and has_permission(r.workspace_id, 'engagements.view'))
);
create policy organizer_response_answers_insert on public.organizer_response_answers for insert with check (
  exists (select 1 from public.organizer_responses r where r.id = organizer_response_answers.organizer_response_id and has_permission(r.workspace_id, 'engagements.manage'))
);
create policy organizer_response_answers_update on public.organizer_response_answers for update using (
  exists (select 1 from public.organizer_responses r where r.id = organizer_response_answers.organizer_response_id and has_permission(r.workspace_id, 'engagements.manage'))
);
create policy organizer_response_answers_delete on public.organizer_response_answers for delete using (
  exists (select 1 from public.organizer_responses r where r.id = organizer_response_answers.organizer_response_id and has_permission(r.workspace_id, 'engagements.manage'))
);

create trigger set_updated_at before update on public.organizer_responses for each row execute function public.set_updated_at();
create trigger audit_trigger after insert or update or delete on public.organizer_responses for each row execute function public.audit_trigger_fn();
create trigger audit_trigger after insert or update or delete on public.organizer_response_answers for each row execute function public.audit_trigger_fn();

-- Mirrors check_document_request_completion: flips to 'submitted' only via
-- explicit client/staff action (an RPC), not automatically on every answer
-- edit -- an organizer, unlike a document request, has no single
-- "complete" trigger condition to detect automatically.
create or replace function public.submit_organizer_response(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.organizer_responses where id = p_response_id;
  if v_workspace_id is null then
    raise exception 'organizer response not found';
  end if;
  update public.organizer_responses
  set status = 'submitted', submitted_at = now(), updated_at = now()
  where id = p_response_id;

  insert into public.activity_log (workspace_id, entity_type, entity_id, activity_type, description)
  select v_workspace_id, 'client', client_id, 'organizer_submitted', 'Tax organizer submitted'
  from public.organizer_responses where id = p_response_id;
end;
$$;
revoke execute on function public.submit_organizer_response(uuid) from public, anon;
