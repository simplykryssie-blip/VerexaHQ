-- Lets an organizer field be tagged as capturing spouse or dependent
-- identity info (name/DOB/SSN/relationship), then automatically records
-- that as a client_relationships row -- labeled spouse or dependent -- the
-- moment the organizer response is submitted. Mirrors the existing
-- client_profile_field mechanism, but for a related person's identity
-- instead of the filer's own record.

alter table public.organizer_fields add column if not exists relationship_role text;

alter table public.organizer_fields
  add constraint organizer_fields_relationship_role_check
  check (relationship_role is null or relationship_role in (
    'spouse_full_name', 'spouse_dob', 'spouse_ssn',
    'dependent_full_name', 'dependent_dob', 'dependent_ssn',
    'dependent_relationship_type', 'dependent_relationship_other'
  ));

-- Provenance + idempotency: a resubmitted organizer response (or the same
-- submission trigger firing more than once) updates the relationship row it
-- already created instead of duplicating it. Null source_organizer_response_id
-- (every manually-added relationship) is unconstrained.
alter table public.client_relationships add column if not exists source_organizer_response_id uuid references public.organizer_responses(id) on delete set null;
alter table public.client_relationships add column if not exists source_instance_index integer;

create unique index client_relationships_organizer_source_idx
  on public.client_relationships (client_id, source_organizer_response_id, coalesce(source_instance_index, -1))
  where source_organizer_response_id is not null;

-- organizer_response_answers.value is jsonb holding whatever a client-side
-- coerceXAnswerToString() produced -- for most field types a plain JS string
-- (stored as a jsonb string scalar), for a "name" field a JSON-stringified
-- {first, middle, last, suffix} object (so the value is a jsonb string whose
-- *content* is itself JSON, not a jsonb object). These two helpers unwrap
-- either shape into plain text.
create or replace function public._organizer_scalar_text(p_value jsonb)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_value is null then null
    when jsonb_typeof(p_value) = 'string' then p_value #>> '{}'
    else p_value::text
  end;
$$;

create or replace function public._organizer_name_text(p_value jsonb)
returns text
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v_raw text := public._organizer_scalar_text(p_value);
  v_obj jsonb;
begin
  if v_raw is null or btrim(v_raw) = '' then
    return null;
  end if;
  begin
    v_obj := v_raw::jsonb;
  exception when others then
    return v_raw;
  end;
  if jsonb_typeof(v_obj) = 'object' then
    return nullif(btrim(concat_ws(' ', v_obj->>'first', nullif(v_obj->>'middle', ''), v_obj->>'last', nullif(v_obj->>'suffix', ''))), '');
  end if;
  return v_raw;
end;
$function$;

create or replace function public.sync_client_relationships_from_organizer_submission()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_spouse_name text;
  v_spouse_dob text;
  v_spouse_ssn text;
  r record;
