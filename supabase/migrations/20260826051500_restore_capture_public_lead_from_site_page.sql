-- Restores capture_public_lead_from_site_page, found missing from the live
-- database while regenerating types for an unrelated feature (Organizer
-- Review Workspace). This RPC backs the "Start Free Trial" lead-capture
-- form on the live Verexa marketing site (LeadFormSection.tsx). No
-- migration or schema change in this repo explains its absence -- every
-- table/function it depends on (site_pages, site_page_sections,
-- find_or_create_public_lead, _notify_admins_of_new_public_lead) is
-- unchanged and still present -- so this restores the function verbatim
-- from its last known-good definition in
-- 20260823230100_site_page_public_rpcs.sql.
--
-- Separately (not part of this migration -- flagged to the user, not
-- silently changed): the live "get-started" page's own trial-signup
-- section currently has section_type = 'organizer_form', a type
-- SectionRenderer.tsx doesn't recognize (falls through to `default: return
-- null`), so nothing calling this RPC is actually reachable on that page
-- right now regardless of the RPC's own presence. Restoring the RPC is
-- still correct on its own terms (LeadFormSection.tsx is real, working
-- code that other pages/sections could use), independent of that content
-- question.
create or replace function public.capture_public_lead_from_site_page(
  p_page_id uuid,
  p_section_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_service_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_service_id uuid;
begin
  select p.workspace_id into v_workspace_id
  from public.site_pages p
  join public.site_page_sections s on s.page_id = p.id
  where p.id = p_page_id and s.id = p_section_id and s.section_type = 'lead_form' and p.status = 'published';

  if v_workspace_id is null then
    raise exception 'This page is no longer available';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;

  v_client_id := public.find_or_create_public_lead(v_workspace_id, p_first_name, p_last_name, p_email, p_phone);

  foreach v_service_id in array coalesce(p_service_ids, array[]::uuid[])
  loop
    insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
    select v_client_id, v_workspace_id, s.service_category_id, s.id, 'public_site_page'
    from public.services s
    where s.id = v_service_id;
  end loop;

  perform public._notify_admins_of_new_public_lead(v_workspace_id, v_client_id);

  return jsonb_build_object('client_id', v_client_id);
end;
$function$;

revoke all on function public.capture_public_lead_from_site_page(uuid, uuid, text, text, text, text, uuid[]) from public;
grant execute on function public.capture_public_lead_from_site_page(uuid, uuid, text, text, text, text, uuid[]) to anon, authenticated;
