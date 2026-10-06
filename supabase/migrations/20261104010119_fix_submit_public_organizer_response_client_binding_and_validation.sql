-- F-03 / F-04 (Verexa Complete System Audit, 2026-10-01 / P05-01 / P05-02):
-- submit_public_organizer_response() trusted a caller-supplied p_client_id
-- (via `coalesce(p_client_id, find_or_create_public_lead(...))`) with no
-- check that it related to the submitter's own email/phone at all -- only
-- that the id belonged to the token's workspace. A token holder who knew
-- (or, realistically, who simply typed in) another same-workspace client's
-- email/phone at the earlier Contact step could already have that client's
-- real id handed back to them by capture_public_lead_from_contact_step's
-- own find_or_create_public_lead() lookup, then submit an organizer
-- response -- including a signature that gets auto-finalized by
-- resolve_and_sign_organizer_response() as a 'completed'/'signed' document
-- -- attributed to that other client, not themselves.
--
-- This exact defect shape, in the sibling submit_public_organizer_response_
-- with_signup(), was already identified and fixed by migration
-- 20260929234503_fix_public_organizer_portal_authorization.sql (PR #348):
-- "p_client_id is no longer trusted ... the client is always (re-)derived
-- via find_or_create_public_lead() from the submitter's own email/phone."
-- That migration's own scope note lists exactly which functions it
-- touched, and submit_public_organizer_response (the non-signup variant --
-- the more commonly used path) was not one of them. This migration applies
-- the identical, already-proven fix to it.
--
-- F-04 (bundled here because it's the same function and the same
-- investigation, not because the two fixes depend on each other): the
-- answers-insertion loop checked only that each answer's field_id belonged
-- to this template, with no required/conditional/type enforcement --
-- client-side-only validation (PublicOrganizerForm.tsx's
-- unmetRequiredOnCurrentPage/invalidTaxIdOnCurrentPage/shouldShowField) is
-- trivially bypassed by a direct RPC call. Added, scoped narrowly:
--   1. Required-field validation for TOP-LEVEL fields only (parent_field_id
--      is null) of a type that can actually hold a scalar answer (excludes
--      section/rich_text/repeating_section, and the repeating_section
--      container itself) -- raises if is_required and no non-blank answer
--      was submitted for a VISIBLE field (see #2).
--   2. Conditional (show_if) visibility, evaluated server-side against the
--      submitted answers using the exact same operator semantics as
--      lib/organizer/conditionalLogic.ts's parseConditionalLogic/
--      shouldShowField (equals/not_equals/includes/not_includes/
--      is_answered/is_blank; match "all"/"any"). A field whose show_if
--      evaluates to false is treated as hidden: its required-ness is not
--      enforced, and -- explicit documented choice -- any answer submitted
--      for it anyway is silently DROPPED, not inserted into
--      organizer_response_answers and not persisted anywhere, rather than
--      rejecting the whole submission. This is deliberately the less
--      disruptive of the two options the investigation considered, and
--      matches how _propose_client_field_from_organizer_answer already
--      no-ops on a null/missing value downstream.
--   3. SSN/EIN format validation consistent with the app's own
--      isValidTaxId() (lib/taxIds.ts): a non-blank value must be exactly 9
--      digits once non-digit characters are stripped; a blank value always
--      passes (required-ness, if any, is enforced separately by #1).
--   4. Signature-field shape validation: a non-null submitted value for a
--      'signature'-typed field must be a jsonb object with a non-blank
--      typed_name -- rejecting a malformed shape here, rather than letting
--      it silently reach resolve_and_sign_organizer_response() (which
--      already no-ops on a malformed signature answer, but only after it
--      has been persisted as if valid).
--
-- Human-review correction: the first version of this migration computed
-- each field's show_if visibility by reading v_answer_text_by_field, then
-- DELETED that field's own entry from the same map once found hidden. For
-- a field B whose show_if references field A, this made B's computed
-- visibility depend on whether A had already been processed (and
-- scrubbed) in the same loop -- i.e. on PostgreSQL's unspecified row
-- iteration order over organizer_fields, not on anything meaningful. Live
-- production data confirmed this was a real, not just theoretical, risk:
-- 212 field pairs exist where a field's show_if references another field
-- that itself has show_if logic, 4 of them required, on a real template
-- ("2027 INDIVIDUAL/SCH C INTAKE FORM" -- "Do you need to add a spouse"
-- gating "Did you file with this spouse last year?"/"Name"/"Spouse
-- SSN/ITIN"/"Spouse Date of Birth"). Fixed below: v_answer_text_by_field
-- is now built once and never written to again -- every field's
-- visibility is a pure function of the original submission, independent
-- of any other field's outcome or of iteration order. A field found
-- hidden is instead recorded in a separate v_hidden_field_ids set, applied
-- only afterward, when deciding what to persist -- never fed back into
-- visibility evaluation itself.
--
-- Two narrower shapes this migration still does not attempt to handle,
-- left as explicit, documented compatibility considerations rather than
-- expanding scope -- live production data has zero rows matching either,
-- so neither is a current regression, only a latent one if such data is
-- ever introduced:
--   - A field's conditional_logic using the CLIENT's legacy pre-multi-
--     condition shape (a bare {field_id, operator, value} rule with no
--     show_if.conditions wrapper -- see parseConditionalLogic's own
--     "Legacy shape" branch) is not recognized by the check below
--     (jsonb_typeof(v_cond -> 'conditions') = 'array' is false for it) and
--     so fails open to "visible", same as having no conditional_logic at
--     all. parseConditionalLogic would correctly evaluate it. If such a
--     row is ever required AND legacy-shaped, this would raise a false
--     "Please answer" the client itself would not have asked for.
--   - The required-field type filter below excludes
--     section/rich_text/repeating_section but not page_break -- a
--     page_break field marked is_required=true (not something the
--     builder UI is expected to produce, and not present in any current
--     row) would be treated as an answerable required field and always
--     fail, since nothing ever submits an answer for a pagination marker.
--
-- Deliberately NOT in scope, and left for a future pass if ever prioritized:
--   - Per-instance conditional logic / required-ness for repeating_section
--     CHILD fields (PublicRepeatingSection evaluates each child's show_if
--     against its own row, not the top-level `answers` map this migration
--     validates against -- a materially different, per-row evaluation this
--     migration does not attempt to replicate server-side).
--   - submit_public_organizer_response_with_signup() -- already fixed for
--     F-03 by PR #348, and not touched here; confirmed unchanged by this
--     migration's own test suite.
--   - Any RLS policy, grant, table, or other organizer function.

create or replace function public.submit_public_organizer_response(
  p_token uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_answers jsonb,
  p_client_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_template_id uuid;
  v_client_id uuid;
  v_client_name text;
  v_response_id uuid;
  v_answer jsonb;
  v_signature_request_id uuid;
  v_field record;
  v_answer_text_by_field jsonb := '{}'::jsonb;
  v_submitted_field_ids jsonb := '{}'::jsonb;
  v_hidden_field_ids jsonb := '{}'::jsonb;
  v_raw_value jsonb;
  v_raw_text text;
  v_visible boolean;
  v_cond jsonb;
  v_match_mode text;
  v_rule jsonb;
  v_rule_result boolean;
  v_group_result boolean;
  v_group_started boolean;
  v_rule_field_text text;
  v_rule_field_array text[];
  v_answered boolean;
  v_digits text;
  v_answer_field_type text;
  v_answer_field_label text;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;

  select id, workspace_id into v_template_id, v_workspace_id
  from public.organizer_templates
  where public_token = p_token and is_public = true and status = 'published';

  if v_template_id is null then
    raise exception 'This link is no longer available';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  -- F-03 fix: p_client_id is accepted on the signature only for backward
  -- compatibility with the current frontend (which may still send it) --
  -- its value is never used to pick the client. The client is always
  -- (re-)derived from the submitter's own contact details, exactly like
  -- every other public capture path in this app already does.
  v_client_id := public.find_or_create_public_lead(v_workspace_id, p_first_name, p_last_name, p_email, p_phone);
  v_client_name := btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));

  -- Build a flat field_id -> plain-text-answer map (instance_index = 0
  -- only -- the same scope lib/organizer/conditionalLogic.ts's `answers`
  -- state covers; repeating_section rows are a separate state the client
  -- never conditions top-level fields on) and a set of every field_id that
  -- has an answer at ANY instance_index (used for required-ness, including
  -- "does this repeating_section have at least one row").
  for v_answer in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    if v_answer->>'field_id' is not null then
      v_submitted_field_ids := v_submitted_field_ids || jsonb_build_object(v_answer->>'field_id', true);
      if coalesce((v_answer->>'instance_index')::int, 0) = 0 then
        v_raw_value := v_answer->'value';
        v_raw_text := case
          when v_raw_value is null or jsonb_typeof(v_raw_value) = 'null' then ''
          when jsonb_typeof(v_raw_value) = 'string' then coalesce(v_raw_value #>> '{}', '')
          else coalesce(v_raw_value #>> '{}', '')
        end;
        v_answer_text_by_field := v_answer_text_by_field || jsonb_build_object(v_answer->>'field_id', v_raw_text);
      end if;
    end if;
  end loop;

  -- F-04: required-field + conditional-visibility validation, top-level
  -- fields only (see migration header for exact scope).
  for v_field in
    select f.id, f.label, f.is_required, f.conditional_logic
    from public.organizer_fields f
    where f.organizer_template_id = v_template_id
      and f.parent_field_id is null
      and f.field_type not in ('section', 'rich_text', 'repeating_section')
  loop
    v_visible := true;
    v_cond := coalesce(v_field.conditional_logic, '{}'::jsonb) -> 'show_if';
    if v_cond is not null and jsonb_typeof(v_cond) = 'object'
       and jsonb_typeof(v_cond -> 'conditions') = 'array'
       and jsonb_array_length(v_cond -> 'conditions') > 0 then
      v_match_mode := case when v_cond->>'match' = 'any' then 'any' else 'all' end;
      v_group_result := false;
      v_group_started := false;
      for v_rule in select * from jsonb_array_elements(v_cond -> 'conditions')
      loop
        if v_rule->>'field_id' is null or v_rule->>'operator' is null then
          continue;
        end if;
        -- Always reads from the original, never-mutated submission
        -- snapshot -- field B's visibility, when B's show_if references
        -- field A, depends only on what A was actually submitted as,
        -- never on whether A itself was separately computed visible or
        -- hidden, and never on which order organizer_fields happens to be
        -- iterated in.
        v_rule_field_text := coalesce(v_answer_text_by_field ->> (v_rule->>'field_id'), '');
        select coalesce(array_agg(btrim(piece)) filter (where btrim(piece) <> ''), array[]::text[])
          into v_rule_field_array
          from unnest(string_to_array(v_rule_field_text, ',')) as piece;

        v_rule_result := case v_rule->>'operator'
          when 'equals' then v_rule_field_text = coalesce(v_rule->>'value', '')
          when 'not_equals' then v_rule_field_text <> coalesce(v_rule->>'value', '')
          when 'includes' then coalesce(v_rule->>'value', '') = any(v_rule_field_array)
          when 'not_includes' then not (coalesce(v_rule->>'value', '') = any(v_rule_field_array))
          when 'is_answered' then btrim(v_rule_field_text) <> ''
          when 'is_blank' then btrim(v_rule_field_text) = ''
          else true
        end;

        if not v_group_started then
          v_group_result := v_rule_result;
          v_group_started := true;
        elsif v_match_mode = 'any' then
          v_group_result := v_group_result or v_rule_result;
        else
          v_group_result := v_group_result and v_rule_result;
        end if;
      end loop;
      if v_group_started then
        v_visible := v_group_result;
      end if;
    end if;

    if not v_visible then
      -- Documented choice: drop this field's answer entirely rather than
      -- rejecting the whole submission -- recorded here, applied only
      -- when the answer-insertion loop below decides what to persist.
      -- v_answer_text_by_field and v_submitted_field_ids are deliberately
      -- never written to by this branch: a different field's own show_if
      -- may still legitimately need to read this field's actual submitted
      -- value, independent of whether this field is itself visible.
      v_hidden_field_ids := v_hidden_field_ids || jsonb_build_object(v_field.id::text, true);
      continue;
    end if;

    if v_field.is_required then
      v_answered := (v_submitted_field_ids ? v_field.id::text) and btrim(coalesce(v_answer_text_by_field ->> (v_field.id::text), '')) <> '';
      if not v_answered then
        raise exception 'Please answer: %', v_field.label;
      end if;
    end if;
  end loop;

  insert into public.organizer_responses (workspace_id, client_id, organizer_template_id, status, submitted_at, is_public_submission)
  values (v_workspace_id, v_client_id, v_template_id, 'submitted', now(), true)
  returning id into v_response_id;

  for v_answer in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    if not (v_submitted_field_ids ? (v_answer->>'field_id')) or (v_hidden_field_ids ? (v_answer->>'field_id')) then
      -- Either not a real field_id, or belonged to a top-level field this
      -- submission resolved as conditionally hidden (v_hidden_field_ids,
      -- computed above from the untouched answer snapshot).
      continue;
    end if;

    -- F-04: SSN/EIN format, consistent with isValidTaxId() -- blank
    -- passes (required-ness is enforced above), a non-blank value must be
    -- exactly 9 digits once non-digits are stripped.
    select f.field_type, f.label into v_answer_field_type, v_answer_field_label
      from public.organizer_fields f
      where f.id = (v_answer->>'field_id')::uuid and f.organizer_template_id = v_template_id;

    if v_answer_field_type in ('ssn', 'ein') then
      v_raw_text := coalesce(v_answer->'value' #>> '{}', '');
      v_digits := regexp_replace(v_raw_text, '\D', '', 'g');
      if v_digits <> '' and length(v_digits) <> 9 then
        raise exception '% must be exactly 9 digits.', v_answer_field_label;
      end if;
    elsif v_answer_field_type = 'signature' and v_answer->'value' is not null and jsonb_typeof(v_answer->'value') <> 'null' then
      if jsonb_typeof(v_answer->'value') <> 'object' or nullif(btrim(coalesce(v_answer->'value'->>'typed_name', '')), '') is null then
        raise exception 'Invalid signature value for %', v_answer_field_label;
      end if;
    end if;

    insert into public.organizer_response_answers (organizer_response_id, organizer_field_id, value, instance_index)
    select v_response_id, (v_answer->>'field_id')::uuid, v_answer->'value', coalesce((v_answer->>'instance_index')::int, 0)
    where exists (
      select 1 from public.organizer_fields f where f.id = (v_answer->>'field_id')::uuid and f.organizer_template_id = v_template_id
    );
  end loop;

  for v_field in
    select f.id, f.client_profile_field
    from public.organizer_fields f
    where f.organizer_template_id = v_template_id and f.client_profile_field is not null and f.parent_field_id is null
  loop
    perform public._propose_client_field_from_organizer_answer(
      v_workspace_id, v_client_id, v_response_id, v_field.id, v_field.client_profile_field,
      (select a.value from public.organizer_response_answers a where a.organizer_response_id = v_response_id and a.organizer_field_id = v_field.id and a.instance_index = 0)
    );
  end loop;

  perform public.resolve_organizer_response_service(v_response_id);
  v_signature_request_id := public.resolve_and_sign_organizer_response(v_response_id, v_workspace_id, v_template_id, v_client_name, p_email);

  return jsonb_build_object('ok', true, 'client_id', v_client_id, 'response_id', v_response_id, 'signature_request_id', v_signature_request_id);
end;
$function$;
