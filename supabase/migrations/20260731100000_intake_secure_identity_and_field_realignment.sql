-- Realigns recompute_intake_flags / regenerate_intake_document_requests
-- with this round's frontend changes:
--
--   * IP PIN capture moved from a plain jsonb boolean (taxpayer_detail.ip_pin,
--     spouse.has_ip_pin, dependents[].ip_pin) to the encrypted
--     intake_identity_vault (see 20260730100000_*). The flag now checks
--     the vault directly; the old jsonb reads are dropped since that data
--     can never be written there again. The ip_pin_letter document rule is
--     removed outright -- the firm no longer requires a CP01A upload when
--     the client has already provided the PIN itself, securely.
--   * Dependents[].form_8332 renamed to form_8332_involved (new custody/
--     claim subsection in DependentsSection.tsx).
--   * MFS's marital questions collapsed to marriage.marital_situation +
--     marriage.decree_final_date; the divorce_decree document rule now
--     also recognizes those (old has_decree/date_divorced kept as a
--     fallback for any draft still shaped the old way).
--   * life_changes.property.foreclosure/short_sale merged into
--     foreclosure_or_short_sale; life_changes.tax_compliance.bankruptcy
--     moved to life_changes.legal_financial.bankruptcy (Step 5 rebuild).
--     Old keys kept as a fallback for the same reason as above.
--   * life_changes.property.bought_home/refinanced removed from the
--     frontend entirely (Step 5 rebuild dropped them) -- the
--     closing_disclosure document rule is removed since it can never be
--     triggered by a new answer again.
--   * The generic, unconditional "Other Documents" item is removed --
--     every remaining document request must trace to a real answer.
--   * childcare_statement is no longer required/blocking -- the new
--     per-dependent childcare-provider workflow collects provider name,
--     address, phone, and amount paid as typed answers, so the upload is
--     now optional backup, not a hard requirement. It also now triggers
--     from the new per-dependent childcare_needed flag, not only the
--     Section 4 deductions.dependent_care checkbox.
--   * New: estate_trust_documents, triggered by
--     life_changes.estates_trusts.received = 'yes' (Step 5 rebuild).

create or replace function public.recompute_intake_flags(p_intake_id uuid)
returns void language plpgsql as $function$
declare
  r record;
  a jsonb;
  v_flags text[] := '{}';
  v_complexity text := 'Basic';
  v_consult boolean := false;
  v_special boolean := false;
  v_dep record;
  v_any_ip_pin_vault boolean;
