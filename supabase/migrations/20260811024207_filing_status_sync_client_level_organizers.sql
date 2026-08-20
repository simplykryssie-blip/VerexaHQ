-- sync_filing_status_from_organizer only fired for organizers tied to a
-- specific engagement_id -- but Send Organizer from the client card (the
-- more commonly used path) never sets one, so Tax Details never got
-- pre-filled for those. Extend it: when engagement_id is null, apply the
-- client's Filing Status answer to every one of their still-open
-- engagements instead of doing nothing. coalesce still protects any
-- engagement where staff already set a filing status by hand -- that part
-- was already correct and stays unchanged.

create or replace function public.sync_filing_status_from_organizer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_answer_text text;
  v_mapped text;
  v_engagement_id uuid;
begin
  if new.status not in ('submitted', 'reviewed') or old.status = new.status then
    return new;
  end if;

  select ora.value #>> '{}'
  into v_answer_text
  from public.organizer_response_answers ora
  join public.organizer_fields ofl on ofl.id = ora.organizer_field_id
  where ora.organizer_response_id = new.id
    and lower(ofl.label) = 'filing status'
  order by ora.instance_index
  limit 1;

  if v_answer_text is null then
    return new;
  end if;

  v_mapped := case v_answer_text
    when 'Single' then 'single'
    when 'Married Filing Jointly' then 'mfj'
    when 'Married Filing Separately' then 'mfs'
    when 'Head of Household' then 'hoh'
    when 'Qualifying Surviving Spouse' then 'qss'
    else null
  end;

  if v_mapped is null then
    return new;
  end if;

  if new.engagement_id is not null then
    insert into public.engagement_tax_details (engagement_id, workspace_id, filing_status)
    values (new.engagement_id, new.workspace_id, v_mapped)
    on conflict (engagement_id) do update
      set filing_status = coalesce(public.engagement_tax_details.filing_status, excluded.filing_status);
    return new;
  end if;

  for v_engagement_id in
    select id from public.engagements
    where client_id = new.client_id
      and status not in ('Completed', 'Archived')
  loop
    insert into public.engagement_tax_details (engagement_id, workspace_id, filing_status)
    values (v_engagement_id, new.workspace_id, v_mapped)
    on conflict (engagement_id) do update
      set filing_status = coalesce(public.engagement_tax_details.filing_status, excluded.filing_status);
  end loop;

  return new;
end;
$function$;
