-- Completes 20261008090000_contact_lifecycle_decoupling.sql. Idempotent: safe on a
-- fresh build (where the earlier migration already ran in full) and on production,
-- where the data/function steps of that migration were applied in chunks and these
-- destructive steps remained.
--
-- Corrects one defect in the earlier migration: its search_clients replacement dropped
-- p_unassigned_only (used by the Contacts "Unassigned" staff filter) and its DROP
-- targeted a signature that production never had, which would have left the old
-- function in place as an ambiguous overload. Drop-old and create-new are in one
-- transaction so there is no window where a call is ambiguous or missing.

begin;

-- 1. Obsolete Lead/lifecycle triggers and functions.
drop trigger if exists trg_validate_client_lifecycle_status on public.clients;
drop trigger if exists trg_fire_lead_assigned_automations on public.clients;
drop trigger if exists trg_fire_lead_created_automations on public.clients;
drop trigger if exists trg_fire_lead_status_changed_automations on public.clients;
drop trigger if exists trg_fire_lead_updated_automations on public.clients;
drop trigger if exists trg_flip_lead_on_quote_acceptance on public.quotes;

drop function if exists public.validate_client_lifecycle_status();
drop function if exists public.fire_lead_assigned_automations();
drop function if exists public.fire_lead_created_automations();
drop function if exists public.fire_lead_status_changed_automations();
drop function if exists public.fire_lead_updated_automations();
drop function if exists public.flip_lead_on_quote_acceptance();
drop function if exists public.auto_start_lead_pipeline_on_create();
drop function if exists public.protect_entry_lead_stage();

-- 2. Generic tag automation must also fire when tags are present on Contact creation.
drop trigger if exists trg_fire_client_tag_automations on public.clients;
create trigger trg_fire_client_tag_automations
after insert or update of tags on public.clients
for each row execute function public.fire_client_tag_automations();

-- 3. Obsolete process flag.
alter table public.processes drop column if exists is_lead_funnel;

-- 4. search_clients: remove every prior signature, then create the single final one.
drop function if exists public.search_clients(
  uuid, text, text[], text, uuid, uuid, text, boolean, boolean, text, boolean, boolean, integer, integer, boolean
);
drop function if exists public.search_clients(
  uuid, text, text[], text, uuid, uuid, text, boolean, boolean, text, boolean, boolean, integer, integer
);
drop function if exists public.search_clients(
  uuid, text, text, uuid, uuid, text, boolean, boolean, text, boolean, boolean, integer, integer
);

create function public.search_clients(
  p_workspace_id uuid,
  p_query text default null,
  p_tag text default null,
  p_service_id uuid default null,
  p_assigned_staff_id uuid default null,
  p_pipeline_stage_name text default null,
  p_missing_documents boolean default null,
  p_outstanding_balance boolean default null,
  p_client_type text default null,
  p_has_email boolean default null,
  p_has_phone boolean default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_unassigned_only boolean default false
)
returns table(
  id uuid,
  client_type text,
  first_name text,
  last_name text,
  business_name text,
  primary_email text,
  primary_phone text,
  tags text[],
  total_count bigint
)
language plpgsql
stable security definer
set search_path = public
as $search$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  return query
  with matched as (
    select c.*
    from public.clients c
    where c.workspace_id = p_workspace_id
      and c.merged_into_client_id is null
      and (p_tag is null or p_tag = any(c.tags))
      and (p_assigned_staff_id is null or c.relationship_manager_id = p_assigned_staff_id)
      and (p_unassigned_only is not true or c.relationship_manager_id is null)
      and (p_client_type is null or c.client_type = p_client_type)
      and (p_has_email is null or p_has_email = (c.primary_email is not null))
      and (p_has_phone is null or p_has_phone = (c.primary_phone is not null))
      and (
        p_query is null or btrim(p_query) = '' or
        (coalesce(c.business_name, '') || ' ' || coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) ilike '%' || p_query || '%' or
        c.primary_email ilike '%' || p_query || '%' or
        c.primary_phone ilike '%' || p_query || '%' or
        c.ssn_last4 = p_query or
        c.ein_last4 = p_query or
        exists (
          select 1 from public.engagements e
          where e.client_id = c.id and e.engagement_number ilike '%' || p_query || '%'
        )
      )
      and (
        p_service_id is null or exists (
          select 1 from public.client_service_interests si where si.client_id = c.id and si.service_id = p_service_id
        ) or exists (
          select 1 from public.engagements e where e.client_id = c.id and e.service_id = p_service_id
        )
      )
      and (
        p_pipeline_stage_name is null or exists (
          select 1
          from public.pipeline_runs pr
          join public.pipeline_stages ps on ps.pipeline_run_id = pr.id and ps.id = pr.current_stage_id
          where pr.status = 'Active' and ps.stage_name = p_pipeline_stage_name
            and (
              (pr.entity_type = 'client' and pr.entity_id = c.id)
              or (pr.entity_type = 'engagement' and pr.entity_id in (select e2.id from public.engagements e2 where e2.client_id = c.id))
            )
        )
      )
      and (
        p_missing_documents is null or p_missing_documents = exists (
          select 1
          from public.document_request_item_statuses dris
          join public.document_requests dr on dr.id = dris.document_request_id
          where dris.is_required = true and dris.status = 'pending'
            and (
              (dr.entity_type = 'client' and dr.entity_id = c.id)
              or (dr.entity_type = 'engagement' and dr.entity_id in (select e3.id from public.engagements e3 where e3.client_id = c.id))
            )
        )
      )
      and (
        p_outstanding_balance is null or p_outstanding_balance = exists (
          select 1 from public.invoices inv
          where inv.client_id = c.id and inv.status not in ('paid', 'voided', 'cancelled') and inv.total_amount > inv.amount_paid
        )
      )
  )
  select matched.id, matched.client_type, matched.first_name, matched.last_name, matched.business_name,
    matched.primary_email::text, matched.primary_phone, matched.tags,
    count(*) over() as total_count
  from matched
  order by matched.created_at desc
  limit p_limit offset p_offset;
end;
$search$;

-- 5. Index without the removed column, then the column itself.
drop index if exists public.clients_workspace_idx;
create index clients_workspace_idx on public.clients (workspace_id, created_at desc);

alter table public.clients drop column if exists lifecycle_status;

-- 6. Final assertions.
do $assert$
begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and pg_get_functiondef(p.oid) ilike '%lifecycle_status%') then
    raise exception 'Migration incomplete: a public function still references lifecycle_status';
  end if;
  if exists (select 1 from public.automations where trigger_type like 'lead.%') then
    raise exception 'Migration incomplete: a Lead-specific automation trigger remains';
  end if;
  if exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal and pg_get_triggerdef(t.oid) ilike '%lifecycle_status%'
  ) then
    raise exception 'Migration incomplete: a trigger still references lifecycle_status';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clients' and column_name = 'lifecycle_status') then
    raise exception 'Migration incomplete: clients.lifecycle_status still exists';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'processes' and column_name = 'is_lead_funnel') then
    raise exception 'Migration incomplete: processes.is_lead_funnel still exists';
  end if;
  if (select count(*) from pg_proc where proname = 'search_clients' and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'Migration incomplete: search_clients must have exactly one signature';
  end if;
  if not exists (
    select 1 from pg_trigger where tgrelid = 'public.clients'::regclass and tgname = 'trg_fire_client_tag_automations'
      and pg_get_triggerdef(oid) ilike '%insert or update of tags%'
  ) then
    raise exception 'Migration incomplete: tag automation trigger must fire on insert and tag update';
  end if;
end;
$assert$;

commit;