begin
  select * into r from public.intakes where id = p_intake_id;
  if not found then return; end if;
  a := coalesce(r.answers, '{}'::jsonb);

  if r.filing_status_expected = 'head_of_household' then v_flags := array_append(v_flags, 'head_of_household_review'); end if;
  if r.filing_status_expected = 'married_filing_separately' then v_flags := array_append(v_flags, 'married_filing_separately'); end if;
  if coalesce(array_length(r.states_lived_worked, 1), 0) > 1 then v_flags := array_append(v_flags, 'multistate_return'); end if;
  if r.return_variant = 'amended' then v_flags := array_append(v_flags, 'amended_return'); end if;
  if coalesce(r.has_unfiled_years, false) then v_flags := array_append(v_flags, 'unfiled_years'); end if;
  if coalesce(r.dependents_count, 0) > 0 then v_flags := array_append(v_flags, 'dependent_eligibility_review'); end if;
  if coalesce(r.has_irs_state_notice, false) then v_flags := array_append(v_flags, 'irs_state_notice'); end if;
  if coalesce(r.has_spouse, false) then v_flags := array_append(v_flags, 'spouse_signature_required'); end if;
  if coalesce(array_length(r.income_sources, 1), 0) > 3 then v_flags := array_append(v_flags, 'multiple_income_sources'); end if;
  if coalesce(r.business_count, 0) > 0 then v_flags := array_append(v_flags, 'business_ownership'); end if;
  if coalesce(r.rental_count, 0) > 0 then v_flags := array_append(v_flags, 'rental_property'); end if;
  if coalesce(r.has_cryptocurrency, false) then v_flags := array_append(v_flags, 'cryptocurrency_complexity'); end if;
  if coalesce(r.has_foreign_income, false) then v_flags := array_append(v_flags, 'foreign_income_complexity'); end if;
  if coalesce(r.bookkeeping_cleanup_needed, false) then v_flags := array_append(v_flags, 'bookkeeping_cleanup_needed'); end if;

  if coalesce((a #>> '{spouse,died_during_year}')::boolean, false) then v_flags := array_append(v_flags, 'spouse_deceased'); end if;
  if coalesce((a #>> '{spouse,separate_preparer}')::boolean, false) then v_flags := array_append(v_flags, 'spouse_separate_preparer'); end if;

  -- IP PIN now lives only in intake_identity_vault (encrypted); one check
  -- covers taxpayer, spouse, and every dependent regardless of person_ref.
  select exists(
    select 1 from public.intake_identity_vault v
    where v.intake_id = p_intake_id and v.identity_type = 'ip_pin' and v.status = 'provided'
  ) into v_any_ip_pin_vault;
  if v_any_ip_pin_vault then v_flags := array_append(v_flags, 'identity_protection_pin'); end if;

  if jsonb_typeof(a -> 'dependents') = 'array' then
    for v_dep in select * from jsonb_array_elements(a -> 'dependents') d loop
      if coalesce((v_dep.value ->> 'form_8332_involved')::boolean, false) then v_flags := array_append(v_flags, 'form_8332_needed'); end if;
    end loop;
  end if;
  if coalesce((a #>> '{taxpayer_detail,identity_theft}')::boolean, false) then v_flags := array_append(v_flags, 'identity_theft_indicator'); end if;

  if coalesce((a #>> '{w2_detail,household_employee}')::boolean, false) then v_flags := array_append(v_flags, 'household_employer'); end if;
  if coalesce((a #>> '{w2_detail,clergy}')::boolean, false) then v_flags := array_append(v_flags, 'clergy_income'); end if;

  if coalesce((a #>> '{other_income,cancellation_of_debt}')::boolean, false) then v_flags := array_append(v_flags, 'cancellation_of_debt'); end if;
  if coalesce((a #>> '{other_income,lawsuit_settlements}')::boolean, false) then v_flags := array_append(v_flags, 'legal_settlement_review'); end if;
  if coalesce((a #>> '{deductions,marketplace_insurance}')::boolean, false) then v_flags := array_append(v_flags, 'marketplace_insurance'); end if;

  if coalesce((a #>> '{life_changes,tax_compliance,audit}')::boolean, false)
     or coalesce((a #>> '{life_changes,tax_compliance,bankruptcy}')::boolean, false)
     or coalesce((a #>> '{life_changes,legal_financial,bankruptcy}')::boolean, false)
     or coalesce((a #>> '{life_changes,tax_compliance,levy_or_lien}')::boolean, false)
     or coalesce((a #>> '{life_changes,tax_compliance,offer_in_compromise}')::boolean, false)
     or coalesce((a #>> '{life_changes,tax_compliance,installment_agreement}')::boolean, false)
  then
    v_flags := array_append(v_flags, 'tax_compliance_review');
    v_special := true;
  end if;
  if coalesce((a #>> '{life_changes,property,foreclosure}')::boolean, false)
     or coalesce((a #>> '{life_changes,property,short_sale}')::boolean, false)
     or coalesce((a #>> '{life_changes,property,foreclosure_or_short_sale}')::boolean, false)
  then v_flags := array_append(v_flags, 'cancellation_of_debt'); end if;
  if coalesce((a #>> '{life_changes,foreign,foreign_trust}')::boolean, false)
     or coalesce((a #>> '{life_changes,foreign,foreign_bank_accounts}')::boolean, false)
  then v_flags := array_append(v_flags, 'foreign_reporting_review'); end if;

  -- Staff-visibility only -- never folded into v_complexity/v_consult below.
  if (a #>> '{readiness,portal_help}') in ('yes_may_need_help', 'someone_will_assist', 'other_accommodation') then
    v_flags := array_append(v_flags, 'client_assistance_requested');
  end if;

  if coalesce(r.business_count, 0) > 0 or coalesce(r.rental_count, 0) > 0
     or 'self_employment' = any(r.income_sources) or 'k1' = any(r.income_sources) then
    v_complexity := 'Standard';
  end if;
  if coalesce(r.business_count, 0) > 1 or coalesce(r.rental_count, 0) > 1 or coalesce(r.has_cryptocurrency, false) or coalesce(r.has_foreign_income, false)
     or coalesce(array_length(r.states_lived_worked, 1), 0) > 1 or coalesce(r.has_unfiled_years, false) or coalesce(r.has_irs_state_notice, false)
     or 'tax_compliance_review' = any(v_flags) or 'foreign_reporting_review' = any(v_flags) or 'identity_theft_indicator' = any(v_flags)
  then
    v_complexity := 'Complex';
  end if;
  if v_special or (coalesce(r.has_irs_state_notice, false) and (coalesce(r.has_unfiled_years, false) or coalesce(r.business_count, 0) > 0)) then
    v_complexity := 'Special Review';
  end if;

  v_consult := v_complexity in ('Complex', 'Special Review') or coalesce(r.has_irs_state_notice, false) or coalesce(r.has_unfiled_years, false)
    or coalesce(r.payment_preference = 'discuss', false) or coalesce((a #>> '{readiness,consultation_requested}')::boolean, false);

  update public.intakes
  set review_flags = v_flags, complexity_classification = v_complexity, consultation_recommended = v_consult
  where id = p_intake_id;
end;
$function$;

create or replace function public.regenerate_intake_document_requests(p_intake_id uuid)
returns void language plpgsql as $function$
declare
  r public.intakes%rowtype;
  a jsonb;
  v_keys text[] := array['photo_id'];
  v_rule record;
  v_dep record;
  v_any_form_8332 boolean := false;
  v_any_dependent_childcare boolean := false;
begin
  select * into r from public.intakes where id = p_intake_id;
  if not found then return; end if;
  a := coalesce(r.answers, '{}'::jsonb);

  drop table if exists _intake_doc_rules;
  create temp table _intake_doc_rules (item_key text, item_title text, item_reason text, is_required boolean, is_blocking boolean, sort_order int) on commit drop;

  insert into _intake_doc_rules values ('photo_id', 'Government-issued photo ID', 'Confirms your identity for the return.', true, true, 1);

  if r.has_prior_year_return then
    insert into _intake_doc_rules values ('prior_year_return', 'Prior-year tax return', 'Helps us carry forward relevant details.', false, false, 2);
  end if;
  if 'w2' = any(r.income_sources) then
    insert into _intake_doc_rules values ('w2_forms', 'W-2 forms', 'Wage income from each employer.', true, true, 3);
  end if;
  if 'self_employment' = any(r.income_sources) then
    insert into _intake_doc_rules values ('1099_forms', '1099 forms', 'Self-employment / contractor income.', true, true, 4);
    insert into _intake_doc_rules values ('self_employment_records', 'Income and expense records', 'Summary of self-employment income and expenses.', true, true, 5);
  end if;
  if 'k1' = any(r.income_sources) then
    insert into _intake_doc_rules values ('k1_forms', 'K-1 forms', 'Partnership/S-corp/trust income.', true, true, 6);
  end if;
  if 'rental' = any(r.income_sources) then
    insert into _intake_doc_rules values ('rental_income_records', 'Rental income and expense records', 'Income and expenses for each rental property.', true, true, 7);
  end if;
  if 'retirement' = any(r.income_sources) then
    insert into _intake_doc_rules values ('1099r_forms', '1099-R forms', 'Retirement account distributions.', true, true, 8);
  end if;
  if 'social_security' = any(r.income_sources) then
    insert into _intake_doc_rules values ('ssa_1099', 'SSA-1099', 'Social Security benefits statement.', true, true, 9);
  end if;
  if 'unemployment' = any(r.income_sources) then
    insert into _intake_doc_rules values ('1099g_forms', '1099-G forms', 'Unemployment compensation.', true, true, 10);
  end if;
  if 'investments' = any(r.income_sources) or 'stock_sales' = any(r.income_sources) then
    insert into _intake_doc_rules values ('1099b_forms', '1099-B forms', 'Investment / stock sale activity.', true, true, 11);
  end if;
  if 'interest_dividends' = any(r.income_sources) then
    insert into _intake_doc_rules values ('1099int_div_forms', '1099-INT / 1099-DIV forms', 'Interest and dividend income.', true, true, 12);
  end if;
  if r.has_cryptocurrency or 'crypto' = any(r.income_sources) then
    insert into _intake_doc_rules values ('crypto_transaction_records', 'Cryptocurrency transaction records', 'Exchange or wallet activity for the year.', true, true, 13);
  end if;
  if r.has_foreign_income or 'foreign_income' = any(r.income_sources) then
    insert into _intake_doc_rules values ('foreign_income_documents', 'Foreign income documents', 'Any foreign income or account records.', true, true, 14);
  end if;
  if r.has_spouse then
    insert into _intake_doc_rules values ('spouse_id', 'Spouse government-issued photo ID', 'Confirms your spouse''s identity for a joint return.', true, true, 15);
  end if;
  if coalesce(r.dependents_count, 0) > 0 then
    insert into _intake_doc_rules values ('dependent_ssn_documents', 'Dependent Social Security cards', 'One for each dependent claimed.', true, true, 16);
  end if;
  if r.has_irs_state_notice then
    insert into _intake_doc_rules values ('irs_state_notice_copy', 'Copy of the IRS/state notice', 'The letter or notice you received.', true, true, 17);
  end if;

  -- Income detail
  if coalesce((a #>> '{self_employment_detail,any_mileage}')::boolean, false) then
    insert into _intake_doc_rules values ('mileage_log', 'Mileage log', 'Business mileage for the year.', false, false, 18);
  end if;
  if coalesce((a #>> '{self_employment_detail,any_home_office}')::boolean, false) then
    insert into _intake_doc_rules values ('home_office_documentation', 'Home office details', 'Square footage and expenses for your home office.', false, false, 19);
  end if;
  if coalesce((a #>> '{self_employment_detail,any_prior_depreciation}')::boolean, false)
     or coalesce((a #>> '{rentals_summary,any_prior_depreciation}')::boolean, false)
  then
    insert into _intake_doc_rules values ('depreciation_schedule', 'Prior-year depreciation schedule', 'Continues depreciation already in progress.', false, true, 20);
  end if;
  if coalesce((a #>> '{other_income,gambling}')::boolean, false) then
    insert into _intake_doc_rules values ('gambling_records', 'Gambling win/loss records', 'W-2G forms or a win/loss statement.', false, false, 21);
  end if;
  if coalesce((a #>> '{other_income,cancellation_of_debt}')::boolean, false) then
    insert into _intake_doc_rules values ('1099c_forms', '1099-C forms', 'Cancellation-of-debt income.', true, true, 22);
  end if;
  if coalesce((a #>> '{other_income,lawsuit_settlements}')::boolean, false) then
    insert into _intake_doc_rules values ('settlement_documents', 'Settlement documents', 'Legal settlement or award paperwork.', false, false, 23);
  end if;

  -- Deductions/credits detail
  if coalesce((a #>> '{deductions,marketplace_insurance}')::boolean, false) then
    insert into _intake_doc_rules values ('form_1095a', 'Form 1095-A', 'Marketplace health insurance statement.', true, true, 24);
  end if;
  if coalesce((a #>> '{deductions,mortgage_interest}')::boolean, false) then
    insert into _intake_doc_rules values ('mortgage_interest_statement', 'Mortgage interest statement (1098)', 'From your mortgage lender.', false, true, 25);
  end if;
  if coalesce((a #>> '{deductions,property_taxes}')::boolean, false) then
    insert into _intake_doc_rules values ('property_tax_statement', 'Property tax statement', 'Real estate/property tax paid this year.', false, true, 26);
  end if;
  if coalesce((a #>> '{deductions,charitable_cash}')::boolean, false) or coalesce((a #>> '{deductions,charitable_noncash}')::boolean, false) then
    insert into _intake_doc_rules values ('donation_receipts', 'Donation receipts', 'Cash and non-cash charitable donation records.', false, false, 27);
  end if;
  if coalesce((a #>> '{deductions,tuition_education}')::boolean, false) then
    insert into _intake_doc_rules values ('tuition_form_1098t', 'Form 1098-T', 'Tuition statement from the school.', false, true, 28);
  end if;

  -- Childcare: the per-dependent provider workflow (name, address, phone,
  -- amount paid) already collects the substance of this as typed answers,
  -- so the document is optional backup, not a required upload.
  if jsonb_typeof(a -> 'dependents') = 'array' then
    for v_dep in select * from jsonb_array_elements(a -> 'dependents') d loop
      if coalesce((v_dep.value ->> 'childcare_needed')::boolean, false) then v_any_dependent_childcare := true; end if;
    end loop;
  end if;
  if coalesce((a #>> '{deductions,dependent_care}')::boolean, false) or v_any_dependent_childcare then
    insert into _intake_doc_rules values ('childcare_statement', 'Childcare provider statement or receipt', 'Optional backup for the provider details you already gave us -- only needed if you have one.', false, false, 29);
  end if;

  if coalesce((a #>> '{deductions,estimated_tax_payments}')::boolean, false) then
    insert into _intake_doc_rules values ('estimated_tax_payment_proof', 'Estimated tax payment records', 'Dates and amounts paid this year.', false, false, 30);
  end if;

  -- Life changes -> documents
  -- Divorce: MFS now collects marriage.marital_situation +
  -- marriage.decree_final_date; Single collects marriage.date_divorced.
  -- has_decree is kept as a fallback for any draft still shaped the old
  -- way (harmless -- it just never gets set by new answers).
  if coalesce((a #>> '{marriage,has_decree}')::boolean, false)
     or coalesce((a #>> '{marriage,date_divorced}'), '') <> ''
     or coalesce((a #>> '{marriage,decree_final_date}'), '') <> ''
     or (a #>> '{marriage,marital_situation}') in ('separated_decree', 'divorced_decree')
  then
    insert into _intake_doc_rules values ('divorce_decree', 'Divorce decree', 'Finalized decree or separation agreement.', false, true, 31);
  end if;
  if coalesce((a #>> '{life_changes,property,sold_home}')::boolean, false) then
    insert into _intake_doc_rules values ('home_sale_documents', 'Home sale documents', 'Settlement statement from the sale.', false, true, 33);
  end if;
  if (coalesce((a #>> '{life_changes,property,foreclosure}')::boolean, false)
      or coalesce((a #>> '{life_changes,property,short_sale}')::boolean, false)
      or coalesce((a #>> '{life_changes,property,foreclosure_or_short_sale}')::boolean, false))
     and not exists (select 1 from _intake_doc_rules where item_key = '1099c_forms')
  then
    insert into _intake_doc_rules values ('1099c_forms', '1099-C forms', 'Cancellation-of-debt income.', true, true, 22);
  end if;
  if coalesce((a #>> '{life_changes,tax_compliance,bankruptcy}')::boolean, false)
     or coalesce((a #>> '{life_changes,legal_financial,bankruptcy}')::boolean, false)
  then
    insert into _intake_doc_rules values ('bankruptcy_records', 'Bankruptcy filing records', 'Petition and discharge paperwork if available.', false, true, 34);
  end if;
  if (a #>> '{life_changes,estates_trusts,received}') = 'yes' then
    insert into _intake_doc_rules values ('estate_trust_documents', 'Estate or trust K-1 / statement', 'Any K-1 or distribution statement from the estate or trust.', false, true, 37);
  end if;

  if jsonb_typeof(a -> 'dependents') = 'array' then
    for v_dep in select * from jsonb_array_elements(a -> 'dependents') d loop
      if coalesce((v_dep.value ->> 'form_8332_involved')::boolean, false) then v_any_form_8332 := true; end if;
    end loop;
  end if;
  if v_any_form_8332 then
    insert into _intake_doc_rules values ('form_8332', 'Form 8332', 'Release of claim to exemption for a dependent, if applicable.', false, true, 36);
  end if;

  select array_agg(item_key) into v_keys from _intake_doc_rules;

  for v_rule in select * from _intake_doc_rules loop
    insert into public.intake_document_requests (intake_id, item_key, item_title, item_reason, is_required, is_blocking, sort_order)
    values (p_intake_id, v_rule.item_key, v_rule.item_title, v_rule.item_reason, v_rule.is_required, v_rule.is_blocking, v_rule.sort_order)
    on conflict (intake_id, item_key) do nothing;
  end loop;

  delete from public.intake_document_requests
  where intake_id = p_intake_id and status = 'requested' and not (item_key = any(v_keys));
end;
$function$;
