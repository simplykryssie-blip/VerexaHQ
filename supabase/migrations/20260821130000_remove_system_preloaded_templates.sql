-- Per explicit, repeated product direction: no workspace gets ANY preloaded
-- content -- not email/sms templates, not organizer templates, not service
-- categories, not pipelines, not automations. Every workspace builds (or
-- receives via explicit ERO/SB downline share) its own content from a
-- completely empty starting point. This finishes that direction. Before
-- deleting anything, every real reference to a shared (workspace_id IS
-- NULL) services/service_categories row was enumerated and repointed at a
-- workspace-owned equivalent -- found via a full sweep of every FK that
-- targets those two tables (services.service_category_id,
-- client_service_interests x2, engagements.service_id,
-- organizer_service_routes.service_id, quotes.service_id,
-- organizer_responses.resolved_service_id, services.cloned_from_service_id):
--
-- - 5 of MKB Financial Group's own services (Individual Tax Prep, Business
--   Tax Prep, Bookkeeping, Payroll, Business Services) still pointed
--   service_category_id at the shared category row instead of MKB's own
--   copy (already existed, from the earlier per-workspace category sweep).
-- - One MKB service's cloned_from_service_id (pure provenance, not needed
--   for anything to function) pointed at a shared service being deleted.
-- - One real lead's client_service_interests row (Doucet Financial Group)
--   and one real engagement (also Doucet) both referenced the shared
--   "individual-return-current-year" service directly -- Doucet gets its
--   own copy of that specific service, and both rows are repointed at it.
--
-- 1. Backfills the 3 email templates Verexa HQ CRM was missing its own copy
--    of (appointment-reminder, automation-staff-notification,
--    portal-invite-email -- the last one carries the real portal activation
--    link the lead-welcome workflow's invite_to_portal step depends on).
--    Every other real workspace and every sms_templates/service_categories
--    slug were already fully covered -- verified before writing this.
-- 2. Deletes every remaining workspace_id IS NULL row across
--    service_categories, services, email_templates, and sms_templates --
--    organizer_templates, engagement_letter_templates, processes,
--    automations, document_request_templates, document_folder_templates,
--    pricing_rules, billing_rules, and dashboards already have zero
--    null-workspace rows, confirmed before writing this migration.
-- 3. Stops copy_preloaded_templates_to_workspace from ever running again --
--    removes its call from create_workspace() and drops the function, since
--    a brand-new workspace should now start with nothing.
do $$
declare
  v_hq_workspace_id uuid := '74321fb2-9a18-4625-ab12-01c98e888667';
  v_doucet_workspace_id uuid := '0867bbc5-e62b-4217-8bad-11351c24def5';
  v_doucet_category_id uuid;
  v_doucet_service_id uuid;
begin
  insert into public.email_templates (workspace_id, name, slug, subject, body_html, status, category, merge_fields, schedule_rule)
  select v_hq_workspace_id, name, slug, subject, body_html, status, category, merge_fields, schedule_rule
  from public.email_templates
  where workspace_id is null and slug in ('appointment-reminder', 'automation-staff-notification', 'portal-invite-email');

  -- Every real workspace-owned service pointing at a shared category ->
  -- repoint at that same workspace's own copy of the category (matched by
  -- slug, which every workspace already has from the earlier sweep).
  update public.services s
  set service_category_id = own_cat.id
  from public.service_categories shared_cat, public.service_categories own_cat
  where s.service_category_id = shared_cat.id
    and shared_cat.workspace_id is null
    and own_cat.slug = shared_cat.slug
    and own_cat.workspace_id = s.workspace_id
    and s.workspace_id is not null;

  -- Pure lineage marker, nothing depends on it existing.
  update public.services set cloned_from_service_id = null
  where cloned_from_service_id in (select id from public.services where workspace_id is null);

  select id into v_doucet_category_id from public.service_categories where workspace_id = v_doucet_workspace_id and slug = 'tax-preparation';

  insert into public.services (workspace_id, service_category_id, name, slug, status, display_order, is_bookable, is_portal_visible, requires_organizer, requires_engagement_letter, requires_documents, requires_signature, requires_review, requires_invoice, requires_payment_before_release)
  select v_doucet_workspace_id, v_doucet_category_id, name, slug, status, display_order, is_bookable, is_portal_visible, requires_organizer, requires_engagement_letter, requires_documents, requires_signature, requires_review, requires_invoice, requires_payment_before_release
  from public.services
  where workspace_id is null and slug = 'individual-return-current-year'
  returning id into v_doucet_service_id;

  update public.client_service_interests
  set service_category_id = v_doucet_category_id, service_id = v_doucet_service_id
  where service_category_id in (select id from public.service_categories where workspace_id is null)
     or service_id in (select id from public.services where workspace_id is null);

  update public.engagements
  set service_id = v_doucet_service_id
  where service_id in (select id from public.services where workspace_id is null);
end $$;

delete from public.service_categories where workspace_id is null;
delete from public.services where workspace_id is null;
delete from public.email_templates where workspace_id is null;
delete from public.sms_templates where workspace_id is null;

create or replace function public.create_workspace(p_name text, p_workspace_type text default 'independent_ptin'::text, p_timezone text default 'America/New_York'::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_owner_role_id uuid;
  v_slug text;
  v_suffix int := 0;
begin
  if auth.uid() is null then
    raise exception 'create_workspace requires an authenticated user';
  end if;

  select id into v_owner_role_id from public.roles where workspace_id is null and slug = 'owner';
  if v_owner_role_id is null then
    raise exception 'system owner role is not seeded';
  end if;

  v_slug := regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  if v_slug = '' then
    v_slug := 'workspace';
  end if;
  while exists (select 1 from public.workspaces where slug = v_slug || case when v_suffix = 0 then '' else '-' || v_suffix end) loop
    v_suffix := v_suffix + 1;
  end loop;
  if v_suffix > 0 then
    v_slug := v_slug || '-' || v_suffix;
  end if;

  insert into public.workspaces (name, slug, workspace_type, timezone, created_by, primary_contact_email)
  values (p_name, v_slug, p_workspace_type, p_timezone, auth.uid(), (select email from auth.users where id = auth.uid()))
  returning id into v_workspace_id;

  insert into public.workspace_users (workspace_id, user_id, role_id, is_owner, status, joined_at)
  values (v_workspace_id, auth.uid(), v_owner_role_id, true, 'active', now());

  insert into public.branding (workspace_id, display_name)
  values (v_workspace_id, p_name);

  insert into public.workspace_feature_flags (workspace_id, feature_flag_id, is_enabled)
  select v_workspace_id, id, true from public.feature_flags where is_core;

  insert into public.lead_stages (workspace_id, key, label, display_order, is_entry_stage)
  values
    (v_workspace_id, 'lead', 'Lead', 0, true),
    (v_workspace_id, 'consult_scheduled', 'Consult Scheduled', 1, false),
    (v_workspace_id, 'proposal_sent', 'Proposal Sent', 2, false);

  update public.user_profiles set default_workspace_id = v_workspace_id
  where id = auth.uid() and default_workspace_id is null;

  return v_workspace_id;
end;
$function$;

drop function if exists public.copy_preloaded_templates_to_workspace(uuid);
