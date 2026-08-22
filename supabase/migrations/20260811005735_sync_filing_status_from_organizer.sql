-- The organizer template's "Filing Status" dropdown already uses the exact
-- same five labels as engagement_tax_details.filing_status, but nothing
-- connected them. When a client's organizer response (attached to an
-- engagement) is submitted or reviewed, best-effort-copy their answer into
-- Tax Details -- but only fill a blank value, never overwrite a value staff
-- already set (matches this codebase's other autofill triggers, e.g.
-- sync_engagement_pipeline_from_stage).

create or replace function public.sync_filing_status_from_organizer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_answer_text text;
  v_mapped text;
begin
  if new.engagement_id is null then
    return new;
  end if;
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

  insert into public.engagement_tax_details (engagement_id, workspace_id, filing_status)
  values (new.engagement_id, new.workspace_id, v_mapped)
  on conflict (engagement_id) do update
    set filing_status = coalesce(public.engagement_tax_details.filing_status, excluded.filing_status);

  return new;
end;
$function$;

drop trigger if exists trg_sync_filing_status_from_organizer on public.organizer_responses;
create trigger trg_sync_filing_status_from_organizer
  after update of status on public.organizer_responses
  for each row execute function public.sync_filing_status_from_organizer();
