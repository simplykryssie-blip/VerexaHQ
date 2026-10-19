-- Source-of-truth backfill. NOT a functional change and NOT a grant
-- change -- this function already exists, byte-for-byte, in production;
-- it was never captured by any CREATE FUNCTION statement in this
-- repository's migrations (confirmed via full migration-history and
-- repo-wide search during the SECURITY DEFINER authorization audit).
-- Does not exist on staging at all prior to this migration.
--
-- This is a legitimate public-facing lead-capture endpoint for the MKB
-- Financial Group marketing website. Its live caller is inline
-- JavaScript embedded in the published "Contact" page's database-stored
-- custom_html section (site_page_sections.config->>'html'), not
-- application code in this repository -- the page POSTs directly to
-- this RPC via the Supabase REST endpoint using the project's public/
-- publishable API key. anon and authenticated EXECUTE are therefore
-- both intentional and required; do not narrow them here or in any
-- follow-up to this migration.
--
-- Workspace scope is never caller-supplied: it is resolved strictly
-- from a join of p_page_id/p_section_id against published site_pages/
-- site_page_sections rows, so an arbitrary p_page_id/p_section_id pair
-- that doesn't resolve to a real published page simply fails with "This
-- form is no longer available" rather than operating on caller-chosen
-- data. A honeypot field and per-field length limits gate spam/abuse
-- before any write occurs. Delegates client creation to
-- find_or_create_public_lead (itself gated by Phase 3.2's
-- can_operate_client_book, transitively), then tags the resulting
-- client, optionally links a matching published service, and notifies
-- workspace admins via _notify_admins_of_new_public_lead.
CREATE OR REPLACE FUNCTION public.capture_public_mkb_business_inquiry(p_page_id uuid, p_section_id uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_business_name text DEFAULT NULL::text, p_business_stage text DEFAULT NULL::text, p_service_interest text DEFAULT NULL::text, p_message text DEFAULT NULL::text, p_honeypot text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_service_id uuid;
  v_existing_custom_fields jsonb;
  v_tag text;
begin
  if coalesce(btrim(p_honeypot), '') <> '' then
    return jsonb_build_object('accepted', false);
  end if;

  select p.workspace_id
    into v_workspace_id
  from public.site_pages p
  join public.site_page_sections s on s.page_id = p.id
  where p.id = p_page_id
    and s.id = p_section_id
    and p.status = 'published';

  if v_workspace_id is null then
    raise exception 'This form is no longer available';
  end if;

  if nullif(btrim(coalesce(p_first_name,'')), '') is null
     or nullif(btrim(coalesce(p_last_name,'')), '') is null
     or nullif(btrim(coalesce(p_email,'')), '') is null then
    raise exception 'First name, last name, and email are required';
  end if;

  if length(p_first_name) > 100 or length(p_last_name) > 100
     or length(p_email) > 320 or length(coalesce(p_phone,'')) > 50
     or length(coalesce(p_business_name,'')) > 200
     or length(coalesce(p_business_stage,'')) > 100
     or length(coalesce(p_service_interest,'')) > 100
     or length(coalesce(p_message,'')) > 5000 then
    raise exception 'One or more fields are too long';
  end if;

  v_client_id := public.find_or_create_public_lead(
    v_workspace_id,
    p_first_name,
    p_last_name,
    p_email,
    p_phone
  );

  select c.custom_fields into v_existing_custom_fields
  from public.clients c
  where c.id = v_client_id;

  update public.clients c
  set business_name = coalesce(nullif(btrim(p_business_name), ''), c.business_name),
      custom_fields = coalesce(v_existing_custom_fields, '{}'::jsonb) ||
        jsonb_build_object(
          'website_inquiry', jsonb_build_object(
            'business_stage', nullif(btrim(p_business_stage), ''),
            'service_interest', nullif(btrim(p_service_interest), ''),
            'message', nullif(btrim(p_message), ''),
            'submitted_at', now()
          )
        ),
      tags = array(
        select distinct x
        from unnest(coalesce(c.tags, '{}'::text[]) || array['Website Inquiry']) as x
        where x is not null and x <> ''
      )
  where c.id = v_client_id;

  select s.id
    into v_service_id
  from public.services s
  where s.workspace_id = v_workspace_id
    and s.status = 'published'
    and lower(s.name) = lower(nullif(btrim(p_service_interest), ''))
  limit 1;

  if v_service_id is not null then
    insert into public.client_service_interests
      (client_id, workspace_id, service_category_id, service_id, source)
    select v_client_id, v_workspace_id, s.service_category_id, s.id, 'public_website'
    from public.services s
    where s.id = v_service_id
      and not exists (
        select 1
        from public.client_service_interests csi
        where csi.client_id = v_client_id
          and csi.service_id = s.id
      );
  end if;

  perform public._notify_admins_of_new_public_lead(v_workspace_id, v_client_id);

  return jsonb_build_object(
    'accepted', true,
    'client_id', v_client_id
  );
end;
$function$;
