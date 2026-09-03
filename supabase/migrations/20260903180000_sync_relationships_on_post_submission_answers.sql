-- The spouse/dependent -> client_relationships sync (from
-- 20260817164457_wire_spouse_dependent_relationships_from_organizer.sql)
-- only ran once, at the moment an organizer response's status transitioned
-- into 'submitted'. That misses relationship-tagged answers saved *after*
-- submission -- which is now a real, legitimate pathway via the
-- reopened-field/correction flow (a staff member flags a question, the
-- client answers it, the response stays 'submitted'/'reviewed' throughout).
-- A client who answers their spouse's info via a correction never got a
-- Relationships row for it.
--
-- Fix: factor the existing spouse/dependent upsert logic out of the
-- status-transition trigger into a reusable function keyed by response id,
-- then also run it whenever a relationship-tagged answer is written on an
-- already-submitted (or reviewed) response.

create or replace function public.sync_client_relationships_for_response(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_response record;
  v_spouse_name text;
  v_spouse_dob text;
  v_spouse_ssn text;
  r record;
begin
  select id, client_id, workspace_id into v_response
  from public.organizer_responses
  where id = p_response_id;

  if v_response.client_id is null then
    return;
  end if;

  select
    max(case when of_.relationship_role = 'spouse_full_name' then public._organizer_name_text(ora.value) end),
    max(case when of_.relationship_role = 'spouse_dob' then public._organizer_scalar_text(ora.value) end),
    max(case when of_.relationship_role = 'spouse_ssn' then public._organizer_scalar_text(ora.value) end)
  into v_spouse_name, v_spouse_dob, v_spouse_ssn
  from public.organizer_response_answers ora
  join public.organizer_fields of_ on of_.id = ora.organizer_field_id
  where ora.organizer_response_id = v_response.id
    and of_.relationship_role in ('spouse_full_name', 'spouse_dob', 'spouse_ssn');

  if v_spouse_name is not null and btrim(v_spouse_name) <> '' then
    insert into public.client_relationships (
      client_id, workspace_id, relationship_type, related_name, related_dob,
      related_ssn_encrypted, related_ssn_last4, source_organizer_response_id, source_instance_index
    ) values (
      v_response.client_id, v_response.workspace_id, 'spouse', v_spouse_name,
      nullif(v_spouse_dob, '')::date,
      case when v_spouse_ssn is not null and btrim(v_spouse_ssn) <> '' then public.encrypt_client_secret(v_spouse_ssn) end,
      nullif(right(regexp_replace(coalesce(v_spouse_ssn, ''), '\D', '', 'g'), 4), ''),
      v_response.id, null
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
    where ora.organizer_response_id = v_response.id
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
      v_response.client_id, v_response.workspace_id, 'dependent', r.dep_name,
      nullif(r.dep_dob, '')::date,
      case when r.dep_ssn is not null and btrim(r.dep_ssn) <> '' then public.encrypt_client_secret(r.dep_ssn) end,
      nullif(right(regexp_replace(coalesce(r.dep_ssn, ''), '\D', '', 'g'), 4), ''),
      case when r.dep_reltype = 'Other' then nullif(r.dep_relother, '') else r.dep_reltype end,
      v_response.id, r.instance_index
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
end;
$function$;

create or replace function public.sync_client_relationships_from_organizer_submission()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if new.status <> 'submitted' or old.status is not distinct from 'submitted' or new.client_id is null then
    return new;
  end if;

  perform public.sync_client_relationships_for_response(new.id);

  return new;
end;
$function$;

-- Catches relationship-tagged answers written after the initial submission
-- (corrections / reopened-field responses on a response that's already
-- 'submitted' or 'reviewed'). Answers written before or during the first
-- submission are already covered by the status-transition trigger above,
-- so this is gated to skip 'not_started'/'in_progress' responses -- those
-- get swept in full once by that trigger when they first submit.
create or replace function public.sync_client_relationships_from_answer_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_relationship_role text;
  v_response_status text;
  v_client_id uuid;
begin
  select relationship_role into v_relationship_role
  from public.organizer_fields
  where id = new.organizer_field_id;

  if v_relationship_role is null then
    return new;
  end if;

  select status, client_id into v_response_status, v_client_id
  from public.organizer_responses
  where id = new.organizer_response_id;

  if v_response_status not in ('submitted', 'reviewed') or v_client_id is null then
    return new;
  end if;

  perform public.sync_client_relationships_for_response(new.organizer_response_id);

  return new;
end;
$function$;

create trigger trg_sync_relationships_from_answer_change
after insert or update of value on public.organizer_response_answers
for each row
execute function public.sync_client_relationships_from_answer_change();