begin
  if new.status <> 'submitted' or old.status is not distinct from 'submitted' or new.client_id is null then
    return new;
  end if;

  select
    max(case when of_.relationship_role = 'spouse_full_name' then public._organizer_name_text(ora.value) end),
    max(case when of_.relationship_role = 'spouse_dob' then public._organizer_scalar_text(ora.value) end),
    max(case when of_.relationship_role = 'spouse_ssn' then public._organizer_scalar_text(ora.value) end)
  into v_spouse_name, v_spouse_dob, v_spouse_ssn
  from public.organizer_response_answers ora
  join public.organizer_fields of_ on of_.id = ora.organizer_field_id
  where ora.organizer_response_id = new.id
    and of_.relationship_role in ('spouse_full_name', 'spouse_dob', 'spouse_ssn');

  if v_spouse_name is not null and btrim(v_spouse_name) <> '' then
    insert into public.client_relationships (
      client_id, workspace_id, relationship_type, related_name, related_dob,
      related_ssn_encrypted, related_ssn_last4, source_organizer_response_id, source_instance_index
    ) values (
      new.client_id, new.workspace_id, 'spouse', v_spouse_name,
      nullif(v_spouse_dob, '')::date,
      case when v_spouse_ssn is not null and btrim(v_spouse_ssn) <> '' then public.encrypt_client_secret(v_spouse_ssn) end,
      nullif(right(regexp_replace(coalesce(v_spouse_ssn, ''), '\D', '', 'g'), 4), ''),
      new.id, null
    )
    on conflict (client_id, source_organizer_response_id, coalesce(source_instance_index, -1)) where source_organizer_response_id is not null
    do update set
      related_name = excluded.related_name,
      related_dob = excluded.related_dob,
      related_ssn_encrypted = excluded.related_ssn_encrypted,
      related_ssn_last4 = excluded.related_ssn_last4,
      updated_at = now();
  end if;

  for r in
    select
      ora.instance_index,
      max(case when of_.relationship_role = 'dependent_full_name' then public._organizer_name_text(ora.value) end) as dep_name,
      max(case when of_.relationship_role = 'dependent_dob' then public._organizer_scalar_text(ora.value) end) as dep_dob,
      max(case when of_.relationship_role = 'dependent_ssn' then public._organizer_scalar_text(ora.value) end) as dep_ssn,
      max(case when of_.relationship_role = 'dependent_relationship_type' then public._organizer_scalar_text(ora.value) end) as dep_reltype,
      max(case when of_.relationship_role = 'dependent_relationship_other' then public._organizer_scalar_text(ora.value) end) as dep_relother
    from public.organizer_response_answers ora
    join public.organizer_fields of_ on of_.id = ora.organizer_field_id
    where ora.organizer_response_id = new.id
      and of_.relationship_role in ('dependent_full_name', 'dependent_dob', 'dependent_ssn', 'dependent_relationship_type', 'dependent_relationship_other')
    group by ora.instance_index
  loop
    if r.dep_name is null or btrim(r.dep_name) = '' then
      continue;
    end if;
    insert into public.client_relationships (
      client_id, workspace_id, relationship_type, related_name, related_dob,
      related_ssn_encrypted, related_ssn_last4, custom_relationship_title,
      source_organizer_response_id, source_instance_index
    ) values (
      new.client_id, new.workspace_id, 'dependent', r.dep_name,
      nullif(r.dep_dob, '')::date,
      case when r.dep_ssn is not null and btrim(r.dep_ssn) <> '' then public.encrypt_client_secret(r.dep_ssn) end,
      nullif(right(regexp_replace(coalesce(r.dep_ssn, ''), '\D', '', 'g'), 4), ''),
      case when r.dep_reltype = 'Other' then nullif(r.dep_relother, '') else r.dep_reltype end,
      new.id, r.instance_index
    )
    on conflict (client_id, source_organizer_response_id, coalesce(source_instance_index, -1)) where source_organizer_response_id is not null
    do update set
      related_name = excluded.related_name,
      related_dob = excluded.related_dob,
      related_ssn_encrypted = excluded.related_ssn_encrypted,
      related_ssn_last4 = excluded.related_ssn_last4,
      custom_relationship_title = excluded.custom_relationship_title,
      updated_at = now();
  end loop;

  return new;
end;
$function$;

create trigger trg_sync_relationships_from_organizer
after update of status on public.organizer_responses
for each row when (new.status = 'submitted' and old.status is distinct from 'submitted')
execute function public.sync_client_relationships_from_organizer_submission();

-- Mark the Form 1040 template's existing spouse/dependent fields with the
-- vocabulary above so real submissions start populating relationships
-- immediately, rather than only new templates built after this ships.
update public.organizer_fields set relationship_role = 'spouse_full_name' where id = '9cff8b5c-fdb7-44fe-92bf-fe939bd9e237';
update public.organizer_fields set relationship_role = 'dependent_full_name' where id = 'bfff3994-2ba8-4785-9cb1-17a08ab0adea';
update public.organizer_fields set relationship_role = 'dependent_dob' where id = 'f004aa17-d42f-4efc-813c-133aa76a9697';
update public.organizer_fields set relationship_role = 'dependent_ssn' where id = '505ae453-7080-4127-89c9-ea00960d7b98';
update public.organizer_fields set relationship_role = 'dependent_relationship_type' where id = '09f89530-e170-46cc-a714-fefa7e2bb914';
update public.organizer_fields set relationship_role = 'dependent_relationship_other' where id = '392344ce-6e30-4cf2-98eb-5ead838483f6';
