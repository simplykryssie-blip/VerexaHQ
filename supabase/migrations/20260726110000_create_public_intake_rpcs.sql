-- Public tax intake — Phase 2 (PR A) RPCs.
--
-- Security model, confirmed against how Supabase actually separates roles
-- (not just an app-layer convention): three distinct Postgres roles reach
-- these functions -- anon (the public intake pages, unauthenticated),
-- authenticated (signed-in staff), and service_role (server-only, used
-- exclusively from Next.js API routes that hold SUPABASE_SERVICE_ROLE_KEY,
-- never sent to the browser). Functions that must never let the calling
-- browser see a secret (the verification code) are REVOKEd from anon and
-- authenticated and GRANTed to service_role only -- enforced by Postgres
-- itself, not just by which endpoint the frontend happens to call. Every
-- public-facing function re-validates its own token/challenge on every
-- call; none of them trust RLS to do that work, since these tables carry
-- no anon-reachable policies at all (previous migration).

alter table public.intakes add column if not exists return_variant text check (return_variant in ('original', 'amended', 'prior_year'));

-- ---------------------------------------------------------------------
-- Normalization helpers. Phone normalization mirrors the same
-- strip-to-digits convention already used client-side in
-- ClientModal.tsx's formatPhone(); kept US-centric (last 10 digits) to
-- match how phone numbers are already stored/displayed everywhere else
-- in this app.
-- ---------------------------------------------------------------------
create or replace function public.normalize_intake_email(p_email text)
returns text language sql immutable as $$
  select nullif(lower(trim(p_email)), '');
$$;

create or replace function public.normalize_intake_phone(p_phone text)
returns text language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10), '');
$$;

-- ---------------------------------------------------------------------
-- Derives review_flags / complexity_classification / consultation_
-- recommended from the intake's own normalized columns. This is a
-- starting recommendation only -- every one of these fields stays
-- staff-editable after generation (see staff-facing UI), never presented
-- as a guarantee to the taxpayer.
-- ---------------------------------------------------------------------
create or replace function public.recompute_intake_flags(p_intake_id uuid)
returns void language plpgsql as $function$
declare
  r record;
  v_flags text[] := '{}';
  v_complexity text := 'Basic';
  v_consult boolean := false;
begin
  select * into r from public.intakes where id = p_intake_id;
  if not found then return; end if;

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

  if coalesce(r.business_count, 0) > 0 or coalesce(r.rental_count, 0) > 0
     or 'self_employment' = any(r.income_sources) or 'k1' = any(r.income_sources) then
    v_complexity := 'Standard';
  end if;
  if coalesce(r.business_count, 0) > 1 or coalesce(r.rental_count, 0) > 1 or coalesce(r.has_cryptocurrency, false) or coalesce(r.has_foreign_income, false)
     or coalesce(array_length(r.states_lived_worked, 1), 0) > 1 or coalesce(r.has_unfiled_years, false) or coalesce(r.has_irs_state_notice, false) then
    v_complexity := 'Complex';
  end if;
  if coalesce(r.has_irs_state_notice, false) and (coalesce(r.has_unfiled_years, false) or coalesce(r.business_count, 0) > 0) then
    v_complexity := 'Special Review';
  end if;

  v_consult := v_complexity in ('Complex', 'Special Review') or coalesce(r.has_irs_state_notice, false) or coalesce(r.has_unfiled_years, false) or coalesce(r.payment_preference = 'discuss', false);

  update public.intakes
  set review_flags = v_flags, complexity_classification = v_complexity, consultation_recommended = v_consult
  where id = p_intake_id;
end;
$function$;

-- ---------------------------------------------------------------------
-- Rule-based personalized document checklist. Additive (ON CONFLICT DO
-- NOTHING keyed by the unique (intake_id, item_key)) and only removes a
-- rule-driven item that's still untouched ('requested') and no longer
-- applies -- an item the taxpayer already uploaded against, or that
-- staff has already reviewed/waived, is never silently removed just
-- because an earlier answer changed. 'photo_id' and 'other_documents'
-- are always present as the two constant items.
-- ---------------------------------------------------------------------
create or replace function public.regenerate_intake_document_requests(p_intake_id uuid)
returns void language plpgsql as $function$
declare
  r public.intakes%rowtype;
  v_keys text[] := array['photo_id', 'other_documents'];
  v_rule record;
