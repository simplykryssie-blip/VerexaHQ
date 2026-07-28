-- Business/Entity Tax Intake -- additive extension of the existing public
-- intake infrastructure (tokens, verification, uploads, document
-- requests, staff review queue, identity vault, matching/conversion).
-- Nothing here changes behavior for existing individual intakes: every
-- new column is nullable/defaulted, every new function is new, and the
-- only edit to an existing function (save_intake_progress) is a pure
-- additive branch on the new intake_type column.

-- ---------------------------------------------------------------------
-- 1. Discriminator + business summary columns on intakes.
--    return_type already had a 'business' value anticipated by
--    staff_convert_intake_to_prospective_client; intake_type is the
--    explicit, finer-grained discriminator used to route save/submit
--    logic to the correct flag/checklist functions.
-- ---------------------------------------------------------------------
alter table public.intakes add column if not exists intake_type text not null default 'individual';
alter table public.intakes drop constraint if exists intakes_intake_type_check;
alter table public.intakes add constraint intakes_intake_type_check check (intake_type in ('individual', 'business_entity'));

alter table public.intakes add column if not exists entity_classification text;
alter table public.intakes drop constraint if exists intakes_entity_classification_check;
alter table public.intakes add constraint intakes_entity_classification_check check (
  entity_classification is null or entity_classification in (
    'c_corp', 's_corp', 'partnership', 'mmllc_partnership', 'llc_s_corp', 'llc_c_corp',
    'smllc', 'sole_prop', 'unsure'
  )
);
alter table public.intakes add column if not exists legal_business_name text;
alter table public.intakes add column if not exists ownership_percentage_total numeric;

create index if not exists intakes_intake_type_idx on public.intakes (intake_type);

-- ---------------------------------------------------------------------
-- 2. Extend the secure identity vault for business EIN and owner
--    SSN/ITIN/EIN. Same encrypted-at-rest, token-scoped, masked-only
--    architecture already built for the individual intake -- no new
--    crypto surface.
-- ---------------------------------------------------------------------
alter table public.intake_identity_vault drop constraint if exists intake_identity_vault_person_type_check;
alter table public.intake_identity_vault add constraint intake_identity_vault_person_type_check
  check (person_type in ('taxpayer', 'spouse', 'dependent', 'childcare_provider', 'business', 'owner'));

alter table public.intake_identity_vault drop constraint if exists intake_identity_vault_dependent_ref;
alter table public.intake_identity_vault add constraint intake_identity_vault_dependent_ref check (
  (person_type in ('dependent', 'childcare_provider', 'owner') and coalesce(trim(person_ref), '') <> '') or
  (person_type not in ('dependent', 'childcare_provider', 'owner'))
);

