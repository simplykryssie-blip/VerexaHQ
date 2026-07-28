-- Business/Entity Tax Intake -- Usefulness, Completeness, and Due-Diligence
-- Audit round. Purely additive/corrective to the business-intake surface
-- introduced in 20260801100000_business_entity_intake.sql. Does not touch
-- any individual-intake function, table, or column.
--
-- Summary of what this migration does:
--   1. Expands entity_classification to 11 explicit values so LLC routing
--      no longer needs a separate follow-up screen (Part 10).
--   2. Adds the intake_reasonable_inquiries table + RLS + public/staff RPCs
--      for the reasonable-inquiry workflow (Part 12).
--   3. Rewrites recompute_business_intake_flags to read the redesigned
--      answer shape (structured address/return-status/state-activity/
--      foreign-activity/income/deductions/inventory blocks) and to
--      implement the Part 8 automatic-conflict checks.
--   4. Rewrites regenerate_business_intake_document_requests to match.
--   5. Updates start_public_business_intake's classification validation
--      list to the new 9 business-routable values (sole_prop and
--      smllc_individual never reach this RPC -- they route to the
--      Individual Intake at the start page).

-- ---------------------------------------------------------------------
-- 1. entity_classification: 11 explicit values, no ambiguous 'smllc'.
-- ---------------------------------------------------------------------
alter table public.intakes drop constraint if exists intakes_entity_classification_check;
alter table public.intakes add constraint intakes_entity_classification_check check (
  entity_classification is null or entity_classification in (
    'sole_prop', 'smllc_individual',
    'smllc_s_corp', 'smllc_c_corp',
    'mmllc_partnership', 'mmllc_s_corp', 'mmllc_c_corp',
    's_corp', 'c_corp', 'partnership',
    'unsure'
  )
);

-- ---------------------------------------------------------------------
-- 2. Reasonable-inquiry workflow (Part 12).
-- ---------------------------------------------------------------------
create table if not exists public.intake_reasonable_inquiries (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intakes(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id),
  category text not null,
  trigger_reason text not null,
  client_question text,
  original_answer_snapshot jsonb,
  client_response text,
  client_responded_at timestamptz,
  document_requested boolean not null default false,
  document_status text,
  status text not null default 'open' check (status in ('open', 'answered', 'resolved', 'dismissed')),
  staff_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (intake_id, category)
);

create index if not exists intake_reasonable_inquiries_intake_idx on public.intake_reasonable_inquiries (intake_id);
create index if not exists intake_reasonable_inquiries_workspace_idx on public.intake_reasonable_inquiries (workspace_id, status);

alter table public.intake_reasonable_inquiries enable row level security;

drop policy if exists intake_reasonable_inquiries_staff_select on public.intake_reasonable_inquiries;
create policy intake_reasonable_inquiries_staff_select on public.intake_reasonable_inquiries
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists intake_reasonable_inquiries_staff_update on public.intake_reasonable_inquiries;
create policy intake_reasonable_inquiries_staff_update on public.intake_reasonable_inquiries
  for update using (public.can_staff_write(workspace_id)) with check (public.can_staff_write(workspace_id));

-- Public entry points: token-scoped, never exposes staff_note or the full
-- original_answer_snapshot to the client.
create or replace function public.public_intake_open_inquiries(p_token text)
returns table (id uuid, category text, client_question text, status text, client_response text)
language plpgsql security definer set search_path to 'public, extensions'
as $function$
declare
  v_row public.intake_return_tokens%rowtype;
begin
  select * into v_row from public.intake_return_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found or v_row.status <> 'active' or v_row.revoked_at is not null or v_row.expires_at <= now() then
    raise exception 'This link is invalid or has expired.';
  end if;
  return query
    select q.id, q.category, q.client_question, q.status, q.client_response
    from public.intake_reasonable_inquiries q
    where q.intake_id = v_row.intake_id
      and q.client_question is not null
      and q.status in ('open', 'answered')
    order by q.created_at;
end;
$function$;
grant execute on function public.public_intake_open_inquiries(text) to anon, authenticated;

create or replace function public.public_respond_intake_inquiry(p_token text, p_inquiry_id uuid, p_response text)
returns void
language plpgsql security definer set search_path to 'public, extensions'
as $function$
declare
  v_row public.intake_return_tokens%rowtype;
begin
  select * into v_row from public.intake_return_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found or v_row.status <> 'active' or v_row.revoked_at is not null or v_row.expires_at <= now() then
    raise exception 'This link is invalid or has expired.';
  end if;
  if coalesce(trim(p_response), '') = '' then
    raise exception 'A response is required.';
  end if;
  update public.intake_reasonable_inquiries
  set client_response = p_response, client_responded_at = now(), status = 'answered', updated_at = now()
  where id = p_inquiry_id and intake_id = v_row.intake_id and client_question is not null;
  if not found then
    raise exception 'That question could not be found on this intake.';
  end if;