begin
  select * into r from public.intakes where id = p_intake_id;
  if not found then return; end if;

  create temp table if not exists _intake_doc_rules (item_key text, item_title text, item_reason text, is_required boolean, is_blocking boolean, sort_order int) on commit drop;
  delete from _intake_doc_rules;

  insert into _intake_doc_rules values ('photo_id', 'Government-issued photo ID', 'Confirms your identity for the return.', true, true, 1);
  insert into _intake_doc_rules values ('other_documents', 'Other documents', 'Anything else you think we should see.', false, false, 99);

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

-- ---------------------------------------------------------------------
-- Matching. Exact match only ever uses a VERIFIED channel (this function
-- is only ever called right after a challenge is marked verified) --
-- never a raw, unverified entered value, and never archived/test client
-- shells. Approximate (name-only) matches always go to
-- intake_possible_matches for staff review, never auto-linked.
-- ---------------------------------------------------------------------
create or replace function public.match_intake_contact(p_intake_id uuid)
returns void language plpgsql as $function$
declare
  r public.intakes%rowtype;
  v_exact_id uuid;
  v_exact_count int;
  v_candidate record;
begin
  select * into r from public.intakes where id = p_intake_id;
  if not found then return; end if;

  if r.matched_client_id is null then
    if r.contact_email_verified and r.contact_email_normalized is not null then
      select count(*), (array_agg(id))[1] into v_exact_count, v_exact_id
        from public.clients
        where workspace_id = r.workspace_id and status <> 'archived' and lower(trim(email)) = r.contact_email_normalized;
      if v_exact_count = 1 then
        update public.intakes set matched_client_id = v_exact_id where id = p_intake_id;
      end if;
    end if;
  end if;

  if r.matched_client_id is null then
    if r.contact_phone_verified and r.contact_phone_normalized is not null then
      select count(*), (array_agg(id))[1] into v_exact_count, v_exact_id
        from public.clients
        where workspace_id = r.workspace_id and status <> 'archived'
          and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = r.contact_phone_normalized;
      if v_exact_count = 1 then
        update public.intakes set matched_client_id = v_exact_id where id = p_intake_id;
      end if;
    end if;
  end if;

  -- Approximate/name-only candidates always go to review, even when an
  -- exact match was already found (a same-named different person could
  -- still be relevant for staff to see) -- never used to auto-link.
  for v_candidate in
    select id from public.clients
    where workspace_id = r.workspace_id and status <> 'archived'
      and id is distinct from r.matched_client_id
      and (
        (lower(trim(first_name)) = lower(trim(r.contact_first_name)) and lower(trim(last_name)) = lower(trim(r.contact_last_name)))
      )
  loop
    insert into public.intake_possible_matches (intake_id, candidate_client_id, match_reason)
    values (p_intake_id, v_candidate.id, 'name_similarity')
    on conflict (intake_id, candidate_client_id) do nothing;
  end loop;

  update public.intakes set has_possible_matches = exists(select 1 from public.intake_possible_matches where intake_id = p_intake_id and not reviewed)
  where id = p_intake_id;
end;
$function$;

