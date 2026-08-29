-- Phase 4 (deeper): accept_quote() hardcoded case_type = 'other' on every
-- engagement it creates, instead of deriving it from the service's category
-- the way the manual "New Engagement" flow does
-- (lib/caseType.ts's caseTypeFromCategorySlug, used by
-- app/(app)/engagements/new/NewEngagementForm.tsx via the create_engagement
-- RPC's p_case_type argument). Confirmed live: a quote for Summit's
-- "Bookkeeping" service (category slug 'bookkeeping') produced an engagement
-- with case_type = 'other' instead of 'bookkeeping'.
--
-- This isn't just a cosmetic mismatch -- components/workflows/
-- ConditionsEditor.tsx exposes engagement.case_type as a selectable
-- automation condition field (e.g. "if this is a tax_return engagement, do
-- X"), so any workspace with a case_type-based automation branch would have
-- it silently misfire for every engagement created via quote acceptance.
--
-- Fixed by replicating caseTypeFromCategorySlug's exact slug map in SQL,
-- looked up from the service's own category, rather than hardcoding a
-- value -- keeping accept_quote's classification in sync with the same
-- source of truth the manual flow already uses.

create or replace function public.accept_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quote public.quotes;
  v_service record;
  v_category_slug text;
  v_case_type text;
  v_engagement_id uuid;
begin
  select * into v_quote from public.quotes where id = p_quote_id;
  if v_quote.id is null then
    raise exception 'quote not found';
  end if;
  if not public.is_portal_user(v_quote.client_id) then
    raise exception 'not authorized to respond to this quote';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'this quote is no longer awaiting a response';
  end if;

  update public.quotes set status = 'accepted', accepted_at = now() where id = p_quote_id;

  if v_quote.engagement_id is null and v_quote.service_id is not null then
    select id, process_id, billing_rule_id into v_service
    from public.services
    where id = v_quote.service_id and (workspace_id is null or workspace_id = v_quote.workspace_id);

    if v_service.id is not null then
      select sc.slug into v_category_slug
      from public.services s
      join public.service_categories sc on sc.id = s.service_category_id
      where s.id = v_service.id;

      v_case_type := case v_category_slug
        when 'tax-preparation' then 'tax_return'
        when 'bookkeeping' then 'bookkeeping'
        when 'payroll' then 'payroll'
        when 'business-services' then 'business_service'
        else 'other'
      end;

      insert into public.engagements (workspace_id, client_id, service_id, workflow_id, billing_rule_id, case_type)
      values (v_quote.workspace_id, v_quote.client_id, v_service.id, v_service.process_id, v_service.billing_rule_id, v_case_type)
      returning id into v_engagement_id;

      if v_service.process_id is not null then
        perform public.start_pipeline_run('engagement', v_engagement_id, v_service.process_id);
      end if;

      update public.quotes set engagement_id = v_engagement_id where id = p_quote_id;
    end if;
  end if;

  perform public._notify_admins_of_quote_response(v_quote.workspace_id, v_quote.client_id, p_quote_id, 'accepted');
end;
$function$;
