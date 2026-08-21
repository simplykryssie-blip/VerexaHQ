-- Per explicit product decision: no workspace's services/templates are
-- shared with any other workspace unless it's an ERO/Service Bureau
-- sharing with its own active downline (create_config_object_share /
-- accept_config_object_share, both already gated on firm_connections).
-- Two things violated that today:
--
-- 1. Five "shared" (workspace_id IS NULL) services -- Individual Tax Prep,
--    Business Tax Prep, Bookkeeping, Payroll, Business Services -- had their
--    organizer_template_id (and, for Individual Tax Prep, process_id) quietly
--    pointing at organizer templates/processes that actually belong to one
--    specific real firm, MKB Financial Group LLC (9d3e27c8-e7ed-4db0-a0ce-
--    9b2fa0fe23c7). Because these services were "published" and workspace_id
--    IS NULL, the engagement-creation query's `.or('workspace_id.is.null,...')`
--    fallback (app/(app)/engagements/new/page.tsx) surfaced them to every
--    workspace on the platform -- meaning any other firm picking "Bookkeeping"
--    would try to attach MKB's private, still-draft 122-field organizer to
--    their own engagement. Fix: since the organizer/process work was already
--    built specifically for MKB, make these five services MKB-owned (matching
--    what they already reference) instead of exposing them platform-wide.
--    Verified no naming collision: MKB currently has zero workspace-owned
--    services rows.
update public.services
set workspace_id = '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7'
where id in (
  '2ff9adce-8a62-4c39-acf5-f3e8e9f8ec68', -- Individual Tax Prep
  '48298c37-1684-4f32-8a27-bdd9b7152d4f', -- Business Tax Prep
  'adf4a24d-6035-431e-9f20-069dca699510', -- Bookkeeping
  'c82e5163-2f50-4f57-91dc-af5620b33a2d', -- Payroll
  '5ab5ef98-a2ae-4198-9d89-38f272717494'  -- Business Services
)
and workspace_id is null;

-- 2. service_categories (a plain taxonomy label -- "Tax Preparation",
--    "Bookkeeping", etc, no sensitive config) was also only ever seeded as a
--    single shared workspace_id-IS-NULL row per category, referenced directly
--    by every workspace. Give each workspace its own copy instead, same as
--    the other 4 preloaded-template tables below -- consistent with
--    is_valid_config_table already treating service_categories as a
--    per-workspace config object, and lets a firm rename/reorder its own
--    copy without touching anyone else's.
create or replace function public.copy_preloaded_templates_to_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.email_templates (workspace_id, name, slug, subject, body_html, status, category, merge_fields, schedule_rule)
  select p_workspace_id, name, slug, subject, body_html, status, category, merge_fields, schedule_rule
  from public.email_templates src
  where src.workspace_id is null
    and not exists (
      select 1 from public.email_templates own
      where own.workspace_id = p_workspace_id and own.slug = src.slug
    );

  insert into public.sms_templates (workspace_id, name, slug, body, status, merge_fields, schedule_rule)
  select p_workspace_id, name, slug, body, status, merge_fields, schedule_rule
  from public.sms_templates src
  where src.workspace_id is null
    and not exists (
      select 1 from public.sms_templates own
      where own.workspace_id = p_workspace_id and own.slug = src.slug
    );

  insert into public.organizer_templates (workspace_id, name, slug, description, status, requires_portal_signup, is_public)
  select p_workspace_id, name, slug, description, status, requires_portal_signup, is_public
  from public.organizer_templates src
  where src.workspace_id is null
    and not exists (
      select 1 from public.organizer_templates own
      where own.workspace_id = p_workspace_id and own.slug = src.slug
    );

  insert into public.engagement_letter_templates (workspace_id, name, slug, body_html, status, requires_signature, requires_portal_signup, is_public, merge_fields)
  select p_workspace_id, name, slug, body_html, status, requires_signature, requires_portal_signup, is_public, merge_fields
  from public.engagement_letter_templates src
  where src.workspace_id is null
    and not exists (
      select 1 from public.engagement_letter_templates own
      where own.workspace_id = p_workspace_id and own.slug = src.slug
    );

  insert into public.service_categories (workspace_id, name, slug, display_order)
  select p_workspace_id, name, slug, display_order
  from public.service_categories src
  where src.workspace_id is null
    and not exists (
      select 1 from public.service_categories own
      where own.workspace_id = p_workspace_id and own.slug = src.slug
    );
end;
$$;

revoke all on function public.copy_preloaded_templates_to_workspace(uuid) from public, anon, authenticated;

-- Backfill: every workspace that already exists gets its own category copies
-- too (the other 4 tables are already backfilled and no-op here via the
-- not-exists guards above).
do $$
declare
  ws record;
begin
  for ws in select id from public.workspaces loop
    perform public.copy_preloaded_templates_to_workspace(ws.id);
  end loop;
end $$;
