-- The `pipelines`/`pipeline_stages` tables already existed in this project
-- (workspace_id/name/slug/description/status on pipelines; pipeline_id/
-- name/display_order/color/is_terminal on stages) with full RLS already in
-- place (is_workspace_admin() gates writes, is_workspace_member() gates
-- reads, plus workspace_id IS NULL for a shared/system pipeline concept
-- mirroring organizer_templates) -- but zero rows and no engagement link,
-- so nothing in the app could ever use them. This finishes the wiring:
-- an engagement can optionally sit in one pipeline stage, orthogonal to
-- engagements.status (the fixed 12-state Status Engine, left untouched).

alter table public.engagements
  add column pipeline_id uuid references public.pipelines(id) on delete set null,
  add column pipeline_stage_id uuid references public.pipeline_stages(id) on delete set null;

create index engagements_pipeline_idx on public.engagements(pipeline_id);
create index engagements_pipeline_stage_idx on public.engagements(pipeline_stage_id);

-- A stage always belongs to the same pipeline recorded on the engagement --
-- self-healing on write rather than rejecting, matching this app's existing
-- best-effort consistency pattern (e.g. fulfill_document_request_item's
-- folder filing).
create or replace function public.sync_engagement_pipeline_from_stage()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.pipeline_stage_id is not null then
    select pipeline_id into new.pipeline_id from public.pipeline_stages where id = new.pipeline_stage_id;
  end if;
  return new;
end;
$$;

create trigger trg_sync_engagement_pipeline_from_stage
  before insert or update of pipeline_stage_id on public.engagements
  for each row execute function public.sync_engagement_pipeline_from_stage();

-- Idempotent: called on first visit to /pipelines so the page is never
-- empty, mirroring ensure_workspace_security_policy/ensure_default_dashboard.
create or replace function public.ensure_default_pipeline(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pipeline_id uuid;
begin
  if exists (select 1 from public.pipelines where workspace_id = p_workspace_id) then
    return;
  end if;

  insert into public.pipelines (workspace_id, name, slug, status)
  values (p_workspace_id, 'My Pipeline', 'my_pipeline', 'published')
  returning id into v_pipeline_id;

  insert into public.pipeline_stages (pipeline_id, name, display_order, is_terminal)
  values
    (v_pipeline_id, 'New', 0, false),
    (v_pipeline_id, 'In Progress', 1, false),
    (v_pipeline_id, 'Review', 2, false),
    (v_pipeline_id, 'Done', 3, true);
end;
$$;

revoke all on function public.ensure_default_pipeline(uuid) from public, anon;
grant execute on function public.ensure_default_pipeline(uuid) to authenticated;
