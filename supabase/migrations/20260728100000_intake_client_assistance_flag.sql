-- Portal-assistance answers (Section 6) create a staff-visible
-- client-assistance flag only -- deliberately never read by the
-- complexity/consultation logic above this block, so it can never affect
-- acceptance, pricing, or complexity classification.
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
  if coalesce((a #>> '{spouse,has_ip_pin}')::boolean, false) then v_flags := array_append(v_flags, 'identity_protection_pin'); end if;
  if coalesce((a #>> '{spouse,separate_preparer}')::boolean, false) then v_flags := array_append(v_flags, 'spouse_separate_preparer'); end if;

  if jsonb_typeof(a -> 'dependents') = 'array' then
    for v_dep in select * from jsonb_array_elements(a -> 'dependents') d loop
      if coalesce((v_dep.value ->> 'form_8332')::boolean, false) then v_flags := array_append(v_flags, 'form_8332_needed'); end if;
      if coalesce((v_dep.value ->> 'ip_pin')::boolean, false) then v_flags := array_append(v_flags, 'identity_protection_pin'); end if;
    end loop;
  end if;
  if coalesce((a #>> '{taxpayer_detail,ip_pin}')::boolean, false) then v_flags := array_append(v_flags, 'identity_protection_pin'); end if;
  if coalesce((a #>> '{taxpayer_detail,identity_theft}')::boolean, false) then v_flags := array_append(v_flags, 'identity_theft_indicator'); end if;

  if coalesce((a #>> '{w2_detail,household_employee}')::boolean, false) then v_flags := array_append(v_flags, 'household_employer'); end if;
  if coalesce((a #>> '{w2_detail,clergy}')::boolean, false) then v_flags := array_append(v_flags, 'clergy_income'); end if;
  if coalesce((a #>> '{w2_detail,multi_state}')::boolean, false) then v_flags := array_append(v_flags, 'multistate_return'); end if;

  if coalesce((a #>> '{other_income,cancellation_of_debt}')::boolean, false) then v_flags := array_append(v_flags, 'cancellation_of_debt'); end if;
  if coalesce((a #>> '{other_income,lawsuit_settlements}')::boolean, false) then v_flags := array_append(v_flags, 'legal_settlement_review'); end if;
  if coalesce((a #>> '{deductions,marketplace_insurance}')::boolean, false) then v_flags := array_append(v_flags, 'marketplace_insurance'); end if;

  if coalesce((a #>> '{life_changes,tax_compliance,audit}')::boolean, false)
     or coalesce((a #>> '{life_changes,tax_compliance,bankruptcy}')::boolean, false)
     or coalesce((a #>> '{life_changes,tax_compliance,levy_or_lien}')::boolean, false)
     or coalesce((a #>> '{life_changes,tax_compliance,offer_in_compromise}')::boolean, false)
     or coalesce((a #>> '{life_changes,tax_compliance,installment_agreement}')::boolean, false)
  then
    v_flags := array_append(v_flags, 'tax_compliance_review');
    v_special := true;
  end if;
  if coalesce((a #>> '{life_changes,property,foreclosure}')::boolean, false)
     or coalesce((a #>> '{life_changes,property,short_sale}')::boolean, false)
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
