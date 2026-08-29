-- Same double-JSON-encoding bug class as the signature/file_upload fix in
-- 20260829002000, but for "name" and "address" organizer fields -- found by
-- checking whether the same bug pattern existed elsewhere after finding it
-- once. lib/organizer/formatValue.ts's parseNameValue/parseAddressValue doc
-- comments confirm this has always been the intended local-state shape
-- ("The name field's answer is stored as a JSON-stringified {first, middle,
-- last, suffix} object"), but that string was never un-stringified before
-- being sent to organizer_response_answers.value, so every name/address
-- organizer answer platform-wide has been stored as a jsonb *string*
-- containing JSON text, not a jsonb *object*. Confirmed live: 4 existing
-- rows platform-wide show this. This is worse than a storage nicety --
-- format_organizer_answer (used to build the permanent resolved_document_html
-- attached to every organizer's signature record) can't format a jsonb
-- string as a name/address, so it fell through to printing the raw JSON
-- text verbatim in the signed document, e.g. '{"first": "Marlon", "last":
-- "Taylor", ...}' instead of "Marlon Taylor".
--
-- Fixed three ways: format_organizer_answer now formats name/address
-- correctly whether the value is a proper object OR a double-encoded string
-- (so it renders correctly regardless of when the row was written); the
-- frontend (companion changes to PublicOrganizerForm.tsx and portal
-- OrganizerForm.tsx) stops double-encoding going forward; and existing
-- affected rows are backfilled to the correct object shape so any other
-- reader (not just this function) sees clean data too.

create or replace function public.format_organizer_answer(p_field_type text, p_value jsonb)
returns text
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v_text text;
  v_digits text;
  v_obj jsonb;
  v_street text;
  v_city_state text;
  v_city_state_zip text;
begin
  if p_value is null then
    return '--';
  end if;

  if p_field_type in ('ssn', 'ein') then
    v_digits := regexp_replace(coalesce(p_value #>> '{}', ''), '\D', '', 'g');
    if length(v_digits) >= 4 then
      return '••••' || right(v_digits, 4);
    end if;
    return 'on file';
  end if;

  if p_field_type in ('name', 'address') then
    v_obj := p_value;
    if jsonb_typeof(v_obj) = 'string' then
      begin
        v_obj := (v_obj #>> '{}')::jsonb;
      exception when others then
        v_obj := null;
      end;
    end if;

    if v_obj is not null and jsonb_typeof(v_obj) = 'object' then
      if p_field_type = 'name' then
        v_text := nullif(btrim(
          coalesce(v_obj->>'first', '') || ' ' || coalesce(nullif(v_obj->>'middle', ''), '') || ' ' ||
          coalesce(v_obj->>'last', '') || ' ' || coalesce(nullif(v_obj->>'suffix', ''), '')
        ), '');
        -- collapse any doubled spaces left by an empty middle/suffix
        if v_text is not null then
          v_text := regexp_replace(v_text, '\s+', ' ', 'g');
        end if;
        return v_text;
      else
        v_street := nullif(concat_ws(', ', nullif(v_obj->>'street', ''), nullif(v_obj->>'street2', '')), '');
        v_city_state := nullif(concat_ws(', ', nullif(v_obj->>'city', ''), nullif(v_obj->>'state', '')), '');
        v_city_state_zip := nullif(concat_ws(' ', nullif(v_city_state, ''), nullif(v_obj->>'zip', '')), '');
        return nullif(concat_ws(', ', v_street, v_city_state_zip), '');
      end if;
    end if;
    -- fall through to the generic string/plain-text handling below for a
    -- pre-structured-entry plain-text answer.
  end if;

  if jsonb_typeof(p_value) = 'string' then
    v_text := p_value #>> '{}';
  else
    v_text := p_value::text;
  end if;

  return nullif(v_text, '');
end;
$function$;

-- Only re-parse values that actually look like the JSON-encoded object --
-- parseNameValue/parseAddressValue treat anything else as legacy plain text
-- (a bare name typed before structured entry existed) and this backfill
-- preserves that distinction rather than corrupting it.
update public.organizer_response_answers a
set value = (a.value #>> '{}')::jsonb
from public.organizer_fields f
where f.id = a.organizer_field_id
  and f.field_type in ('name', 'address')
  and jsonb_typeof(a.value) = 'string'
  and btrim(a.value #>> '{}') ~ '^\{.*\}$';