-- ---------------------------------------------------------------------
-- start_public_intake — anon-callable. Creates the lead, the intake, and
-- the first return token in one transaction.
-- ---------------------------------------------------------------------
create or replace function public.start_public_intake(
  p_workspace_id uuid,
  p_tax_year integer,
  p_return_type text,
  p_is_returning boolean,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text
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
  v_email_norm text := public.normalize_intake_email(p_email);
  v_phone_norm text := public.normalize_intake_phone(p_phone);
begin
  if not exists (select 1 from public.workspaces where id = p_workspace_id) then
    raise exception 'Workspace not found.';
  end if;
  if coalesce(trim(p_first_name), '') = '' or coalesce(trim(p_last_name), '') = '' then
    raise exception 'First and last name are required.';
  end if;
  if v_email_norm is null and v_phone_norm is null then
    raise exception 'An email or mobile number is required.';
  end if;

  insert into public.marketing_leads (workspace_id, first_name, last_name, email, phone, lead_status, interested_service)
  values (p_workspace_id, trim(p_first_name), trim(p_last_name), v_email_norm, p_phone, 'New', 'tax_preparation')
  returning id into v_lead_id;

  insert into public.intakes (
    workspace_id, service_type, tax_year, return_type, is_returning_client,
    contact_first_name, contact_last_name, contact_email, contact_email_normalized, contact_phone, contact_phone_normalized,
    lead_id, status
  ) values (
    p_workspace_id, 'tax_preparation', p_tax_year, p_return_type, p_is_returning,
    trim(p_first_name), trim(p_last_name), p_email, v_email_norm, p_phone, v_phone_norm,
    v_lead_id, 'intake_started'
  ) returning id into v_intake_id;

  insert into public.intake_status_history (intake_id, from_status, to_status) values (v_intake_id, null, 'intake_started');

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_exp := now() + interval '30 days';
  insert into public.intake_return_tokens (intake_id, token_hash, expires_at)
  values (v_intake_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_exp);

  perform public.regenerate_intake_document_requests(v_intake_id);
  perform public.recompute_intake_flags(v_intake_id);

  return query select v_intake_id, v_token, v_exp;
end;
$function$;

-- ---------------------------------------------------------------------
-- resume_public_intake — anon-callable. Validates the token, never trusts
-- it as proof of verified contact ownership.
-- ---------------------------------------------------------------------
create or replace function public.resume_public_intake(p_token text)
returns public.intakes
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_row public.intake_return_tokens%rowtype;
  v_intake public.intakes%rowtype;
begin
  select * into v_row from public.intake_return_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found or v_row.status <> 'active' or v_row.revoked_at is not null or v_row.expires_at <= now() then
    raise exception 'This link is invalid or has expired.';
  end if;

  update public.intake_return_tokens set last_used_at = now(), use_count = use_count + 1 where id = v_row.id;

  select * into v_intake from public.intakes where id = v_row.intake_id;
  return v_intake;
end;
$function$;

-- ---------------------------------------------------------------------
-- save_intake_progress — anon-callable. p_patch merges into `answers`;
-- known keys are also copied into their normalized column so they stay
-- searchable/filterable, per the "don't put everything in one JSON blob"
-- requirement.
-- ---------------------------------------------------------------------
create or replace function public.save_intake_progress(p_token text, p_section integer, p_patch jsonb)
returns public.intakes
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_row public.intake_return_tokens%rowtype;
  v_intake_id uuid;
  v_status text;
begin
  select * into v_row from public.intake_return_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found or v_row.status <> 'active' or v_row.revoked_at is not null or v_row.expires_at <= now() then
    raise exception 'This link is invalid or has expired.';
  end if;
  v_intake_id := v_row.intake_id;

  select status into v_status from public.intakes where id = v_intake_id;
  if v_status not in ('intake_started', 'intake_in_progress', 'verification_pending') then
    raise exception 'This intake has already been submitted and can no longer be edited here.';
  end if;

  update public.intakes set
    answers = answers || p_patch,
    current_section = greatest(current_section, p_section),
    status = case when status = 'intake_started' then 'intake_in_progress' else status end,
    contact_first_name = coalesce(p_patch->>'contact_first_name', contact_first_name),
    contact_last_name = coalesce(p_patch->>'contact_last_name', contact_last_name),
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

  perform public.regenerate_intake_document_requests(v_intake_id);
  perform public.recompute_intake_flags(v_intake_id);

  insert into public.intake_versions (intake_id, version_number, version_type, answers_snapshot, normalized_snapshot)
  select v_intake_id, coalesce((select max(version_number) from public.intake_versions where intake_id = v_intake_id), 0) + 1, 'draft',
    i.answers, to_jsonb(i.*) - 'answers'
  from public.intakes i where i.id = v_intake_id;

  return (select i from public.intakes i where i.id = v_intake_id);
end;
$function$;

revoke execute on function public.save_intake_progress(text, integer, jsonb) from public;
grant execute on function public.save_intake_progress(text, integer, jsonb) to anon, authenticated;
revoke execute on function public.start_public_intake(uuid, integer, text, boolean, text, text, text, text) from public;
grant execute on function public.start_public_intake(uuid, integer, text, boolean, text, text, text, text) to anon, authenticated;
revoke execute on function public.resume_public_intake(text) from public;
grant execute on function public.resume_public_intake(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- generate_intake_verification_code — service_role ONLY. This is the one
-- function in this whole system that ever holds a code in plaintext, and
-- only for the instant it takes to return it to the Next.js API route
-- that immediately emails/texts it and discards it. Enforced by Postgres
-- role grants, not just by which endpoint the frontend calls: anon and
-- authenticated cannot execute this function at all, so even a browser
-- calling it directly with the publishable key gets a permission error,
-- not a code. Resend cooldown (60s) and a supersede-the-previous-pending-
-- challenge pattern (mirroring create_portal_invitation's own "revoke
-- any prior pending invite" behavior) are enforced here, not left to the
-- caller.
-- ---------------------------------------------------------------------
create or replace function public.generate_intake_verification_code(
  p_intake_id uuid,
  p_channel text,
  p_destination text
)
returns table(raw_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_dest_norm text;
  v_code text;
  v_exp timestamptz;
  v_last_sent timestamptz;
  v_resend_count int;
begin
  if p_channel not in ('email', 'sms') then raise exception 'Invalid channel.'; end if;
  if not exists (select 1 from public.intakes where id = p_intake_id) then raise exception 'Intake not found.'; end if;

  v_dest_norm := case when p_channel = 'email' then public.normalize_intake_email(p_destination) else public.normalize_intake_phone(p_destination) end;
  if v_dest_norm is null then raise exception 'A valid destination is required.'; end if;

  select last_sent_at, resend_count into v_last_sent, v_resend_count
    from public.intake_verification_challenges
    where intake_id = p_intake_id and channel = p_channel and status = 'pending'
    order by created_at desc limit 1;

  if v_last_sent is not null and v_last_sent > now() - interval '60 seconds' then
    raise exception 'Please wait before requesting another code.';
  end if;

  -- Supersede any still-pending challenge for this channel before issuing
  -- a new one -- only the most recent code is ever valid.
  update public.intake_verification_challenges set status = 'invalidated'
    where intake_id = p_intake_id and channel = p_channel and status = 'pending';

  v_code := lpad((floor(random() * 1000000))::text, 6, '0');
  v_exp := now() + interval '10 minutes';

  insert into public.intake_verification_challenges (intake_id, channel, destination_normalized, code_hash, expires_at, resend_count)
  values (p_intake_id, p_channel, v_dest_norm, encode(extensions.digest(v_code, 'sha256'), 'hex'), v_exp, coalesce(v_resend_count, 0) + case when v_last_sent is not null then 1 else 0 end);

  update public.intakes set status = case when status = 'intake_in_progress' then 'verification_pending' else status end where id = p_intake_id;

  return query select v_code, v_exp;
end;
$function$;

revoke all on function public.generate_intake_verification_code(uuid, text, text) from public, anon, authenticated;
grant execute on function public.generate_intake_verification_code(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------
-- verify_intake_code — anon-callable. Safe to expose: only compares a
-- hash and enforces attempt/expiry limits, never reveals the code.
-- ---------------------------------------------------------------------
create or replace function public.verify_intake_code(p_token text, p_channel text, p_code text)
returns table (intake public.intakes, new_token text)
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_row public.intake_return_tokens%rowtype;
  v_intake_id uuid;
  v_challenge public.intake_verification_challenges%rowtype;
  v_new_token text;
begin
  select * into v_row from public.intake_return_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found or v_row.status <> 'active' or v_row.revoked_at is not null or v_row.expires_at <= now() then
    raise exception 'This link is invalid or has expired.';
  end if;
  v_intake_id := v_row.intake_id;

  select * into v_challenge from public.intake_verification_challenges
    where intake_id = v_intake_id and channel = p_channel and status = 'pending'
    order by created_at desc limit 1 for update;

  if not found then
    raise exception 'No verification code is pending for this contact method. Request a new code.';
  end if;
  if v_challenge.expires_at <= now() then
    update public.intake_verification_challenges set status = 'expired' where id = v_challenge.id;
    raise exception 'This code has expired. Request a new one.';
  end if;
  if v_challenge.attempt_count >= v_challenge.max_attempts then
    update public.intake_verification_challenges set status = 'invalidated' where id = v_challenge.id;
    raise exception 'Too many incorrect attempts. Request a new code.';
  end if;

  if encode(extensions.digest(coalesce(p_code, ''), 'sha256'), 'hex') <> v_challenge.code_hash then
    update public.intake_verification_challenges set attempt_count = attempt_count + 1 where id = v_challenge.id;
    raise exception 'That code is incorrect.';
  end if;

  update public.intake_verification_challenges set status = 'verified', verified_at = now() where id = v_challenge.id;

  if p_channel = 'email' then
    update public.intakes set contact_email_verified = true where id = v_intake_id;
  else
    update public.intakes set contact_phone_verified = true where id = v_intake_id;
  end if;

  update public.intakes set status = case when status = 'verification_pending' then 'intake_in_progress' else status end where id = v_intake_id;

  perform public.match_intake_contact(v_intake_id);

  -- Token rotation after a sensitive event: the old token is revoked and
  -- a fresh one takes over; the caller must switch to the returned token
  -- for anything after this point (resume_public_intake with the old
  -- token will now fail).
  v_new_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.intake_return_tokens set status = 'revoked', revoked_at = now() where id = v_row.id;
  insert into public.intake_return_tokens (intake_id, token_hash, expires_at)
  values (v_intake_id, encode(extensions.digest(v_new_token, 'sha256'), 'hex'), now() + interval '30 days');

  return query select i, v_new_token from public.intakes i where i.id = v_intake_id;
end;
$function$;

revoke execute on function public.verify_intake_code(text, text, text) from public;
grant execute on function public.verify_intake_code(text, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- submit_intake — anon-callable. Requires at least one verified contact
-- method; a valid token alone is never sufficient. Idempotent against
-- double-click: once status is already past the editable states, this
-- just returns the current row instead of re-submitting.
-- ---------------------------------------------------------------------
create or replace function public.submit_intake(
  p_token text,
  p_typed_name text,
  p_accuracy_ack boolean,
  p_communication_consent boolean,
  p_marketing_consent boolean,
  p_electronic_record_ack boolean,
  p_ip_address text default null,
  p_user_agent text default null
)
returns table (intake public.intakes, new_token text)
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_row public.intake_return_tokens%rowtype;
  v_intake_id uuid;
  v_intake public.intakes%rowtype;
  v_new_token text;
  v_version int;
  v_blocking_missing int;
begin
  select * into v_row from public.intake_return_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found or v_row.status <> 'active' or v_row.revoked_at is not null or v_row.expires_at <= now() then
    raise exception 'This link is invalid or has expired.';
  end if;
  v_intake_id := v_row.intake_id;

  select * into v_intake from public.intakes where id = v_intake_id;

  if v_intake.status not in ('intake_started', 'intake_in_progress', 'verification_pending') then
    -- Already submitted (or beyond) — safe no-op for double-click / retry.
    return query select v_intake, null::text;
    return;
  end if;

  if not (v_intake.contact_email_verified or v_intake.contact_phone_verified) then
    raise exception 'Please verify your email or mobile number before submitting.';
  end if;
  if coalesce(trim(p_typed_name), '') = '' then
    raise exception 'Please type your full name to submit.';
  end if;
  if not coalesce(p_accuracy_ack, false) then
    raise exception 'Please confirm the accuracy acknowledgment before submitting.';
  end if;
  if not coalesce(p_electronic_record_ack, false) then
    raise exception 'Please confirm the electronic-record acknowledgment before submitting.';
  end if;

  select count(*) into v_blocking_missing from public.intake_document_requests
    where intake_id = v_intake_id and is_blocking and status in ('requested', 'replacement_needed');
  -- Submission is allowed even with blocking documents missing (the
  -- frontend warns the taxpayer beforehand) — v_blocking_missing is
  -- computed only so it can be recorded for staff visibility below.

  update public.intakes set
    status = 'intake_review_needed',
    ack_typed_name = trim(p_typed_name),
    ack_accuracy = true,
    ack_communication_consent = coalesce(p_communication_consent, false),
    ack_marketing_consent = coalesce(p_marketing_consent, false),
    ack_electronic_record = true,
    ack_ip_address = p_ip_address,
    ack_user_agent = p_user_agent,
    submitted_at = now(),
    updated_at = now()
  where id = v_intake_id;

  insert into public.intake_status_history (intake_id, from_status, to_status, reason)
  values (v_intake_id, v_intake.status, 'intake_submitted', case when v_blocking_missing > 0 then v_blocking_missing || ' required document(s) still missing at submission' else null end);
  insert into public.intake_status_history (intake_id, from_status, to_status)
  values (v_intake_id, 'intake_submitted', 'intake_review_needed');

  select coalesce(max(version_number), 0) + 1 into v_version from public.intake_versions where intake_id = v_intake_id;
  insert into public.intake_versions (intake_id, version_number, version_type, answers_snapshot, normalized_snapshot)
  select v_intake_id, v_version, 'submitted', i.answers, to_jsonb(i.*) - 'answers' from public.intakes i where i.id = v_intake_id;
  update public.intakes set submitted_version = v_version where id = v_intake_id;

  v_new_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.intake_return_tokens set status = 'revoked', revoked_at = now() where id = v_row.id;
  insert into public.intake_return_tokens (intake_id, token_hash, expires_at)
  values (v_intake_id, encode(extensions.digest(v_new_token, 'sha256'), 'hex'), now() + interval '30 days');

  return query select i, v_new_token from public.intakes i where i.id = v_intake_id;
end;
$function$;

revoke execute on function public.submit_intake(text, text, boolean, boolean, boolean, boolean, text, text) from public;
grant execute on function public.submit_intake(text, text, boolean, boolean, boolean, boolean, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Public document upload metadata — service_role ONLY, called from the
-- Next.js API route after it has already written the file to storage
-- via the service-role storage client (never exposed to the browser).
-- Independently re-validates the token and that the requested
-- checklist item actually belongs to this intake before recording
-- anything, so a stale/forged document_request_id can't attach a file
-- to the wrong intake's checklist.
-- ---------------------------------------------------------------------
create or replace function public.record_intake_document_upload(
  p_intake_id uuid,
  p_document_request_id uuid,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_storage_path text
)
returns uuid
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_workspace_id uuid;
  v_doc_id uuid;
begin
  select workspace_id into v_workspace_id from public.intakes where id = p_intake_id;
  if v_workspace_id is null then raise exception 'Intake not found.'; end if;
  if not exists (select 1 from public.intake_document_requests where id = p_document_request_id and intake_id = p_intake_id) then
    raise exception 'That document request does not belong to this intake.';
  end if;

  insert into public.intake_documents (workspace_id, intake_id, document_request_id, original_file_name, mime_type, file_size_bytes, storage_path)
  values (v_workspace_id, p_intake_id, p_document_request_id, p_original_file_name, p_mime_type, p_file_size_bytes, p_storage_path)
  returning id into v_doc_id;

  update public.intake_document_requests set status = 'uploaded', updated_at = now()
  where id = p_document_request_id and status in ('requested', 'replacement_needed', 'waiting_on_client');

  return v_doc_id;
end;
$function$;

revoke all on function public.record_intake_document_upload(uuid, uuid, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.record_intake_document_upload(uuid, uuid, text, text, bigint, text) to service_role;

-- =======================================================================
-- STAFF RPCs — authenticated only, gated by can_staff_write() on the
-- intake's own workspace_id. Every status change is funneled through
-- these (not raw client-side UPDATEs) so intake_status_history always
-- captures who did what and why.
-- =======================================================================
create or replace function public.staff_set_intake_status(p_intake_id uuid, p_new_status text, p_reason text default null)
returns public.intakes
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_workspace_id uuid;
  v_old_status text;
begin
  select workspace_id, status into v_workspace_id, v_old_status from public.intakes where id = p_intake_id;
  if v_workspace_id is null then raise exception 'Intake not found.'; end if;
  if not public.can_staff_write(v_workspace_id) then raise exception 'You do not have permission to review intakes.'; end if;

  update public.intakes set status = p_new_status, reviewed_by = auth.uid(), reviewed_at = now(),
    decline_reason = case when p_new_status = 'declined' then p_reason else decline_reason end,
    archive_reason = case when p_new_status = 'archived' then p_reason else archive_reason end,
    updated_at = now()
  where id = p_intake_id;

  insert into public.intake_status_history (intake_id, from_status, to_status, changed_by, reason)
  values (p_intake_id, v_old_status, p_new_status, auth.uid(), p_reason);

  return (select i from public.intakes i where i.id = p_intake_id);
end;
$function$;

revoke execute on function public.staff_set_intake_status(uuid, text, text) from public, anon;
grant execute on function public.staff_set_intake_status(uuid, text, text) to authenticated;

create or replace function public.staff_match_intake_to_client(p_intake_id uuid, p_client_id uuid)
returns public.intakes
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.intakes where id = p_intake_id;
  if v_workspace_id is null then raise exception 'Intake not found.'; end if;
  if not public.can_staff_write(v_workspace_id) then raise exception 'You do not have permission to review intakes.'; end if;
  if not exists (select 1 from public.clients where id = p_client_id and workspace_id = v_workspace_id) then
    raise exception 'That client does not belong to this workspace.';
  end if;

  update public.intakes set matched_client_id = p_client_id, updated_at = now() where id = p_intake_id;
  update public.intake_possible_matches set reviewed = true, reviewed_by = auth.uid(), reviewed_at = now(),
    resolution = case when candidate_client_id = p_client_id then 'linked' else 'dismissed' end
    where intake_id = p_intake_id;
  update public.intakes set has_possible_matches = false where id = p_intake_id;

  return (select i from public.intakes i where i.id = p_intake_id);
end;
$function$;

revoke execute on function public.staff_match_intake_to_client(uuid, uuid) from public, anon;
grant execute on function public.staff_match_intake_to_client(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- staff_convert_intake_to_prospective_client — creates a real client
-- (lifecycle_status='onboarding', i.e. Prospective Client) plus its
-- primary contact, links the originating marketing_lead and this
-- intake. Deliberately does not create a service — that stays Phase 3+.
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

  insert into public.clients (workspace_id, client_type, account_type, first_name, last_name, email, phone, status, lifecycle_status, source)
  values (
    v_intake.workspace_id,
    case when v_intake.return_type = 'business' then 'business' else 'individual' end,
    case when v_intake.return_type = 'business' then 'business' else 'individual' end,
    v_intake.contact_first_name, v_intake.contact_last_name, v_intake.contact_email, v_intake.contact_phone,
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

revoke execute on function public.staff_convert_intake_to_prospective_client(uuid) from public, anon;
grant execute on function public.staff_convert_intake_to_prospective_client(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- public_intake_document_requests — anon-callable read of a single
-- intake's own document checklist. intake_document_requests otherwise
-- carries only a staff-only RLS policy, so the wizard needs a token-
-- validated way to read it; this never returns storage paths or any
-- other intake's rows.
-- ---------------------------------------------------------------------
create or replace function public.public_intake_document_requests(p_token text)
returns setof public.intake_document_requests
language plpgsql
security definer
set search_path to 'public, extensions'
as $function$
declare
  v_row public.intake_return_tokens%rowtype;
begin
  select * into v_row from public.intake_return_tokens where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found or v_row.status <> 'active' or v_row.revoked_at is not null or v_row.expires_at <= now() then
    raise exception 'This link is invalid or has expired.';
  end if;
  return query select * from public.intake_document_requests where intake_id = v_row.intake_id order by sort_order;
end;
$function$;

revoke execute on function public.public_intake_document_requests(text) from public;
grant execute on function public.public_intake_document_requests(text) to anon, authenticated;