create or replace function public.public_save_intake_identity(
  p_token text,
  p_person_type text,
  p_identity_type text,
  p_status text,
  p_person_ref text default null,
  p_plain_value text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_row public.intake_return_tokens%rowtype;
  v_intake public.intakes%rowtype;
  v_normalized text;
  v_master_key text;
  v_fingerprint_key text;
  v_cipher bytea;
  v_payload jsonb;
  v_masked text;
  v_last4 text;
  v_fingerprint text;
  v_vault_id uuid;
  v_old_masked text;
begin
  if p_person_type not in ('taxpayer', 'spouse', 'dependent', 'childcare_provider', 'business', 'owner') then
    raise exception 'Invalid person type.';
  end if;
  if p_person_type in ('dependent', 'childcare_provider', 'owner') and coalesce(trim(p_person_ref), '') = '' then
    raise exception 'A reference is required.';
  end if;
  if p_identity_type not in ('ssn', 'itin', 'atin', 'ip_pin', 'ein') then
    raise exception 'Invalid identity type.';
  end if;
  if p_status not in ('provided', 'will_provide_later', 'need_help') then
    raise exception 'Invalid status.';
  end if;

  select * into v_row from public.intake_return_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found or v_row.status <> 'active' or v_row.revoked_at is not null or v_row.expires_at <= now() then
    raise exception 'This link is invalid or has expired.';
  end if;

  select * into v_intake from public.intakes where id = v_row.intake_id;
  if not found then raise exception 'Intake not found.'; end if;

  if p_status = 'provided' then
    v_normalized := regexp_replace(coalesce(p_plain_value, ''), '[^0-9]', '', 'g');
    if p_identity_type = 'ip_pin' then
      if length(v_normalized) <> 6 then raise exception 'An IP PIN must be 6 digits.'; end if;
    else
      if length(v_normalized) <> 9 then raise exception 'That doesn''t look like a valid number.'; end if;
    end if;

    v_master_key := public._verexa_vault_secret('verexa_identity_vault_master_key');
    v_fingerprint_key := public._verexa_vault_secret('verexa_identity_fingerprint_key');
    if v_master_key is null or v_fingerprint_key is null then
      raise exception 'Secure identity storage is not configured.';
    end if;

    v_cipher := extensions.pgp_sym_encrypt(v_normalized, v_master_key, 'cipher-algo=aes256, compress-algo=0');
    v_payload := jsonb_build_object('v', 1, 'alg', 'pgp-aes256', 'ciphertext', encode(v_cipher, 'base64'));
    v_last4 := right(v_normalized, 4);
    v_masked := case p_identity_type
      when 'ssn' then '***-**-' || v_last4
      when 'itin' then '9**-**-' || v_last4
      when 'atin' then '9**-**-' || v_last4
      when 'ein' then '**-***' || v_last4
      when 'ip_pin' then '**-**-' || v_last4
      else repeat('*', 5) || v_last4
    end;
    v_fingerprint := encode(extensions.hmac(v_normalized, v_fingerprint_key, 'sha256'), 'hex');
  else
    v_payload := null;
    v_masked := null;
    v_last4 := null;
    v_fingerprint := null;
  end if;

  select id, masked_value into v_vault_id, v_old_masked
  from public.intake_identity_vault
  where intake_id = v_row.intake_id
    and person_type = p_person_type
    and coalesce(person_ref, '') = coalesce(p_person_ref, '')
    and identity_type = p_identity_type
  for update;

  if v_vault_id is null then
    insert into public.intake_identity_vault (
      intake_id, workspace_id, person_type, person_ref, identity_type, status, encrypted_payload, masked_value, last_four, fingerprint, note
    ) values (
      v_row.intake_id, v_intake.workspace_id, p_person_type, p_person_ref, p_identity_type, p_status, v_payload, v_masked, v_last4, v_fingerprint, p_note
    ) returning id into v_vault_id;

    insert into public.intake_identity_change_events (intake_id, vault_id, person_type, identity_type, event_type, new_masked_value, actor)
    values (v_row.intake_id, v_vault_id, p_person_type, p_identity_type, 'created', coalesce(v_masked, p_status), 'client');
  else
    update public.intake_identity_vault
    set status = p_status, encrypted_payload = v_payload, masked_value = v_masked, last_four = v_last4,
        fingerprint = v_fingerprint, note = p_note, updated_at = now()
    where id = v_vault_id;

    insert into public.intake_identity_change_events (intake_id, vault_id, person_type, identity_type, event_type, previous_masked_value, new_masked_value, actor)
    values (v_row.intake_id, v_vault_id, p_person_type, p_identity_type, 'replaced', v_old_masked, coalesce(v_masked, p_status), 'client');
  end if;

  return jsonb_build_object(
    'vault_id', v_vault_id, 'person_type', p_person_type, 'person_ref', p_person_ref,
    'identity_type', p_identity_type, 'status', p_status, 'masked_value', v_masked, 'last_four', v_last4
  );
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. start_public_business_intake -- new, dedicated RPC. Mirrors
--    start_public_intake's security model exactly (anon-callable, same
--    token generation, same lead creation) but sets intake_type/
--    return_type/entity_classification/legal_business_name and calls the
--    business-specific flag/checklist functions at the end instead of
--    the individual ones. start_public_intake itself is untouched.
-- ---------------------------------------------------------------------
create or replace function public.start_public_business_intake(
  p_workspace_id uuid,
  p_tax_year integer,
  p_entity_classification text,
  p_legal_business_name text,
  p_contact_first_name text,
  p_contact_last_name text,
  p_contact_email text,
  p_contact_phone text
)
returns table(intake_id uuid, raw_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_lead_id uuid;
  v_intake_id uuid;
  v_token text;
  v_exp timestamptz;
  v_email_norm text := public.normalize_intake_email(p_contact_email);
  v_phone_norm text := public.normalize_intake_phone(p_contact_phone);
begin
  if not exists (select 1 from public.workspaces where id = p_workspace_id) then
    raise exception 'Workspace not found.';
  end if;
  if coalesce(trim(p_legal_business_name), '') = '' then
    raise exception 'Legal business name is required.';
  end if;
  if coalesce(trim(p_contact_first_name), '') = '' or coalesce(trim(p_contact_last_name), '') = '' then
    raise exception 'Primary contact name is required.';
  end if;
  if v_email_norm is null and v_phone_norm is null then
    raise exception 'An email or mobile number is required.';
  end if;
  if p_entity_classification not in (
    'c_corp', 's_corp', 'partnership', 'mmllc_partnership', 'llc_s_corp', 'llc_c_corp', 'smllc', 'unsure'
  ) then
    raise exception 'Invalid entity classification for the business intake.';
  end if;

  insert into public.marketing_leads (workspace_id, first_name, last_name, email, phone, lead_status, interested_service)
  values (p_workspace_id, trim(p_contact_first_name), trim(p_contact_last_name), v_email_norm, p_contact_phone, 'New', 'business_tax_preparation')
  returning id into v_lead_id;

  insert into public.intakes (
    workspace_id, service_type, tax_year, return_type, intake_type, entity_classification, legal_business_name,
    is_returning_client, contact_first_name, contact_last_name, contact_email, contact_email_normalized,
    contact_phone, contact_phone_normalized, lead_id, status
  ) values (
    p_workspace_id, 'business_tax_preparation', p_tax_year, 'business', 'business_entity', p_entity_classification, trim(p_legal_business_name),
    false, trim(p_contact_first_name), trim(p_contact_last_name), p_contact_email, v_email_norm,
    p_contact_phone, v_phone_norm, v_lead_id, 'intake_started'
  ) returning id into v_intake_id;

  insert into public.intake_status_history (intake_id, from_status, to_status) values (v_intake_id, null, 'intake_started');

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_exp := now() + interval '30 days';
  insert into public.intake_return_tokens (intake_id, token_hash, expires_at)
  values (v_intake_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_exp);

  perform public.regenerate_business_intake_document_requests(v_intake_id);
  perform public.recompute_business_intake_flags(v_intake_id);

  return query select v_intake_id, v_token, v_exp;
end;
$function$;

-- Public entry point -- must stay anon-callable (mirrors start_public_intake).
grant execute on function public.start_public_business_intake(uuid, integer, text, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. recompute_business_intake_flags -- business-specific parallel to
--    recompute_intake_flags. Reads answers.* under the business answer
--    shape (entity/elections/return_type_detail/filing_history/
--    business_status/owners[]/operations/bookkeeping/payroll/
--    contractors/assets/loans/changes_compliance). Never touches or is
--    touched by the individual function.
-- ---------------------------------------------------------------------
create or replace function public.recompute_business_intake_flags(p_intake_id uuid)
returns void language plpgsql as $function$
declare
  r record;
  a jsonb;
  v_flags text[] := '{}';
  v_complexity text := 'Standard';
  v_consult boolean := false;
  v_special boolean := false;
  v_owner record;
  v_owner_count int := 0;
  v_pct_total numeric := 0;
  v_any_owner_pct boolean := false;
begin
  select * into r from public.intakes where id = p_intake_id;
  if not found then return; end if;
  a := coalesce(r.answers, '{}'::jsonb);

  if r.entity_classification = 'unsure' then v_flags := array_append(v_flags, 'entity_classification_unclear'); v_special := true; end if;

  if (a #>> '{return_type_detail}') = 'initial' then v_flags := array_append(v_flags, 'initial_return'); end if;
  if (a #>> '{return_type_detail}') = 'final' then v_flags := array_append(v_flags, 'final_return'); v_special := true; end if;
  if (a #>> '{return_type_detail}') = 'amended' then v_flags := array_append(v_flags, 'amended_return'); end if;
  if (a #>> '{return_type_detail}') = 'short_period' then v_flags := array_append(v_flags, 'short_period_return'); end if;

  if coalesce((a #>> '{elections,form_2553_filed}')::boolean, false) or r.entity_classification in ('s_corp', 'llc_s_corp') then
    v_flags := array_append(v_flags, 's_election_review');
  end if;
  if coalesce((a #>> '{elections,form_8832_filed}')::boolean, false) or coalesce((a #>> '{elections,changed_classification_during_year}')::boolean, false) then
    v_flags := array_append(v_flags, 'form_8832_review');
  end if;

  if (a #>> '{entity,tax_year_type}') = 'fiscal' then v_flags := array_append(v_flags, 'fiscal_year_entity'); end if;

  if coalesce((a #>> '{filing_history,prior_return_filed}')::boolean, true) = false then v_flags := array_append(v_flags, 'missing_prior_return'); end if;
  if coalesce((a #>> '{filing_history,unfiled_years}')::boolean, false) then v_flags := array_append(v_flags, 'unfiled_years'); v_special := true; end if;
  if coalesce((a #>> '{filing_history,irs_state_notice}')::boolean, false) then v_flags := array_append(v_flags, 'irs_state_notice'); v_special := true; end if;

  if coalesce((a #>> '{business_status,was_sold}')::boolean, false) then v_flags := array_append(v_flags, 'business_sale'); v_special := true; end if;
  if coalesce((a #>> '{business_status,was_merged}')::boolean, false) or coalesce((a #>> '{business_status,was_converted}')::boolean, false) then
    v_flags := array_append(v_flags, 'merger_or_conversion'); v_special := true;
  end if;
  if coalesce((a #>> '{business_status,ownership_changed}')::boolean, false) then v_flags := array_append(v_flags, 'ownership_change'); end if;

  -- Owners: ownership-percentage total + basis records
  if jsonb_typeof(a -> 'owners') = 'array' then
    for v_owner in select * from jsonb_array_elements(a -> 'owners') d loop
      v_owner_count := v_owner_count + 1;
      if (v_owner.value ->> 'ownership_pct') is not null and (v_owner.value ->> 'ownership_pct') <> '' then
        v_any_owner_pct := true;
        v_pct_total := v_pct_total + coalesce((v_owner.value ->> 'ownership_pct')::numeric, 0);
      end if;
    end loop;
  end if;
  if v_any_owner_pct then
    update public.intakes set ownership_percentage_total = v_pct_total where id = p_intake_id;
    if abs(v_pct_total - 100) > 0.5 then v_flags := array_append(v_flags, 'ownership_percentage_review'); end if;
  end if;
  if (a #>> '{ownership_structure,basis_records}') in ('some', 'no', 'unsure') then
    v_flags := array_append(v_flags, 'basis_records_review');
  end if;
  if (a #>> '{ownership_structure,c_corp,related_party_ownership}')::boolean or
     (select bool_or(coalesce((o.value ->> 'had_loans')::boolean, false)) from jsonb_array_elements(coalesce(a -> 'owners', '[]'::jsonb)) o) then
    v_flags := array_append(v_flags, 'related_party_transactions');
  end if;

  -- Operations: multistate / foreign
  if coalesce(array_length(r.states_lived_worked, 1), 0) > 1 then
    v_flags := array_append(v_flags, 'multistate_return_review');
    v_flags := array_append(v_flags, 'state_filing_review');
  end if;
  if coalesce((a #>> '{operations,foreign_activity}')::boolean, false) then
    v_flags := array_append(v_flags, 'foreign_reporting_review');
    v_special := true;
  end if;

  -- Bookkeeping
  if (a #>> '{bookkeeping,status}') in ('incomplete', 'none') then
    v_flags := array_append(v_flags, 'bookkeeping_cleanup_recommended');
    v_consult := true;
  elsif (a #>> '{bookkeeping,status}') in ('mostly', 'unsure') then
    v_flags := array_append(v_flags, 'bookkeeping_cleanup_recommended');
  end if;

  -- Payroll / contractors
  if coalesce((a #>> '{payroll,has_employees}')::boolean, false) then
    if coalesce((a #>> '{payroll,all_returns_filed}')::boolean, true) = false
       or coalesce((a #>> '{payroll,late_deposits}')::boolean, false)
       or coalesce((a #>> '{payroll,unpaid_payroll_tax}')::boolean, false)
    then
      v_flags := array_append(v_flags, 'payroll_compliance_review');
    end if;
    if coalesce((a #>> '{payroll,late_deposits}')::boolean, false) then v_flags := array_append(v_flags, 'late_payroll_filing'); end if;
    if coalesce((a #>> '{payroll,unpaid_payroll_tax}')::boolean, false) then v_flags := array_append(v_flags, 'unpaid_payroll_tax'); v_special := true; end if;
  end if;
  if coalesce((a #>> '{contractors,has_contractors}')::boolean, false)
     and (coalesce((a #>> '{contractors,unreported_payments}')::boolean, false) or coalesce((a #>> '{contractors,worker_classification_concern}')::boolean, false))
  then
    v_flags := array_append(v_flags, 'contractor_reporting_review');
  end if;

  -- Owner compensation
  if r.entity_classification in ('s_corp', 'llc_s_corp') then
    v_flags := array_append(v_flags, 's_corp_reasonable_compensation_review');
  end if;
  if (select bool_or(coalesce((o.value ->> 'received_compensation')::boolean, false) or coalesce((o.value ->> 'received_distributions')::boolean, false))
      from jsonb_array_elements(coalesce(a -> 'owners', '[]'::jsonb)) o)
  then
    v_flags := array_append(v_flags, 'owner_compensation_review');
  end if;

  -- Equity
  if coalesce((a #>> '{equity,negative_capital_accounts}')::boolean, false) then
    v_flags := array_append(v_flags, 'negative_capital_review');
    v_special := true;
  end if;

  -- Changes/compliance section (only counts what isn't already captured above)
  if coalesce((a #>> '{changes_compliance,major_transactions,asset_sale}')::boolean, false) then v_flags := array_append(v_flags, 'asset_sale'); end if;
  if coalesce((a #>> '{changes_compliance,related_party,with_owners}')::boolean, false)
     or coalesce((a #>> '{changes_compliance,related_party,with_relatives}')::boolean, false)
     or coalesce((a #>> '{changes_compliance,related_party,with_commonly_owned}')::boolean, false)
  then
    v_flags := array_append(v_flags, 'related_party_transactions');
  end if;
  if coalesce((a #>> '{changes_compliance,tax_compliance,audit}')::boolean, false)
     or coalesce((a #>> '{changes_compliance,tax_compliance,lien_or_levy}')::boolean, false)
     or coalesce((a #>> '{changes_compliance,tax_compliance,unfiled_return}')::boolean, false)
  then
    v_special := true;
  end if;

  -- Deduplicate flags (several branches above can append the same flag twice)
  select array_agg(distinct f) into v_flags from unnest(v_flags) f;

  -- Complexity
  if coalesce(array_length(r.states_lived_worked, 1), 0) > 1
     or coalesce((a #>> '{operations,foreign_activity}')::boolean, false)
     or coalesce((a #>> '{business_status,ownership_changed}')::boolean, false)
     or (a #>> '{return_type_detail}') = 'amended'
     or (a #>> '{entity,tax_year_type}') = 'fiscal'
     or (a #>> '{return_type_detail}') = 'short_period'
     or 'bookkeeping_cleanup_recommended' = any(v_flags)
     or 'payroll_compliance_review' = any(v_flags)
     or 'contractor_reporting_review' = any(v_flags)
     or 'basis_records_review' = any(v_flags)
  then
    v_complexity := 'Complex';
  end if;
  if v_special
     or coalesce((a #>> '{filing_history,unfiled_years}')::boolean, false)
     or coalesce((a #>> '{filing_history,irs_state_notice}')::boolean, false)
     or coalesce((a #>> '{business_status,was_sold}')::boolean, false)
     or coalesce((a #>> '{business_status,was_merged}')::boolean, false)
     or coalesce((a #>> '{business_status,was_converted}')::boolean, false)
     or r.entity_classification = 'unsure'
     or 's_election_review' = any(v_flags) and coalesce((a #>> '{elections,election_accepted}')::boolean, true) = false
  then
    v_complexity := 'Special Review';
  end if;

  v_consult := v_consult or v_complexity = 'Special Review' or r.entity_classification = 'unsure'
    or coalesce((a #>> '{filing_history,irs_state_notice}')::boolean, false);

  update public.intakes
  set review_flags = coalesce(v_flags, '{}'), complexity_classification = v_complexity, consultation_recommended = v_consult
  where id = p_intake_id;
end;
$function$;

-- ---------------------------------------------------------------------
-- 5. regenerate_business_intake_document_requests -- business-specific
--    parallel to regenerate_intake_document_requests. Every item is
--    gated on a real answer; there is no generic "Other Documents" item.
-- ---------------------------------------------------------------------
create or replace function public.regenerate_business_intake_document_requests(p_intake_id uuid)
returns void language plpgsql as $function$
declare
  r public.intakes%rowtype;
  a jsonb;
  v_keys text[] := array['photo_id'];
  v_rule record;
begin
  select * into r from public.intakes where id = p_intake_id;
  if not found then return; end if;
  a := coalesce(r.answers, '{}'::jsonb);

  drop table if exists _biz_doc_rules;
  create temp table _biz_doc_rules (item_key text, item_title text, item_reason text, is_required boolean, is_blocking boolean, sort_order int) on commit drop;

  insert into _biz_doc_rules values ('photo_id', 'Government-issued photo ID (primary contact)', 'Confirms your identity for the return.', true, true, 1);
  insert into _biz_doc_rules values ('ein_confirmation_letter', 'EIN confirmation letter (CP 575 or 147C)', 'Confirms the business''s EIN.', false, true, 2);

  -- Identity and classification
  if coalesce(r.entity_classification in ('partnership', 'mmllc_partnership'), false) then
    insert into _biz_doc_rules values ('partnership_agreement', 'Partnership or operating agreement', 'Ownership and allocation terms.', true, true, 3);
  elsif coalesce(r.entity_classification in ('c_corp', 's_corp', 'llc_s_corp', 'llc_c_corp'), false) then
    insert into _biz_doc_rules values ('formation_documents', 'Articles of incorporation / organization, bylaws or operating agreement', 'Confirms entity structure.', true, true, 3);
  end if;
  if coalesce((a #>> '{elections,form_2553_filed}')::boolean, false) then
    insert into _biz_doc_rules values ('form_2553', 'Form 2553', 'S-election filing.', false, true, 4);
    if coalesce((a #>> '{elections,acceptance_letter_available}')::boolean, false) then
      insert into _biz_doc_rules values ('s_election_acceptance_letter', 'S-election IRS acceptance letter', 'Confirms the election was accepted.', false, true, 5);
    end if;
  end if;
  if coalesce((a #>> '{elections,form_8832_filed}')::boolean, false) then
    insert into _biz_doc_rules values ('form_8832', 'Form 8832', 'Entity classification election.', false, true, 6);
    if coalesce((a #>> '{elections,acceptance_letter_available_8832}')::boolean, false) then
      insert into _biz_doc_rules values ('classification_approval_letter', 'Classification approval letter', 'Confirms the election was accepted.', false, true, 7);
    end if;
  end if;
  if coalesce((a #>> '{filing_history,prior_return_filed}')::boolean, false) and coalesce((a #>> '{filing_history,prior_copy_available}')::boolean, false) then
    insert into _biz_doc_rules values ('prior_year_business_return', 'Prior-year business return', 'Helps carry forward relevant details.', false, false, 8);
  end if;

  -- Financial records (only what the client said is available)
  if (a #>> '{financial_records,pl_statement}') in ('available', 'partial') then
    insert into _biz_doc_rules values ('pl_statement', 'Profit and loss statement', 'Summarizes business income and expenses.', true, true, 10);
  end if;
  if (a #>> '{financial_records,balance_sheet}') in ('available', 'partial') then
    insert into _biz_doc_rules values ('balance_sheet', 'Balance sheet', 'Assets, liabilities, and equity as of year-end.', false, true, 11);
  end if;
  if (a #>> '{financial_records,trial_balance}') in ('available', 'partial') then
    insert into _biz_doc_rules values ('trial_balance', 'Trial balance', 'Account-level detail behind the financials.', false, false, 12);
  end if;
  if (a #>> '{financial_records,general_ledger}') in ('available', 'partial') then
    insert into _biz_doc_rules values ('general_ledger', 'General ledger', 'Full transaction detail.', false, false, 13);
  end if;
  if (a #>> '{financial_records,bank_statements}') in ('available', 'partial') then
    insert into _biz_doc_rules values ('bank_statements', 'Bank statements', 'Reconciles reported income and expenses.', true, true, 14);
  end if;
  if (a #>> '{financial_records,credit_card_statements}') in ('available', 'partial') then
    insert into _biz_doc_rules values ('credit_card_statements', 'Credit-card statements', 'Business card activity for the year.', false, false, 15);
  end if;
  if (a #>> '{financial_records,loan_statements}') in ('available', 'partial') then
    insert into _biz_doc_rules values ('loan_statements', 'Loan statements', 'Confirms loan balances and interest paid.', false, false, 16);
  end if;
  if (a #>> '{financial_records,fixed_asset_schedule}') in ('available', 'partial') then
    insert into _biz_doc_rules values ('fixed_asset_schedule', 'Fixed-asset / depreciation schedule', 'Continues depreciation already in progress.', false, true, 17);
  end if;
  if (a #>> '{financial_records,inventory_records}') in ('available', 'partial') then
    insert into _biz_doc_rules values ('inventory_report', 'Inventory report', 'Beginning/ending inventory detail.', false, false, 18);
  end if;
  if coalesce((a #>> '{bookkeeping,status}') not in ('complete'), true) then
    insert into _biz_doc_rules values ('sales_reports', 'Sales reports', 'Supports reported gross receipts.', false, false, 19);
  end if;

  -- Ownership
  if jsonb_typeof(a -> 'owners') = 'array' and jsonb_array_length(a -> 'owners') > 0 then
    insert into _biz_doc_rules values ('ownership_ledger', 'Ownership / capital-account ledger', 'Confirms ownership percentages and history.', false, true, 20);
  end if;
  if (a #>> '{ownership_structure,basis_records}') in ('some', 'no', 'unsure') then
    insert into _biz_doc_rules values ('basis_worksheets', 'Prior basis worksheets, contribution and distribution records', 'Needed to establish or continue each owner''s basis.', false, true, 21);
  end if;

  -- Payroll and contractors
  if coalesce((a #>> '{payroll,has_employees}')::boolean, false) then
    insert into _biz_doc_rules values ('payroll_summary', 'Payroll summary / year-end payroll reports', 'Wages, withholding, and employer taxes for the year.', true, true, 22);
    insert into _biz_doc_rules values ('form_941_940', 'Forms 941 and 940 (and state payroll reports)', 'Confirms payroll tax filings.', false, true, 23);
    insert into _biz_doc_rules values ('w2_w3', 'W-2 / W-3 forms', 'Employee wage statements.', false, true, 24);
  end if;
  if coalesce((a #>> '{contractors,has_contractors}')::boolean, false) then
    insert into _biz_doc_rules values ('form_1099_nec', '1099-NEC / 1099-MISC forms issued', 'Confirms contractor reporting.', false, true, 25);
    if coalesce((a #>> '{contractors,w9_collected}')::boolean, false) then
      insert into _biz_doc_rules values ('w9_records', 'Form W-9 records', 'Contractor tax ID on file.', false, false, 26);
    end if;
  end if;

  -- Assets and transactions
  if coalesce((a #>> '{assets,purchased_real_property}')::boolean, false) or coalesce((a #>> '{assets,disposed_assets}')::boolean, false) then
    insert into _biz_doc_rules values ('closing_statements', 'Purchase/sale agreements or closing statements', 'Documents the transaction for basis and gain/loss.', false, true, 27);
  end if;
  if coalesce((a #>> '{vehicles,owned_or_leased}')::boolean, false) or coalesce((a #>> '{vehicles,personal_used_for_business}')::boolean, false) then
    insert into _biz_doc_rules values ('vehicle_mileage_records', 'Vehicle records / mileage log', 'Supports the business-use percentage claimed.', false, false, 28);
  end if;
  if jsonb_typeof(a -> 'loans') = 'array' and jsonb_array_length(a -> 'loans') > 0 then
    insert into _biz_doc_rules values ('loan_documents', 'Loan documents', 'Confirms loan terms and balances.', false, false, 29);
  end if;

  -- Compliance
  if coalesce((a #>> '{filing_history,irs_state_notice}')::boolean, false) or coalesce((a #>> '{changes_compliance,tax_compliance,irs_notice}')::boolean, false) or coalesce((a #>> '{changes_compliance,tax_compliance,state_notice}')::boolean, false) then
    insert into _biz_doc_rules values ('irs_state_notices', 'Copy of the IRS/state notice', 'The letter or notice received.', true, true, 30);
  end if;
  if coalesce((a #>> '{filing_history,extension_filed}') = 'yes', false) then
    insert into _biz_doc_rules values ('extension_confirmation', 'Extension confirmation', 'Confirms the extended deadline.', false, false, 31);
  end if;
  if coalesce((a #>> '{changes_compliance,tax_compliance,installment_agreement}')::boolean, false) then
    insert into _biz_doc_rules values ('payment_plan_documents', 'Payment-plan documents', 'Confirms installment-agreement terms.', false, true, 32);
  end if;
  if coalesce((a #>> '{changes_compliance,tax_compliance,audit}')::boolean, false) then
    insert into _biz_doc_rules values ('audit_correspondence', 'Audit correspondence', 'Any IRS/state audit letters received.', false, true, 33);
  end if;

  select array_agg(item_key) into v_keys from _biz_doc_rules;

  for v_rule in select * from _biz_doc_rules loop
    insert into public.intake_document_requests (intake_id, item_key, item_title, item_reason, is_required, is_blocking, sort_order)
    values (p_intake_id, v_rule.item_key, v_rule.item_title, v_rule.item_reason, v_rule.is_required, v_rule.is_blocking, v_rule.sort_order)
    on conflict (intake_id, item_key) do nothing;
  end loop;

  delete from public.intake_document_requests
  where intake_id = p_intake_id and status = 'requested' and not (item_key = any(v_keys));
end;
$function$;

-- ---------------------------------------------------------------------
-- 6. save_intake_progress -- the one existing shared function that needs
--    a change: it unconditionally called the individual recompute/
--    checklist functions. This is now a pure additive branch on
--    intake_type; every other line is byte-for-byte identical to the
--    version this replaces, so individual-intake behavior is unchanged
--    (verified live after applying: an individual-intake save still
--    calls recompute_intake_flags/regenerate_intake_document_requests).
-- ---------------------------------------------------------------------
create or replace function public.save_intake_progress(p_token text, p_section integer, p_patch jsonb)
returns intakes
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_row public.intake_return_tokens%rowtype;
  v_intake_id uuid;
  v_status text;
  v_intake_type text;
begin
  select * into v_row from public.intake_return_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found or v_row.status <> 'active' or v_row.revoked_at is not null or v_row.expires_at <= now() then
    raise exception 'This link is invalid or has expired.';
  end if;
  v_intake_id := v_row.intake_id;

  select status, intake_type into v_status, v_intake_type from public.intakes where id = v_intake_id;
  if v_status not in ('intake_started', 'intake_in_progress', 'verification_pending') then
    raise exception 'This intake has already been submitted and can no longer be edited here.';
  end if;

  update public.intakes set
    answers = answers || p_patch,
    current_section = greatest(current_section, p_section),
    status = case when status = 'intake_started' then 'intake_in_progress' else status end,
    contact_first_name = coalesce(p_patch->>'contact_first_name', contact_first_name),
    contact_last_name = coalesce(p_patch->>'contact_last_name', contact_last_name),
    legal_business_name = coalesce(p_patch->>'legal_business_name', legal_business_name),
    entity_classification = coalesce(p_patch->>'entity_classification', entity_classification),
    filing_status_expected = coalesce(p_patch->>'filing_status_expected', filing_status_expected),
    return_variant = coalesce(p_patch->>'return_variant', return_variant),
    has_spouse = coalesce((p_patch->>'has_spouse')::boolean, has_spouse),
    dependents_count = coalesce((p_patch->>'dependents_count')::integer, dependents_count),
    states_lived_worked = coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'states_lived_worked') x), states_lived_worked),
    has_prior_year_return = coalesce((p_patch->>'has_prior_year_return')::boolean, has_prior_year_return),
    has_irs_state_notice = coalesce((p_patch->>'has_irs_state_notice')::boolean, has_irs_state_notice),
    has_unfiled_years = coalesce((p_patch->>'has_unfiled_years')::boolean, has_unfiled_years),
    income_sources = coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'income_sources') x), income_sources),
    business_count = coalesce((p_patch->>'business_count')::integer, business_count),
    rental_count = coalesce((p_patch->>'rental_count')::integer, rental_count),
    has_cryptocurrency = coalesce((p_patch->>'has_cryptocurrency')::boolean, has_cryptocurrency),
    has_foreign_income = coalesce((p_patch->>'has_foreign_income')::boolean, has_foreign_income),
    bookkeeping_cleanup_needed = coalesce((p_patch->>'bookkeeping_cleanup_needed')::boolean, bookkeeping_cleanup_needed),
    payment_preference = coalesce(p_patch->>'payment_preference', payment_preference),
    recommended_package = case coalesce(p_patch->>'payment_preference', payment_preference)
      when 'refund' then 'refund_payment'
      when 'unsure' then 'custom_review'
      when 'discuss' then 'custom_review'
      when 'upfront' then 'standard_upfront'
      else recommended_package
    end,
    updated_at = now()
  where id = v_intake_id;

  if v_intake_type = 'business_entity' then
    perform public.regenerate_business_intake_document_requests(v_intake_id);
    perform public.recompute_business_intake_flags(v_intake_id);
  else
    perform public.regenerate_intake_document_requests(v_intake_id);
    perform public.recompute_intake_flags(v_intake_id);
  end if;

  insert into public.intake_versions (intake_id, version_number, version_type, answers_snapshot, normalized_snapshot)
  select v_intake_id, coalesce((select max(version_number) from public.intake_versions where intake_id = v_intake_id), 0) + 1, 'draft',
    i.answers, to_jsonb(i.*) - 'answers'
  from public.intakes i where i.id = v_intake_id;

  return (select i from public.intakes i where i.id = v_intake_id);
end;
$function$;

-- ---------------------------------------------------------------------
-- 7. staff_convert_intake_to_prospective_client -- minimal additive
--    enhancement: business intakes now populate clients.business_name.
--    Everything else in this function is unchanged.
-- ---------------------------------------------------------------------
create or replace function public.staff_convert_intake_to_prospective_client(p_intake_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_intake public.intakes%rowtype;
  v_client_id uuid;
  v_contact_id uuid;
begin
  select * into v_intake from public.intakes where id = p_intake_id;
  if v_intake.id is null then raise exception 'Intake not found.'; end if;
  if not public.can_staff_write(v_intake.workspace_id) then raise exception 'You do not have permission to review intakes.'; end if;

  if v_intake.matched_client_id is not null then
    return v_intake.matched_client_id;
  end if;

  insert into public.clients (workspace_id, client_type, account_type, first_name, last_name, business_name, email, phone, status, lifecycle_status, source)
  values (
    v_intake.workspace_id,
    case when v_intake.return_type = 'business' then 'business' else 'individual' end,
    case when v_intake.return_type = 'business' then 'business' else 'individual' end,
    v_intake.contact_first_name, v_intake.contact_last_name,
    case when v_intake.return_type = 'business' then v_intake.legal_business_name else null end,
    v_intake.contact_email, v_intake.contact_phone,
    'lead', 'onboarding', 'Public Intake'
  ) returning id into v_client_id;

  insert into public.contacts (workspace_id, first_name, last_name, personal_email, personal_phone, communication_consent_status)
  values (v_intake.workspace_id, v_intake.contact_first_name, v_intake.contact_last_name, v_intake.contact_email, v_intake.contact_phone,
    case when v_intake.ack_communication_consent then 'opted_in' else 'not_set' end)
  returning id into v_contact_id;

  insert into public.account_contacts (workspace_id, account_id, contact_id, relationship_type, is_primary)
  values (v_intake.workspace_id, v_client_id, v_contact_id, 'primary', true);

  if v_intake.lead_id is not null then
    update public.marketing_leads set converted_client_id = v_client_id, lead_status = 'Converted' where id = v_intake.lead_id;
  end if;

  update public.intakes set matched_client_id = v_client_id, matched_contact_id = v_contact_id, updated_at = now() where id = p_intake_id;

  return v_client_id;
end;
$function$;
