-- =============================================================================
-- Phase 6B: Partner Onboarding Engine
--
-- One new table (partner_onboardings) that orchestrates the existing
-- machinery rather than duplicating it:
--   - the partner relationship is firm_connections (unchanged)
--   - the purchase is firm_package_purchases (unchanged)
--   - the agreement is signature_requests/signature_request_signers (unchanged)
--   - required documents are document_requests/document_request_items,
--     scoped with entity_type = 'firm_connection' the same way tasks/notes/
--     pipeline_runs already learned to do for firm connections
--   - training points at learning_courses (unchanged)
--   - bank/software setup is tracked as a flag here; firm_connections.package_id
--     stays the source of truth for the actual connection
--   - communications are ordinary automations reacting to the two new
--     trigger types below, using the existing send_email/send_notification
--     steps -- no new messaging engine
--
-- Two new dedicated trigger types replace firm_package.purchased as the
-- onboarding signal (Phase 6A's placeholder):
--   partner_onboarding.created        -- fires once, on the new record itself
--   partner_onboarding.status_changed -- fires on every status transition,
--                                         mirroring appointment.status_changed's
--                                         existing "to_status" pattern exactly
-- =============================================================================

create table public.partner_onboardings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  firm_connection_id uuid not null references public.firm_connections(id) on delete cascade,
  firm_package_purchase_id uuid references public.firm_package_purchases(id) on delete set null,
  package_id uuid references public.firm_packages(id) on delete set null,

  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'under_review', 'approved', 'setup', 'ready', 'rejected', 'withdrawn')),

  -- Applicability flags -- readiness only requires what actually applies to
  -- this partner/package (spec section 14), instead of a fixed universal list.
  agreement_required boolean not null default true,
  documents_required boolean not null default true,
  training_required boolean not null default false,
  bank_software_setup_required boolean not null default false,

  -- Application: a small catch-all for whatever isn't already captured by an
  -- existing table (workspace name/contact info, firm_connection_contacts,
  -- firm_packages, firm_connections.revenue_share_percent, etc). Deliberately
  -- not a new form-builder/response system -- see migration header.
  application_data jsonb not null default '{}',
  application_submitted_at timestamptz,

  -- Agreement: points at an existing signature_requests row (created however
  -- staff already send documents for signature -- the send_document_for_signature
  -- automation action, or set below manually).
  agreement_signature_request_id uuid references public.signature_requests(id) on delete set null,

  -- Documents: points at an existing document_requests row (entity_type =
  -- 'firm_connection'), so "which documents" stays fully configurable via the
  -- existing document_request_templates system -- no hardcoded checklist.
  document_request_id uuid references public.document_requests(id) on delete set null,

  -- Training: a pointer into the existing Learning Hub catalog, plus a plain
  -- completion flag (Phase 6B does not attempt to auto-derive completion
  -- across the workspace boundary between the child workspace's own users and
  -- learning_module_completions -- staff confirms it, same as any other
  -- checklist item here).
  learning_course_id uuid references public.learning_courses(id) on delete set null,
  training_completed_at timestamptz,

  -- Bank/software setup: a completion flag only. The actual connection detail
  -- (which package/software/bank) stays on firm_connections -- this table is
  -- not a second source of truth for it.
  bank_software_setup_completed_at timestamptz,

  review_decision text check (review_decision in ('approved', 'rejected', 'info_requested')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,

  rejected_reason text,
  rejected_at timestamptz,
  withdrawn_at timestamptz,

  assigned_staff_id uuid references auth.users(id) on delete set null,

  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The core idempotency guarantee for section 16: a given purchase can back
  -- at most one onboarding record, full stop, at the database level.
  constraint partner_onboardings_purchase_unique unique (firm_package_purchase_id)
);

-- At most one "live" onboarding per connection at a time -- a rejected or
-- withdrawn onboarding doesn't block a genuine re-application later (a new
-- row gets created then, the same "clean new record, never resurrect the old
-- one" convention Phase 6A's reinstall already established).
create unique index partner_onboardings_active_per_connection
  on public.partner_onboardings (firm_connection_id)
  where status not in ('rejected', 'withdrawn');

create index partner_onboardings_workspace_idx on public.partner_onboardings (workspace_id);
create index partner_onboardings_connection_idx on public.partner_onboardings (firm_connection_id);

create trigger set_updated_at before update on public.partner_onboardings
  for each row execute function public.set_updated_at();

