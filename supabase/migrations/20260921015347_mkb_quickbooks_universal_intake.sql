-- Reconcile the live MKB QuickBooks consultation organizer into the repository.
update public.organizer_templates
set
  name = 'QuickBooks Setup & Bookkeeping Consultation',
  description = 'Universal intake and lead qualification for MKB Financial Group''s QuickBooks setup, cleanup, training, and bookkeeping consultation services.'
where id = 'a5000000-0000-0000-0000-000000000001';

update public.organizer_fields set label='What type of business entity is your business?' where id='a6000000-0000-0000-0000-000000000006';
update public.organizer_fields set label='When was the business legally established?' where id='a6000000-0000-0000-0000-000000000008';
update public.organizer_fields set label='When do you expect the business to begin operating?' where id='a6000000-0000-0000-0000-000000000009';
update public.organizer_fields set label='What products or services does the business provide (or plan to provide)?' where id='91e90c1f-9d57-45e2-8a45-1e4e014d60f7';
update public.organizer_fields set label='How does the business receive or plan to receive payments?' where id='a6000010-0000-0000-0000-000000000000';
update public.organizer_fields set label='Which payment processor do you use or plan to use?' where id='a6000011-0000-0000-0000-000000000000';
update public.organizer_fields set label='Will the business have employees?' where id='a6000033-0000-0000-0000-000000000000';
update public.organizer_fields set label='Will the business use independent contractors?' where id='a6000035-0000-0000-0000-000000000000';
update public.organizer_fields set label='Do you currently work with a CPA, accountant, or tax professional?' where id='a600003c-0000-0000-0000-000000000000';
update public.organizer_fields set label='Will another tax professional prepare your business tax return?' where id='a600003d-0000-0000-0000-000000000000';
update public.organizer_fields set label='Would you like your accountant or tax professional to have QuickBooks access?' where id='a600003e-0000-0000-0000-000000000000';
update public.organizer_fields
set label='Would you like information about MKB Financial Group''s ongoing bookkeeping services?',
    help_text='If you would rather have MKB keep your books organized throughout the year, select Yes or Maybe and we''ll discuss the bookkeeping options that may fit your business.'
where id='a6000045-0000-0000-0000-000000000000';
update public.organizer_fields set label='What type of bookkeeping support would interest you?' where id='a6000046-0000-0000-0000-000000000000';
update public.organizer_fields set label='How involved would you like to be in your bookkeeping?' where id='a6000047-0000-0000-0000-000000000000';
update public.organizer_fields set label='I understand that I should not submit passwords, bank login credentials, Social Security numbers, account credentials, or other sensitive personal or financial information through this form.' where id='a600004a-0000-0000-0000-000000000000';

update public.organizer_fields set is_internal_only=true
where id in ('a600004b-0000-0000-0000-000000000000','8dc95aa4-1d93-4ebd-950d-d50a5605c468');

delete from public.organizer_fields
where id in (
  'a600000f-0000-0000-0000-000000000000',
  'a6000012-0000-0000-0000-000000000000',
  'a6000013-0000-0000-0000-000000000000',
  'a6000014-0000-0000-0000-000000000000',
  'a6000015-0000-0000-0000-000000000000',
  'a6000037-0000-0000-0000-000000000000'
);

create or replace function public.get_public_service_options(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_template_name text;
begin
  select ot.workspace_id, ot.name
    into v_workspace_id, v_template_name
  from public.organizer_templates ot
  where ot.public_token = p_token
    and ot.is_public = true
    and ot.status = 'published';

  if v_workspace_id is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', sc.id,
      'name', sc.name,
      'services', (
        select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.display_order), '[]'::jsonb)
        from public.services s
        where s.service_category_id = sc.id
          and s.status = 'published'
          and s.is_portal_visible = true
          and (s.workspace_id is null or s.workspace_id = v_workspace_id)
      )
    ) order by sc.display_order)
    from public.service_categories sc
    where (sc.workspace_id is null or sc.workspace_id = v_workspace_id)
      and (
        v_template_name <> 'QuickBooks Setup & Bookkeeping Consultation'
        or sc.name = 'QuickBooks & Bookkeeping'
      )
  ), '[]'::jsonb);
end;
$function$;