end;
$function$;
grant execute on function public.public_respond_intake_inquiry(text, uuid, text) to anon, authenticated;

create or replace function public.staff_resolve_intake_inquiry(p_inquiry_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path to 'public, extensions'
as $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.intake_reasonable_inquiries where id = p_inquiry_id;
  if v_workspace_id is null then raise exception 'Inquiry not found.'; end if;
  if not public.can_staff_write(v_workspace_id) then raise exception 'You do not have permission to review intakes.'; end if;
  update public.intake_reasonable_inquiries
  set status = 'resolved', staff_note = coalesce(p_note, staff_note), resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
  where id = p_inquiry_id;
end;
$function$;
revoke execute on function public.staff_resolve_intake_inquiry(uuid, text) from public, anon;

-- Idempotent helper: only inserts a new open record the first time a
-- category triggers for a given intake, so staff resolution or a client's
-- answered response is never silently overwritten by a later recompute.
create or replace function public._upsert_reasonable_inquiry(
  p_intake_id uuid, p_workspace_id uuid, p_category text, p_trigger_reason text,
  p_client_question text, p_snapshot jsonb
) returns void language plpgsql as $function$
begin
  insert into public.intake_reasonable_inquiries (intake_id, workspace_id, category, trigger_reason, client_question, original_answer_snapshot)
  values (p_intake_id, p_workspace_id, p_category, p_trigger_reason, p_client_question, p_snapshot)
  on conflict (intake_id, category) do nothing;
end;
$function$;

create or replace function public.recompute_business_reasonable_inquiries(p_intake_id uuid)
returns void language plpgsql as $function$
declare
  r record;
  a jsonb;
  v_s_corp_taxed boolean;
  v_true_c_corp boolean;
  v_partnership_taxed boolean;
  v_any_dist_no_wages boolean;
  v_any_health_ins boolean;
  v_any_loan_no_records boolean;
  v_any_foreign_owner boolean;
  v_any_guaranteed_no_records boolean;
begin
  select * into r from public.intakes where id = p_intake_id;
  if not found then return; end if;
  a := coalesce(r.answers, '{}'::jsonb);

  v_s_corp_taxed := r.entity_classification in ('s_corp', 'smllc_s_corp', 'mmllc_s_corp');
  v_true_c_corp := r.entity_classification = 'c_corp';
  v_partnership_taxed := r.entity_classification in ('partnership', 'mmllc_partnership');

  if coalesce((a #>> '{return_status,is_final}'), '') = 'yes'
     and not (
       coalesce((a #>> '{business_status,was_sold}')::boolean, false)
       or coalesce((a #>> '{business_status,was_merged}')::boolean, false)
       or coalesce((a #>> '{business_status,was_converted}')::boolean, false)
       or coalesce((a #>> '{business_status,dissolved}')::boolean, false)
     )
  then
    perform public._upsert_reasonable_inquiry(p_intake_id, r.workspace_id, 'final_return_no_closure_event',
      'Return marked as final but no sale, merger, conversion, or dissolution was indicated.',
      'You indicated this is expected to be the business''s final return. Could you tell us what happened -- was it sold, merged, converted, dissolved, or something else?',
      jsonb_build_object('return_status', a -> 'return_status', 'business_status', a -> 'business_status'));
  end if;

  if coalesce((a #>> '{return_status,is_initial}'), '') = 'yes'
     and coalesce((a #>> '{filing_history,prior_return_filed}')::boolean, false)
  then
    perform public._upsert_reasonable_inquiry(p_intake_id, r.workspace_id, 'initial_return_conflicts_with_prior_filing',
      'Marked as the first return, but a prior-year return was also indicated as filed.',
      'You indicated this is the business''s first tax return, but also that a return was filed last year. Could you clarify?',
      jsonb_build_object('return_status', a -> 'return_status', 'filing_history', a -> 'filing_history'));
  end if;

  if coalesce((a #>> '{return_status,needs_amendment}'), '') = 'yes'
     and coalesce((a #>> '{filing_history,prior_copy_available}')::boolean, true) = false
  then
    perform public._upsert_reasonable_inquiry(p_intake_id, r.workspace_id, 'amendment_no_original_copy',
      'Amendment requested but no copy of the original return is available.',
      'You indicated this return needs to be amended, but that you don''t have a copy of the original return. Do you know how we can obtain a copy, or would you like our team to request a transcript from the IRS?',
      jsonb_build_object('return_status', a -> 'return_status', 'filing_history', a -> 'filing_history'));
  end if;

  if coalesce((a #>> '{payroll,has_employees}')::boolean, false)
     and coalesce((a #>> '{payroll,reports_available}')::boolean, true) = false
  then
    perform public._upsert_reasonable_inquiry(p_intake_id, r.workspace_id, 'employees_no_payroll_reports',
      'Employees reported but no payroll reports are available.',
      'You mentioned the business has employees. Do you have any payroll reports available (even partial), or would you like help obtaining them from your payroll provider?',
      jsonb_build_object('payroll', a -> 'payroll'));
  end if;

  if coalesce((a #>> '{vehicles,personal_used_for_business}')::boolean, false)
     and coalesce((a #>> '{vehicles,mileage_records_available}')::boolean, true) = false
  then
    perform public._upsert_reasonable_inquiry(p_intake_id, r.workspace_id, 'vehicle_no_mileage_records',
      'Personal vehicle used for business, but no mileage records are available.',
      'You mentioned a personal vehicle is used for business. Do you track business mileage, or would you like guidance on estimating the business-use percentage?',
      jsonb_build_object('vehicles', a -> 'vehicles'));
  end if;

  select bool_or(coalesce((o.value ->> 'received_distributions')::boolean, false) and coalesce((o.value ->> 'received_compensation')::boolean, false) = false)
  into v_any_dist_no_wages
  from jsonb_array_elements(coalesce(a -> 'owners', '[]'::jsonb)) o;
  if v_s_corp_taxed and coalesce(v_any_dist_no_wages, false) then
    perform public._upsert_reasonable_inquiry(p_intake_id, r.workspace_id, 's_corp_distributions_no_wages',
      'S-corp-taxed entity has an owner who received distributions without W-2 wages -- reasonable-compensation determination required.',
      null, jsonb_build_object('owners', a -> 'owners'));
  end if;

  select bool_or(coalesce((o.value ->> 'shareholder_health_insurance')::boolean, false)) into v_any_health_ins
  from jsonb_array_elements(coalesce(a -> 'owners', '[]'::jsonb)) o;
  if v_s_corp_taxed and coalesce(v_any_health_ins, false) then
    perform public._upsert_reasonable_inquiry(p_intake_id, r.workspace_id, 'shareholder_health_insurance_review',
      'S-corp shareholder health insurance reported -- requires payroll treatment review (Form W-2 Box 1/14).',
      null, jsonb_build_object('owners', a -> 'owners'));
  end if;

  select bool_or(coalesce((o.value ->> 'had_loans')::boolean, false)) into v_any_loan_no_records
  from jsonb_array_elements(coalesce(a -> 'owners', '[]'::jsonb)) o;
  if coalesce(v_any_loan_no_records, false) and (a #>> '{ownership_structure,basis_records}') in ('no', 'unsure') then
    perform public._upsert_reasonable_inquiry(p_intake_id, r.workspace_id, 'shareholder_loan_no_records',
      'Owner loan(s) to/from the business reported, but ownership/capital records are unavailable or uncertain.',
      null, jsonb_build_object('owners', a -> 'owners', 'ownership_structure', a -> 'ownership_structure'));
  end if;

  if coalesce((a #>> '{assets,disposed_assets}')::boolean, false) and (a #>> '{financial_records,fixed_asset_schedule}') = 'none' then
    perform public._upsert_reasonable_inquiry(p_intake_id, r.workspace_id, 'asset_sale_no_fixed_asset_records',
      'Asset disposal reported but no fixed-asset/depreciation schedule is available -- gain/loss and depreciation recapture cannot be computed without it.',
      null, jsonb_build_object('assets', a -> 'assets', 'financial_records', a -> 'financial_records'));
  end if;

  if coalesce((a #>> '{inventory,carries_inventory}')::boolean, false) and (a #>> '{inventory,records_available}') = 'no' then
    perform public._upsert_reasonable_inquiry(p_intake_id, r.workspace_id, 'inventory_no_records',
      'Business carries inventory but no inventory records are available -- COGS (Form 1125-A) cannot be computed without it.',
      null, jsonb_build_object('inventory', a -> 'inventory'));
  end if;

  if coalesce((a #>> '{filing_history,unfiled_years}')::boolean, false) then
    perform public._upsert_reasonable_inquiry(p_intake_id, r.workspace_id, 'unfiled_prior_years',
      'Client indicated prior-year returns remain unfiled -- compliance priority requiring a filing plan before the current year can be finalized.',
      null, jsonb_build_object('filing_history', a -> 'filing_history'));
  end if;

  select bool_or(coalesce((o.value ->> 'is_foreign')::boolean, false)) into v_any_foreign_owner
  from jsonb_array_elements(coalesce(a -> 'owners', '[]'::jsonb)) o;
  if v_s_corp_taxed and coalesce(v_any_foreign_owner, false) then
    perform public._upsert_reasonable_inquiry(p_intake_id, r.workspace_id, 'foreign_owner_s_corp_eligibility_review',
      'S-corp-taxed entity has an owner flagged as a foreign person -- nonresident aliens are not eligible S-corp shareholders and this needs confirmation.',
      null, jsonb_build_object('owners', a -> 'owners'));
  end if;

  if v_true_c_corp and coalesce((a #>> '{c_corp,dividends_paid}')::boolean, false)
     and (a #>> '{ownership_structure,basis_records}') in ('no', 'unsure')
  then
    perform public._upsert_reasonable_inquiry(p_intake_id, r.workspace_id, 'c_corp_dividends_ownership_review',
      'Dividends reported but ownership/shareholder records are unavailable or uncertain.',
      null, jsonb_build_object('c_corp', a -> 'c_corp', 'ownership_structure', a -> 'ownership_structure'));
  end if;

  select bool_or(coalesce((o.value ->> 'received_guaranteed_payments')::boolean, false)) into v_any_guaranteed_no_records
  from jsonb_array_elements(coalesce(a -> 'owners', '[]'::jsonb)) o;
  if v_partnership_taxed and coalesce(v_any_guaranteed_no_records, false) and (a #>> '{ownership_structure,basis_records}') in ('no', 'unsure') then
    perform public._upsert_reasonable_inquiry(p_intake_id, r.workspace_id, 'guaranteed_payments_capital_review',
      'Guaranteed payments reported but capital-account records are unavailable or uncertain.',
      null, jsonb_build_object('owners', a -> 'owners', 'ownership_structure', a -> 'ownership_structure'));
  end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. recompute_business_intake_flags -- full rewrite for the redesigned
--    answer shape, plus the Part 8 automatic-conflict flags that don't
--    warrant a full reasonable-inquiry record (same-section, already
--    visible to the client inline).
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
  v_pct_total numeric := 0;
  v_any_owner_pct boolean := false;
  v_s_corp_taxed boolean;
  v_true_c_corp boolean;
  v_c_corp_taxed_llc boolean;
  v_partnership_taxed boolean;
begin
  select * into r from public.intakes where id = p_intake_id;
  if not found then return; end if;
  a := coalesce(r.answers, '{}'::jsonb);

  v_s_corp_taxed := r.entity_classification in ('s_corp', 'smllc_s_corp', 'mmllc_s_corp');
  v_true_c_corp := r.entity_classification = 'c_corp';
  v_c_corp_taxed_llc := r.entity_classification in ('smllc_c_corp', 'mmllc_c_corp');
  v_partnership_taxed := r.entity_classification in ('partnership', 'mmllc_partnership');

  if r.entity_classification = 'unsure' then v_flags := array_append(v_flags, 'entity_classification_unclear'); v_special := true; end if;

  -- Return status (Part 9 redesign: derived from four separate questions)
  if (a #>> '{return_status,is_initial}') = 'yes' then v_flags := array_append(v_flags, 'initial_return'); end if;
  if (a #>> '{return_status,is_final}') = 'yes' then v_flags := array_append(v_flags, 'final_return'); v_special := true; end if;
  if (a #>> '{return_status,needs_amendment}') = 'yes' then v_flags := array_append(v_flags, 'amended_return'); end if;
  if (a #>> '{return_status,is_short_period}') = 'yes' then v_flags := array_append(v_flags, 'short_period_return'); end if;
  if (a #>> '{return_status,already_filed}') = 'unsure' or (a #>> '{return_status,is_initial}') = 'unsure'
     or (a #>> '{return_status,is_final}') = 'unsure' or (a #>> '{return_status,is_short_period}') = 'unsure'
  then
    v_flags := array_append(v_flags, 'return_status_unclear');
  end if;

  if coalesce((a #>> '{elections,form_2553_filed}')::boolean, false) or v_s_corp_taxed then
    v_flags := array_append(v_flags, 's_election_review');
  end if;
  if coalesce((a #>> '{elections,form_8832_filed}')::boolean, false) or v_c_corp_taxed_llc or (a #>> '{entity,accounting_period_changed}')::boolean then
    v_flags := array_append(v_flags, 'form_8832_review');
  end if;

  if (a #>> '{entity,tax_year_type}') = 'fiscal' then v_flags := array_append(v_flags, 'fiscal_year_entity'); end if;
  if coalesce((a #>> '{entity,business_name_changed}')::boolean, false) or coalesce((a #>> '{entity,address_changed}')::boolean, false) then
    v_flags := array_append(v_flags, 'entity_profile_change');
  end if;

  if coalesce((a #>> '{filing_history,prior_return_filed}')::boolean, true) = false then v_flags := array_append(v_flags, 'missing_prior_return'); end if;
  if coalesce((a #>> '{filing_history,unfiled_years}')::boolean, false) then v_flags := array_append(v_flags, 'unfiled_years'); v_special := true; end if;
  if coalesce((a #>> '{filing_history,irs_state_notice}')::boolean, false) then v_flags := array_append(v_flags, 'irs_state_notice'); v_special := true; end if;

  if coalesce((a #>> '{business_status,was_sold}')::boolean, false) then v_flags := array_append(v_flags, 'business_sale'); v_special := true; end if;
  if coalesce((a #>> '{business_status,was_merged}')::boolean, false) or coalesce((a #>> '{business_status,was_converted}')::boolean, false) then
    v_flags := array_append(v_flags, 'merger_or_conversion'); v_special := true;
  end if;
  if coalesce((a #>> '{business_status,dissolved}')::boolean, false) then v_flags := array_append(v_flags, 'dissolution'); v_special := true; end if;
  if coalesce((a #>> '{business_status,ownership_changed}')::boolean, false) then v_flags := array_append(v_flags, 'ownership_change'); end if;

  -- Owners: ownership-percentage total, beginning/ending mismatch, no-effective-date
  if jsonb_typeof(a -> 'owners') = 'array' then
    for v_owner in select * from jsonb_array_elements(a -> 'owners') d loop
      if (v_owner.value ->> 'ownership_pct') is not null and (v_owner.value ->> 'ownership_pct') <> '' then
        v_any_owner_pct := true;
        v_pct_total := v_pct_total + coalesce((v_owner.value ->> 'ownership_pct')::numeric, 0);
      end if;
      if coalesce((v_owner.value ->> 'ownership_changed_during_year')::boolean, false)
         and coalesce(v_owner.value ->> 'ownership_change_effective_date', '') = ''
      then
        v_flags := array_append(v_flags, 'ownership_change_missing_effective_date');
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
  if (select bool_or(coalesce((o.value ->> 'had_loans')::boolean, false)) from jsonb_array_elements(coalesce(a -> 'owners', '[]'::jsonb)) o) then
    v_flags := array_append(v_flags, 'related_party_transactions');
  end if;
  if (select bool_or(coalesce((o.value ->> 'is_foreign')::boolean, false)) from jsonb_array_elements(coalesce(a -> 'owners', '[]'::jsonb)) o) then
    v_flags := array_append(v_flags, 'foreign_ownership_review');
    v_special := true;
  end if;

  -- State activity (Part 9 redesign)
  if coalesce((a #>> '{state_activity,offices_other_states}')::boolean, false)
     or coalesce((a #>> '{state_activity,employees_other_states}')::boolean, false)
     or coalesce((a #>> '{state_activity,property_inventory_other_states}')::boolean, false)
     or coalesce((a #>> '{state_activity,registered_other_states}')::boolean, false)
     or coalesce((a #>> '{state_activity,prior_state_returns}')::boolean, false)
     or coalesce((a #>> '{state_activity,services_performed_other_states}')::boolean, false)
     or coalesce((a #>> '{state_activity,marketplace_online_sales}')::boolean, false)
     or coalesce((a #>> '{state_activity,payroll_other_states}')::boolean, false)
     or coalesce((a #>> '{state_activity,sales_tax_registrations}')::boolean, false)
  then
    v_flags := array_append(v_flags, 'multistate_return_review');
    v_flags := array_append(v_flags, 'state_filing_review');
  end if;
  if coalesce((a #>> '{state_activity,unsure}')::boolean, false) then
    v_flags := array_append(v_flags, 'state_filing_review');
  end if;
  if coalesce((a #>> '{state_activity,marketplace_online_sales}')::boolean, false)
     and (a #>> '{state_activity,sales_by_state_report_available}') <> 'yes'
  then
    v_flags := array_append(v_flags, 'sales_by_state_report_needed');
  end if;

  -- Foreign activity (Part 9 redesign)
  if coalesce((a #>> '{foreign_activity,has_foreign_activity}')::boolean, false) then
    v_flags := array_append(v_flags, 'foreign_reporting_review');
    v_special := true;
    if not (
      coalesce((a #>> '{foreign_activity,categories,foreign_owners}')::boolean, false)
      or coalesce((a #>> '{foreign_activity,categories,foreign_accounts}')::boolean, false)
      or coalesce((a #>> '{foreign_activity,categories,foreign_income}')::boolean, false)
      or coalesce((a #>> '{foreign_activity,categories,foreign_property}')::boolean, false)
      or coalesce((a #>> '{foreign_activity,categories,foreign_subsidiary}')::boolean, false)
      or coalesce((a #>> '{foreign_activity,categories,foreign_related_party}')::boolean, false)
      or coalesce((a #>> '{foreign_activity,categories,foreign_loans}')::boolean, false)
      or coalesce((a #>> '{foreign_activity,categories,foreign_transactions}')::boolean, false)
    ) then
      v_flags := array_append(v_flags, 'foreign_activity_category_unclear');
    end if;
  end if;

  -- Income screening
  if coalesce((a #>> '{income_sources,rental_real_estate}')::boolean, false) then v_flags := array_append(v_flags, 'rental_real_estate_screening'); end if;
  if coalesce((a #>> '{income_sources,portfolio_investment}')::boolean, false) then v_flags := array_append(v_flags, 'portfolio_income_screening'); end if;
  if coalesce((a #>> '{income_sources,marketplace_platform_income}')::boolean, false) then v_flags := array_append(v_flags, 'marketplace_income_reconciliation'); end if;
  if coalesce((a #>> '{income_sources,cash_income}')::boolean, false) then v_flags := array_append(v_flags, 'unrecorded_income_review'); v_consult := true; end if;
  if coalesce((a #>> '{income_sources,debt_cancellation}')::boolean, false) then v_flags := array_append(v_flags, 'cancellation_of_debt_income'); v_special := true; end if;

  -- Deductions screening
  if coalesce((a #>> '{deductions_screening,owner_paid_business_expenses}')::boolean, false)
     or coalesce((a #>> '{deductions_screening,business_expenses_paid_personally}')::boolean, false)
  then
    v_flags := array_append(v_flags, 'owner_expense_reimbursement_review');
  end if;
  if coalesce((a #>> '{deductions_screening,home_office_or_owner_reimbursement}')::boolean, false) then
    v_flags := array_append(v_flags, 'home_office_reimbursement_review');
  end if;

  -- Bookkeeping
  if (a #>> '{bookkeeping,status}') in ('incomplete', 'none') then
    v_flags := array_append(v_flags, 'bookkeeping_cleanup_recommended');
    v_consult := true;
  elsif (a #>> '{bookkeeping,status}') in ('mostly', 'unsure') then
    v_flags := array_append(v_flags, 'bookkeeping_cleanup_recommended');
  end if;
  if (a #>> '{bookkeeping,bank_reconciled}') in ('no', 'unsure') then
    v_flags := array_append(v_flags, 'bookkeeping_cleanup_recommended');
  end if;

  -- Inventory
  if coalesce((a #>> '{inventory,carries_inventory}')::boolean, false) then
    v_flags := array_append(v_flags, 'inventory_cogs_screening');
    if (a #>> '{inventory,records_available}') in ('no', '') then v_flags := array_append(v_flags, 'inventory_review'); end if;
    if coalesce((a #>> '{inventory,has_obsolete_damaged}')::boolean, false) then v_flags := array_append(v_flags, 'inventory_review'); end if;
  end if;

  -- Payroll / contractors
  if coalesce((a #>> '{payroll,has_employees}')::boolean, false) then
    if coalesce((a #>> '{payroll,all_returns_filed}')::boolean, true) = false
       or coalesce((a #>> '{payroll,late_deposits}')::boolean, false)
       or coalesce((a #>> '{payroll,unpaid_payroll_tax}')::boolean, false)
       or coalesce((a #>> '{payroll,reports_available}')::boolean, true) = false
    then
      v_flags := array_append(v_flags, 'payroll_compliance_review');
    end if;
    if coalesce((a #>> '{payroll,late_deposits}')::boolean, false) then v_flags := array_append(v_flags, 'late_payroll_filing'); end if;
    if coalesce((a #>> '{payroll,unpaid_payroll_tax}')::boolean, false) then v_flags := array_append(v_flags, 'unpaid_payroll_tax'); v_special := true; end if;
  end if;
  if coalesce((a #>> '{contractors,has_contractors}')::boolean, false)
     and (
       coalesce((a #>> '{contractors,unreported_payments}')::boolean, false)
       or coalesce((a #>> '{contractors,worker_classification_concern}')::boolean, false)
       or (a #>> '{contractors,forms_1099_filed}') in ('no', 'unsure')
     )
  then
    v_flags := array_append(v_flags, 'contractor_reporting_review');
  end if;

  -- Owner compensation
  if v_s_corp_taxed then
    v_flags := array_append(v_flags, 's_corp_reasonable_compensation_review');
  end if;
  if (select bool_or(coalesce((o.value ->> 'received_compensation')::boolean, false) or coalesce((o.value ->> 'received_distributions')::boolean, false))
      from jsonb_array_elements(coalesce(a -> 'owners', '[]'::jsonb)) o)
  then
    v_flags := array_append(v_flags, 'owner_compensation_review');
  end if;
  if v_partnership_taxed and (select bool_or(coalesce((o.value ->> 'received_guaranteed_payments')::boolean, false)) from jsonb_array_elements(coalesce(a -> 'owners', '[]'::jsonb)) o) then
    v_flags := array_append(v_flags, 'guaranteed_payments_review');
  end if;
  if v_s_corp_taxed and (select bool_or(coalesce((o.value ->> 'shareholder_health_insurance')::boolean, false)) from jsonb_array_elements(coalesce(a -> 'owners', '[]'::jsonb)) o) then
    v_flags := array_append(v_flags, 'shareholder_health_insurance_review');
  end if;
  if v_true_c_corp and coalesce((a #>> '{c_corp,dividends_paid}')::boolean, false) then
    v_flags := array_append(v_flags, 'dividends_review');
  end if;

  -- Equity
  if coalesce((a #>> '{equity,negative_capital_accounts}')::boolean, false) then
    v_flags := array_append(v_flags, 'negative_capital_review');
    v_special := true;
  end if;

  -- Assets
  if coalesce((a #>> '{assets,disposed_assets}')::boolean, false) then v_flags := array_append(v_flags, 'asset_sale'); end if;

  -- Changes/compliance
  if coalesce((a #>> '{changes_compliance,related_party,with_owners}')::boolean, false)
     or coalesce((a #>> '{changes_compliance,related_party,with_relatives}')::boolean, false)
     or coalesce((a #>> '{changes_compliance,related_party,with_commonly_owned}')::boolean, false)
  then
    v_flags := array_append(v_flags, 'related_party_transactions');
  end if;
  if coalesce((a #>> '{changes_compliance,tax_compliance,audit}')::boolean, false)
     or coalesce((a #>> '{changes_compliance,tax_compliance,lien_or_levy}')::boolean, false)
  then
    v_special := true;
  end if;
  if coalesce((a #>> '{changes_compliance,special_transactions,lawsuit_settlement}')::boolean, false) then
    v_flags := array_append(v_flags, 'lawsuit_settlement_review'); v_special := true;
  end if;
  if coalesce((a #>> '{changes_compliance,special_transactions,bankruptcy}')::boolean, false) then
    v_flags := array_append(v_flags, 'bankruptcy_review'); v_special := true;
  end if;
  if coalesce((a #>> '{changes_compliance,special_transactions,disaster_loss}')::boolean, false) then
    v_flags := array_append(v_flags, 'disaster_loss_review');
  end if;
  if coalesce((a #>> '{changes_compliance,special_transactions,fraud_theft_embezzlement}')::boolean, false) then
    v_flags := array_append(v_flags, 'fraud_theft_review'); v_special := true;
  end if;

  -- Deduplicate flags (several branches above can append the same flag twice)
  select array_agg(distinct f) into v_flags from unnest(v_flags) f;

  -- Complexity
  if (select count(*) from jsonb_array_elements(coalesce(a -> 'owners', '[]'::jsonb))) > 0
     and (
       coalesce((a #>> '{state_activity,offices_other_states}')::boolean, false)
       or coalesce((a #>> '{state_activity,employees_other_states}')::boolean, false)
       or coalesce((a #>> '{state_activity,property_inventory_other_states}')::boolean, false)
       or coalesce((a #>> '{state_activity,marketplace_online_sales}')::boolean, false)
     )
     or coalesce((a #>> '{foreign_activity,has_foreign_activity}')::boolean, false)
     or coalesce((a #>> '{business_status,ownership_changed}')::boolean, false)
     or (a #>> '{return_status,needs_amendment}') = 'yes'
     or (a #>> '{entity,tax_year_type}') = 'fiscal'
     or (a #>> '{return_status,is_short_period}') = 'yes'
     or 'bookkeeping_cleanup_recommended' = any(v_flags)
     or 'payroll_compliance_review' = any(v_flags)
     or 'contractor_reporting_review' = any(v_flags)
     or 'basis_records_review' = any(v_flags)
     or 'inventory_cogs_screening' = any(v_flags)
  then
    v_complexity := 'Complex';
  end if;
  if v_special
     or coalesce((a #>> '{filing_history,unfiled_years}')::boolean, false)
     or coalesce((a #>> '{filing_history,irs_state_notice}')::boolean, false)
     or coalesce((a #>> '{business_status,was_sold}')::boolean, false)
     or coalesce((a #>> '{business_status,was_merged}')::boolean, false)
     or coalesce((a #>> '{business_status,was_converted}')::boolean, false)
     or coalesce((a #>> '{business_status,dissolved}')::boolean, false)
     or r.entity_classification = 'unsure'
     or ('s_election_review' = any(v_flags) and coalesce((a #>> '{elections,election_accepted}')::boolean, true) = false)
     or 'foreign_ownership_review' = any(v_flags)
  then
    v_complexity := 'Special Review';
  end if;

  v_consult := v_consult or v_complexity = 'Special Review' or r.entity_classification = 'unsure'
    or coalesce((a #>> '{filing_history,irs_state_notice}')::boolean, false);

  update public.intakes
  set review_flags = coalesce(v_flags, '{}'), complexity_classification = v_complexity, consultation_recommended = v_consult
  where id = p_intake_id;

  perform public.recompute_business_reasonable_inquiries(p_intake_id);
end;
$function$;

-- ---------------------------------------------------------------------
-- 4. regenerate_business_intake_document_requests -- updated for the
--    redesigned answer shape (inventory as its own block, no generic
--    financial_records.inventory_records checkbox).
-- ---------------------------------------------------------------------
create or replace function public.regenerate_business_intake_document_requests(p_intake_id uuid)
returns void language plpgsql as $function$
declare
  r public.intakes%rowtype;
  a jsonb;
  v_keys text[] := array['photo_id'];
  v_rule record;
  v_is_corp boolean;
  v_is_llc boolean;
begin
  select * into r from public.intakes where id = p_intake_id;
  if not found then return; end if;
  a := coalesce(r.answers, '{}'::jsonb);
  v_is_corp := r.entity_classification in ('c_corp', 's_corp');
  v_is_llc := r.entity_classification in ('smllc_s_corp', 'smllc_c_corp', 'mmllc_partnership', 'mmllc_s_corp', 'mmllc_c_corp');

  drop table if exists _biz_doc_rules;
  create temp table _biz_doc_rules (item_key text, item_title text, item_reason text, is_required boolean, is_blocking boolean, sort_order int) on commit drop;

  insert into _biz_doc_rules values ('photo_id', 'Government-issued photo ID (primary contact)', 'Confirms your identity for the return.', true, true, 1);
  insert into _biz_doc_rules values ('ein_confirmation_letter', 'EIN confirmation letter (CP 575 or 147C)', 'Confirms the business''s EIN.', false, true, 2);

  -- Identity and classification
  if coalesce(r.entity_classification = 'partnership', false) or coalesce(r.entity_classification = 'mmllc_partnership', false) then
    insert into _biz_doc_rules values ('partnership_agreement', 'Partnership or operating agreement', 'Ownership and allocation terms.', true, true, 3);
  elsif v_is_corp then
    insert into _biz_doc_rules values ('formation_documents', 'Articles of incorporation, bylaws', 'Confirms entity structure.', true, true, 3);
  elsif v_is_llc then
    insert into _biz_doc_rules values ('formation_documents', 'Articles of organization, operating agreement', 'Confirms entity structure.', true, true, 3);
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
  if (a #>> '{return_status,needs_amendment}') = 'yes' and coalesce((a #>> '{filing_history,prior_copy_available}')::boolean, false) = false then
    insert into _biz_doc_rules values ('irs_transcript_request', 'IRS return transcript (if original copy unavailable)', 'Needed to prepare an accurate amendment.', false, true, 9);
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
  if coalesce((a #>> '{inventory,carries_inventory}')::boolean, false) then
    insert into _biz_doc_rules values ('inventory_report', 'Inventory report (beginning/ending, method)', 'Needed to compute cost of goods sold.', true, true, 18);
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
  if coalesce((a #>> '{filing_history,irs_state_notice}')::boolean, false) then
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
  if coalesce((a #>> '{changes_compliance,special_transactions,lawsuit_settlement}')::boolean, false) then
    insert into _biz_doc_rules values ('settlement_documents', 'Settlement agreement', 'Determines tax treatment of the settlement.', false, true, 34);
  end if;
  if coalesce((a #>> '{changes_compliance,special_transactions,bankruptcy}')::boolean, false) then
    insert into _biz_doc_rules values ('bankruptcy_documents', 'Bankruptcy filing documents', 'Determines tax treatment of discharged debt.', false, true, 35);
  end if;
  if coalesce((a #>> '{changes_compliance,special_transactions,disaster_loss}')::boolean, false) then
    insert into _biz_doc_rules values ('disaster_loss_documents', 'Insurance/casualty-loss documentation', 'Supports a casualty/disaster loss deduction.', false, false, 36);
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
-- 5. start_public_business_intake -- validation list updated to the 9
--    business-routable classification values (sole_prop and
--    smllc_individual route to the Individual Intake and never reach
--    this RPC).
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
    'smllc_s_corp', 'smllc_c_corp', 'mmllc_partnership', 'mmllc_s_corp', 'mmllc_c_corp',
    's_corp', 'c_corp', 'partnership', 'unsure'
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
grant execute on function public.start_public_business_intake(uuid, integer, text, text, text, text, text, text) to anon, authenticated;