alter table public.partner_onboardings enable row level security;

-- Selectable by the parent (owning) workspace's members, and by the connected
-- partner's own workspace members -- each side of the relationship can see
-- the one onboarding record that concerns them, matching the "partner/user
-- access to only their own onboarding information" requirement.
create policy partner_onboardings_select on public.partner_onboardings
  for select to public
  using (
    public.is_workspace_member(workspace_id)
    or exists (
      select 1 from public.firm_connections fc
      where fc.id = firm_connection_id and public.is_workspace_member(fc.child_workspace_id)
    )
  );

-- All mutation goes through the SECURITY DEFINER RPCs below, which each
-- re-verify is_workspace_admin against the real session -- these are
-- defense-in-depth only, same convention as every other table in this app.
create policy partner_onboardings_insert on public.partner_onboardings
  for insert to public
  with check (public.is_workspace_admin(workspace_id));

create policy partner_onboardings_update on public.partner_onboardings
  for update to public
  using (public.is_workspace_admin(workspace_id));

create policy partner_onboardings_delete on public.partner_onboardings
  for delete to public
  using (public.is_workspace_admin(workspace_id));

-- =============================================================================
-- Dedicated onboarding events
-- =============================================================================

-- Fires once, the moment a partner enters onboarding -- regardless of whether
-- the record was created by a purchase or by create_partner_onboarding().
-- This is what Phase 6A's two Marketplace workflow templates should be
-- pointed at instead of the firm_package.purchased placeholder.
create or replace function public.fire_partner_onboarding_created_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_buyer_name text;
begin
  select w.name into v_buyer_name from public.firm_connections fc join public.workspaces w on w.id = fc.child_workspace_id where fc.id = new.firm_connection_id;

  v_context := jsonb_build_object(
    'onboarding_id', new.id,
    'connection_id', new.firm_connection_id,
    'package_id', new.package_id,
    'buyer_workspace_name', v_buyer_name
  );

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'partner_onboarding.created'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, null, null) then
      insert into public.automation_runs (workspace_id, automation_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger trg_fire_partner_onboarding_created_automations
  after insert on public.partner_onboardings
  for each row execute function public.fire_partner_onboarding_created_automations();

-- Fires on every status transition -- covers every communication example in
-- spec section 17 (approved, rejected, info requested, ready) with one
-- reusable event, the same "to_status" match appointment.status_changed
-- already uses, rather than one trigger_type per status.
create or replace function public.fire_partner_onboarding_status_changed_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_buyer_name text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select w.name into v_buyer_name from public.firm_connections fc join public.workspaces w on w.id = fc.child_workspace_id where fc.id = new.firm_connection_id;

  v_context := jsonb_build_object(
    'onboarding_id', new.id,
    'connection_id', new.firm_connection_id,
    'status', new.status,
    'previous_status', old.status,
    'buyer_workspace_name', v_buyer_name
  );

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'partner_onboarding.status_changed'
      and trigger_config ->> 'to_status' = new.status
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, null, null) then
      insert into public.automation_runs (workspace_id, automation_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger trg_fire_partner_onboarding_status_changed_automations
  after update of status on public.partner_onboardings
  for each row execute function public.fire_partner_onboarding_status_changed_automations();

-- =============================================================================
-- Onboarding creation (idempotent) + purchase wiring
-- =============================================================================

-- Internal, no auth check -- callable only from trusted contexts: the
-- purchase trigger below, and create_partner_onboarding()'s admin-checked
-- wrapper. Returns the existing onboarding when one is already live for this
-- connection (or already tied to this exact purchase), never a second one.
create or replace function public._get_or_create_partner_onboarding(
  p_workspace_id uuid,
  p_firm_connection_id uuid,
  p_package_id uuid,
  p_firm_package_purchase_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if p_firm_package_purchase_id is not null then
    select id into v_id from public.partner_onboardings where firm_package_purchase_id = p_firm_package_purchase_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  select id into v_id from public.partner_onboardings
  where firm_connection_id = p_firm_connection_id and status not in ('rejected', 'withdrawn');
  if v_id is not null then
    return v_id;
  end if;

  insert into public.partner_onboardings (
    workspace_id, firm_connection_id, package_id, firm_package_purchase_id,
    bank_software_setup_required
  )
  values (
    p_workspace_id, p_firm_connection_id, p_package_id, p_firm_package_purchase_id,
    p_package_id is not null
  )
  on conflict (firm_package_purchase_id) do nothing
  returning id into v_id;

  if v_id is null then
    -- Lost a race with a concurrent duplicate delivery of the same purchase
    -- event -- the other insert already won, use its row instead of erroring.
    select id into v_id from public.partner_onboardings
    where (p_firm_package_purchase_id is not null and firm_package_purchase_id = p_firm_package_purchase_id)
       or (firm_connection_id = p_firm_connection_id and status not in ('rejected', 'withdrawn'))
    order by created_at asc
    limit 1;
  end if;

  return v_id;
end;
$function$;

create or replace function public.create_partner_onboarding(p_workspace_id uuid, p_firm_connection_id uuid, p_package_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_connection_parent uuid;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to start onboarding for this workspace';
  end if;

  select parent_workspace_id into v_connection_parent from public.firm_connections where id = p_firm_connection_id;
  if v_connection_parent is null or v_connection_parent <> p_workspace_id then
    raise exception 'connection not found for this workspace';
  end if;

  return public._get_or_create_partner_onboarding(p_workspace_id, p_firm_connection_id, p_package_id, null);
end;
$function$;

-- The only change to the existing purchase-automation function: creating the
-- onboarding record (idempotently) alongside the existing firm_package.purchased
-- automation loop, which is left completely intact for anything else already
-- built on that trigger_type. partner_onboarding.created fires on its own,
-- from the insert trigger above, decoupled from this function entirely.
create or replace function public.fire_firm_package_purchase_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_event text;
  v_package record;
  v_buyer_name text;
  v_selected_labels jsonb;
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    v_event := 'firm_package.purchased';
  elsif new.status = 'canceled' and old.status is distinct from 'canceled' then
    v_event := 'firm_package.canceled';
  else
    return new;
  end if;

  if v_event = 'firm_package.purchased' then
    perform public._get_or_create_partner_onboarding(new.parent_workspace_id, new.connection_id, new.package_id, new.id);
  end if;

  select name, billing_cadence into v_package from public.firm_packages where id = new.package_id;
  select name into v_buyer_name from public.workspaces where id = new.workspace_id;
  select coalesce(jsonb_agg(o.label), '[]'::jsonb) into v_selected_labels
    from public.firm_package_options o where o.id = any(coalesce(new.selected_option_ids, '{}'::uuid[]));

  v_context := jsonb_build_object(
    'purchase_id', new.id,
    'package_id', new.package_id,
    'package_purchase.package_name', v_package.name,
    'package_purchase.billing_cadence', coalesce(new.billing_cadence, v_package.billing_cadence),
    'connection_id', new.connection_id,
    'buyer_workspace_name', v_buyer_name,
    'amount', new.amount,
    'selected_options', v_selected_labels
  );

  for v_automation in
    select * from public.automations
    where workspace_id = new.parent_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = v_event
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.parent_workspace_id, null, null) then
      insert into public.automation_runs (workspace_id, automation_id, trigger_snapshot, status)
      values (new.parent_workspace_id, v_automation.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

-- =============================================================================
-- Application
-- =============================================================================

-- Callable by any active member of the PARTNER's (child) workspace -- the
-- side actually filling out the application. Never auto-approves (spec
-- section 7): this only records data and, once every pre-review requirement
-- that applies is satisfied, hands off to review via _maybe_enter_review.
create or replace function public.submit_partner_onboarding_application(p_workspace_id uuid, p_onboarding_id uuid, p_application_data jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_onboarding record;
begin
  select po.* into v_onboarding
  from public.partner_onboardings po
  join public.firm_connections fc on fc.id = po.firm_connection_id
  where po.id = p_onboarding_id and fc.child_workspace_id = p_workspace_id;

  if v_onboarding.id is null then
    raise exception 'onboarding record not found';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions to submit this application';
  end if;
  if v_onboarding.status not in ('pending', 'in_progress') then
    raise exception 'this application is no longer open for edits';
  end if;

  update public.partner_onboardings
  set application_data = p_application_data,
      application_submitted_at = now(),
      status = case when status = 'pending' then 'in_progress' else status end
  where id = p_onboarding_id;

  insert into public.tasks (workspace_id, firm_connection_id, title, description, priority, visibility)
  values (
    v_onboarding.workspace_id, v_onboarding.firm_connection_id,
    'Review new partner application',
    'A partner application was submitted and is ready for review once all onboarding requirements are complete.',
    'medium', 'internal'
  );

  perform public._maybe_enter_review(p_onboarding_id);
end;
$function$;

-- Shared readiness-for-review check, called after application submission and
-- after agreement/document completion -- whichever of those actually applies
-- to this onboarding. Never demotes a later status; only advances in_progress
-- -> under_review, and only once.
create or replace function public._maybe_enter_review(p_onboarding_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_onboarding record;
  v_agreement_signed boolean;
  v_documents_done boolean;
begin
  select * into v_onboarding from public.partner_onboardings where id = p_onboarding_id;
  if v_onboarding.id is null or v_onboarding.status <> 'in_progress' then
    return;
  end if;
  if v_onboarding.application_submitted_at is null then
    return;
  end if;

  v_agreement_signed := not v_onboarding.agreement_required or exists (
    select 1 from public.signature_requests where id = v_onboarding.agreement_signature_request_id and status = 'completed'
  );
  v_documents_done := not v_onboarding.documents_required or exists (
    select 1 from public.document_requests where id = v_onboarding.document_request_id and status = 'completed'
  );

  if v_agreement_signed and v_documents_done then
    update public.partner_onboardings set status = 'under_review' where id = p_onboarding_id;

    insert into public.tasks (workspace_id, firm_connection_id, title, description, priority, assigned_staff_id, visibility)
    values (
      v_onboarding.workspace_id, v_onboarding.firm_connection_id,
      'Approve or reject partner onboarding',
      'Application, agreement, and required documents are complete. Review and decide.',
      'high', v_onboarding.assigned_staff_id, 'internal'
    );
  end if;
end;
$function$;

-- =============================================================================
-- Agreement + documents wiring (link an existing signature/document request
-- to this onboarding; the actual signing/upload flow is untouched).
-- =============================================================================

create or replace function public.set_partner_onboarding_agreement_request(p_workspace_id uuid, p_onboarding_id uuid, p_signature_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to manage this onboarding';
  end if;
  if not exists (select 1 from public.partner_onboardings where id = p_onboarding_id and workspace_id = p_workspace_id) then
    raise exception 'onboarding record not found';
  end if;
  if not exists (select 1 from public.signature_requests where id = p_signature_request_id and workspace_id = p_workspace_id) then
    raise exception 'signature request not found for this workspace';
  end if;

  update public.partner_onboardings set agreement_signature_request_id = p_signature_request_id where id = p_onboarding_id;
end;
$function$;

create or replace function public.set_partner_onboarding_document_request(p_workspace_id uuid, p_onboarding_id uuid, p_document_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to manage this onboarding';
  end if;
  if not exists (select 1 from public.partner_onboardings where id = p_onboarding_id and workspace_id = p_workspace_id) then
    raise exception 'onboarding record not found';
  end if;
  if not exists (select 1 from public.document_requests where id = p_document_request_id and workspace_id = p_workspace_id) then
    raise exception 'document request not found for this workspace';
  end if;

  update public.partner_onboardings set document_request_id = p_document_request_id where id = p_onboarding_id;
end;
$function$;

-- Piggybacks on the existing signature-completion and document-completion
-- status columns -- purely additive triggers, the existing
-- trg_fire_engagement_letter_signed_automations / trg_fire_document_request_completed_automations
-- triggers on these same tables are untouched.
create or replace function public._partner_onboarding_agreement_signed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_onboarding_id uuid;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' then
    return new;
  end if;
  select id into v_onboarding_id from public.partner_onboardings where agreement_signature_request_id = new.id;
  if v_onboarding_id is not null then
    perform public._maybe_enter_review(v_onboarding_id);
  end if;
  return new;
end;
$function$;

create trigger trg_partner_onboarding_agreement_signed
  after update of status on public.signature_requests
  for each row execute function public._partner_onboarding_agreement_signed();

create or replace function public._partner_onboarding_documents_completed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_onboarding_id uuid;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' then
    return new;
  end if;
  select id into v_onboarding_id from public.partner_onboardings where document_request_id = new.id;
  if v_onboarding_id is not null then
    perform public._maybe_enter_review(v_onboarding_id);
  end if;
  return new;
end;
$function$;

create trigger trg_partner_onboarding_documents_completed
  after update of status on public.document_requests
  for each row execute function public._partner_onboarding_documents_completed();

-- =============================================================================
-- Internal review (section 10)
-- =============================================================================

create or replace function public.record_partner_onboarding_review(p_workspace_id uuid, p_onboarding_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_onboarding record;
begin
  if p_decision not in ('approved', 'rejected', 'info_requested') then
    raise exception 'invalid review decision: %', p_decision;
  end if;
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to review onboarding for this workspace';
  end if;

  select * into v_onboarding from public.partner_onboardings where id = p_onboarding_id and workspace_id = p_workspace_id;
  if v_onboarding.id is null then
    raise exception 'onboarding record not found';
  end if;
  if v_onboarding.status <> 'under_review' then
    raise exception 'this onboarding is not currently under review';
  end if;

  update public.partner_onboardings
  set review_decision = p_decision,
      review_note = p_note,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      status = case p_decision
        when 'approved' then 'setup'
        when 'rejected' then 'rejected'
        else 'in_progress'
      end,
      rejected_reason = case when p_decision = 'rejected' then p_note else rejected_reason end,
      rejected_at = case when p_decision = 'rejected' then now() else rejected_at end
  where id = p_onboarding_id;
end;
$function$;

create or replace function public.withdraw_partner_onboarding(p_workspace_id uuid, p_onboarding_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to withdraw onboarding for this workspace';
  end if;
  if not exists (select 1 from public.partner_onboardings where id = p_onboarding_id and workspace_id = p_workspace_id) then
    raise exception 'onboarding record not found';
  end if;

  update public.partner_onboardings
  set status = 'withdrawn', withdrawn_at = now(), rejected_reason = coalesce(p_reason, rejected_reason)
  where id = p_onboarding_id;
end;
$function$;

-- =============================================================================
-- Setup: training + bank/software (section 12, 13) and readiness (section 14)
-- =============================================================================

create or replace function public._maybe_reach_partner_onboarding_ready(p_onboarding_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_onboarding record;
begin
  select * into v_onboarding from public.partner_onboardings where id = p_onboarding_id;
  if v_onboarding.id is null or v_onboarding.status <> 'setup' then
    return;
  end if;

  if (not v_onboarding.training_required or v_onboarding.training_completed_at is not null)
     and (not v_onboarding.bank_software_setup_required or v_onboarding.bank_software_setup_completed_at is not null) then
    update public.partner_onboardings set status = 'ready', completed_at = now() where id = p_onboarding_id;
  end if;
end;
$function$;

create or replace function public.set_partner_onboarding_training(p_workspace_id uuid, p_onboarding_id uuid, p_completed boolean, p_learning_course_id uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to manage this onboarding';
  end if;
  if not exists (select 1 from public.partner_onboardings where id = p_onboarding_id and workspace_id = p_workspace_id) then
    raise exception 'onboarding record not found';
  end if;

  update public.partner_onboardings
  set training_completed_at = case when p_completed then coalesce(training_completed_at, now()) else null end,
      learning_course_id = coalesce(p_learning_course_id, learning_course_id)
  where id = p_onboarding_id;

  perform public._maybe_reach_partner_onboarding_ready(p_onboarding_id);
end;
$function$;

create or replace function public.set_partner_onboarding_bank_software_setup(p_workspace_id uuid, p_onboarding_id uuid, p_completed boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to manage this onboarding';
  end if;
  if not exists (select 1 from public.partner_onboardings where id = p_onboarding_id and workspace_id = p_workspace_id) then
    raise exception 'onboarding record not found';
  end if;

  update public.partner_onboardings
  set bank_software_setup_completed_at = case when p_completed then coalesce(bank_software_setup_completed_at, now()) else null end
  where id = p_onboarding_id;

  perform public._maybe_reach_partner_onboarding_ready(p_onboarding_id);
end;
$function$;

-- Lets staff correct which requirements actually apply to this partner/
-- package (section 6/9's "configurable", without a requirements-matrix
-- table) -- e.g. turn training on for a partner type that needs it.
create or replace function public.update_partner_onboarding_requirements(
  p_workspace_id uuid, p_onboarding_id uuid,
  p_agreement_required boolean default null,
  p_documents_required boolean default null,
  p_training_required boolean default null,
  p_bank_software_setup_required boolean default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to manage this onboarding';
  end if;
  if not exists (select 1 from public.partner_onboardings where id = p_onboarding_id and workspace_id = p_workspace_id) then
    raise exception 'onboarding record not found';
  end if;

  update public.partner_onboardings
  set agreement_required = coalesce(p_agreement_required, agreement_required),
      documents_required = coalesce(p_documents_required, documents_required),
      training_required = coalesce(p_training_required, training_required),
      bank_software_setup_required = coalesce(p_bank_software_setup_required, bank_software_setup_required)
  where id = p_onboarding_id;

  perform public._maybe_reach_partner_onboarding_ready(p_onboarding_id);
end;
$function$;

-- =============================================================================
-- Reads
-- =============================================================================

-- Parent (ERO/SB) side: every onboarding for connections under this workspace.
create or replace function public.list_partner_onboardings(p_workspace_id uuid)
returns table (
  id uuid, firm_connection_id uuid, partner_name text, relationship_type text,
  package_id uuid, package_name text, status text,
  agreement_required boolean, documents_required boolean, training_required boolean, bank_software_setup_required boolean,
  application_submitted_at timestamptz, agreement_signed boolean, documents_completed boolean,
  training_completed_at timestamptz, bank_software_setup_completed_at timestamptz,
  assigned_staff_id uuid, created_at timestamptz, updated_at timestamptz, completed_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to view onboarding for this workspace';
  end if;

  return query
  select
    po.id, po.firm_connection_id,
    coalesce(cw.name, fc.manual_name, 'Connected firm'), fc.relationship_type,
    po.package_id, fp.name,
    po.status,
    po.agreement_required, po.documents_required, po.training_required, po.bank_software_setup_required,
    po.application_submitted_at,
    exists (select 1 from public.signature_requests sr where sr.id = po.agreement_signature_request_id and sr.status = 'completed'),
    exists (select 1 from public.document_requests dr where dr.id = po.document_request_id and dr.status = 'completed'),
    po.training_completed_at, po.bank_software_setup_completed_at,
    po.assigned_staff_id, po.created_at, po.updated_at, po.completed_at
  from public.partner_onboardings po
  join public.firm_connections fc on fc.id = po.firm_connection_id
  left join public.workspaces cw on cw.id = fc.child_workspace_id
  left join public.firm_packages fp on fp.id = po.package_id
  where po.workspace_id = p_workspace_id
  order by po.created_at desc;
end;
$function$;

-- Partner (child) side: only their own onboarding under the given connection.
create or replace function public.get_my_partner_onboarding(p_workspace_id uuid)
returns table (
  id uuid, status text,
  agreement_required boolean, documents_required boolean, training_required boolean, bank_software_setup_required boolean,
  application_submitted_at timestamptz, agreement_signed boolean, documents_completed boolean,
  training_completed_at timestamptz, bank_software_setup_completed_at timestamptz,
  review_note text, rejected_reason text, created_at timestamptz, completed_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  return query
  select
    po.id, po.status,
    po.agreement_required, po.documents_required, po.training_required, po.bank_software_setup_required,
    po.application_submitted_at,
    exists (select 1 from public.signature_requests sr where sr.id = po.agreement_signature_request_id and sr.status = 'completed'),
    exists (select 1 from public.document_requests dr where dr.id = po.document_request_id and dr.status = 'completed'),
    po.training_completed_at, po.bank_software_setup_completed_at,
    po.review_note, po.rejected_reason, po.created_at, po.completed_at
  from public.partner_onboardings po
  join public.firm_connections fc on fc.id = po.firm_connection_id
  where fc.child_workspace_id = p_workspace_id
  order by po.created_at desc
  limit 1;
end;
$function$;

-- =============================================================================
-- Retarget the Phase 6A Marketplace master workflow templates onto the real
-- event -- these are the two workspace_id IS NULL "Verexa system objects"
-- seeded in 20261003000000_marketplace_templates_phase6a.sql, not any
-- workspace's installed copy (which already has its own independent
-- trigger_type and is never touched by a later master edit -- Phase 6A's
-- versioning design).
-- =============================================================================

update public.automations
set trigger_type = 'partner_onboarding.created'
where workspace_id is null
  and slug in ('verexa-ero-partner-onboarding', 'verexa-service-bureau-partner-onboarding')
  and trigger_type = 'firm_package.purchased';

-- The master content changed, so bump the catalog version -- existing
-- workspace installs keep their own (now-stale) copy untouched and simply
-- show "update available", per Phase 6A's versioning design.
update public.marketplace_templates
set version = version + 1, updated_at = now()
where slug in ('ero-partner-onboarding', 'service-bureau-partner-onboarding');
