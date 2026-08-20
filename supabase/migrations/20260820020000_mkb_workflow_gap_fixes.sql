-- Closes real gaps found auditing MKB's rebuilt workflow suite before their
-- first test run: several automations were gated on tags that nothing in
-- the system ever actually sets, one fired at the wrong pipeline moment, and
-- two "onboarding" automations were near-duplicates of each other. This
-- rewires what has a real corresponding event, consolidates the duplicate,
-- and adds the two missing invoice/payment signals as generic, workspace-
-- agnostic client tags (mirroring how every other add_tag action already
-- works) rather than one-off MKB-specific plumbing.

-- 1. Tax Prep Lead Routing was gated on client.tag_added:"lead:interest-tax-prep",
-- a tag nothing ever sets. The real event already exists and is already used
-- by the universal "Send organizer on service interest" automation: rewire
-- to client.service_interest_selected, and add a step-graph branch that
-- stops the run unless the selected service is Individual Tax Prep.
update public.automations
set trigger_type = 'client.service_interest_selected', trigger_config = '{}'::jsonb
where id = '279fe923-13ba-4478-b541-de303b3c0ae8';

update public.automation_step_edges
set sort_order = 2
where automation_id = '279fe923-13ba-4478-b541-de303b3c0ae8' and label = 'None';

insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
values (
  '279fe923-13ba-4478-b541-de303b3c0ae8',
  'b8ac0a27-63ba-44c9-9e80-7c812bb64cc4',
  null,
  '[{"op":"neq","field":"client.service_id","value":"2ff9adce-8a62-4c39-acf5-f3e8e9f8ec68"}]'::jsonb,
  'Not an Individual Tax Prep interest',
  1
);

-- 2. Tax Prep Onboarding was gated on client.tag_added:"service:tax-prep-selected"
-- (also never set) and was otherwise a near-duplicate of Active Client
-- Onboarding -- same stage move, same three tags, same task pattern. One
-- onboarding automation is enough; delete the redundant one.
delete from public.automation_step_edges where automation_id = '360ee27b-dbcb-4d9c-a6b0-9486d622abcc';
delete from public.automation_steps where automation_id = '360ee27b-dbcb-4d9c-a6b0-9486d622abcc';
delete from public.automations where id = '360ee27b-dbcb-4d9c-a6b0-9486d622abcc';

-- 3. Consult Booking Reminder fired on entering "Consult Needed" (stage 2) --
-- before anything is actually booked, and the exact stage No-Show Follow-Up
-- bounces a lead back into, so a no-show immediately got a contradictory
-- "your consult is coming up" message. It should fire on "Consult Booked"
-- (stage 3) instead, same stage Consult Prep Task already targets.
update public.automations
set trigger_config = jsonb_set(trigger_config, '{process_stage_id}', '"0a0cad4f-c801-46c2-af06-81b0fd69b842"')
where id = 'd1751da8-d12a-4024-aede-e41968e0ce9b';

-- 4. Consult Completed Follow-Up was gated on entering "Consult Completed"
-- (stage 4), a stage nothing ever moved a lead into. appointment.status_changed
-- already supports "completed" as a real status -- rewire to that, and add
-- the stage move itself as the automation's first action (the same pattern
-- Consult Prep Task already uses for "confirmed").
update public.automations
set trigger_type = 'appointment.status_changed', trigger_config = '{"to_status":"completed"}'::jsonb
where id = '972032d4-e7d0-448e-9351-8213ff26f110';

insert into public.automation_steps (id, automation_id, display_order, action_type, action_config, delay_minutes)
values (
  'a1b2c3d4-1111-4a11-9111-111111111111',
  '972032d4-e7d0-448e-9351-8213ff26f110',
  1,
  'move_lead_stage',
  '{"process_id":"49d78942-bdb9-4034-b3e3-d01b86d7f722","process_stage_id":"3d4c96dd-2334-4f29-89ce-7e73f160c65d"}'::jsonb,
  0
);

update public.automation_steps set display_order = 2 where id = '1063be19-dfc0-4718-a9d6-1933c0279a37';
update public.automation_steps set display_order = 3 where id = '957356db-dfb5-48bd-9635-6f141f6045ad';

update public.automation_step_edges
set to_step_id = 'a1b2c3d4-1111-4a11-9111-111111111111'
where automation_id = '972032d4-e7d0-448e-9351-8213ff26f110' and from_step_id = 'ee741db3-9bd1-46c9-8e04-eb4aa77383e2' and label = 'None';

insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
values (
  '972032d4-e7d0-448e-9351-8213ff26f110',
  'a1b2c3d4-1111-4a11-9111-111111111111',
  '1063be19-dfc0-4718-a9d6-1933c0279a37',
  null, null, 0
);

-- 5. Payment Link Follow-Up was gated on client.tag_added:"payment:link-sent",
-- a tag nothing sets -- Invoice Link Delivery produces "invoice:sent"
-- instead, a different string for what's meant to be the same moment (the
-- payment-link email actually going out). Point it at the tag that's really
-- produced.
update public.automations
set trigger_config = '{"tag":"invoice:sent"}'::jsonb
where id = '530e56ef-61a5-412c-81b0-ae29cba28aff';

-- 6. Active Client Onboarding was gated on client.tag_added:"payment:received",
-- a tag nothing sets -- there was no invoice/payment automation trigger
-- anywhere in the platform. Rather than build a whole new native trigger
-- type for one workflow, add the two missing signals as generic tags on the
-- clients row itself, applied by the real invoice lifecycle (creation and
-- being marked paid) -- any workspace's automations can listen for them the
-- same way they already listen for any other client.tag_added tag.
create or replace function public.tag_client_on_invoice_sent()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_client_id uuid;
begin
  if new.status <> 'sent' then
    return new;
  end if;
  v_client_id := coalesce(new.client_id, (select client_id from public.engagements where id = new.engagement_id));
  if v_client_id is null then
    return new;
  end if;
  update public.clients
  set tags = array(select distinct unnest(coalesce(tags, '{}') || array['invoice:ready-to-send']))
  where id = v_client_id;
  return new;
end;
$function$;

drop trigger if exists trg_tag_client_on_invoice_sent on public.invoices;
create trigger trg_tag_client_on_invoice_sent
  after insert on public.invoices
  for each row execute function public.tag_client_on_invoice_sent();

create or replace function public.tag_client_on_invoice_paid()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_client_id uuid;
begin
  if new.status <> 'paid' or old.status is not distinct from new.status then
    return new;
  end if;
  v_client_id := coalesce(new.client_id, (select client_id from public.engagements where id = new.engagement_id));
  if v_client_id is null then
    return new;
  end if;
  update public.clients
  set tags = array(select distinct unnest(coalesce(tags, '{}') || array['payment:received']))
  where id = v_client_id;
  return new;
end;
$function$;

drop trigger if exists trg_tag_client_on_invoice_paid on public.invoices;
create trigger trg_tag_client_on_invoice_paid
  after update of status on public.invoices
  for each row execute function public.tag_client_on_invoice_paid();

-- 7. Active Client Onboarding jumped straight from wherever a lead was to
-- "Active Client" (stage 7) the instant payment came in, skipping the
-- pipeline's own "Paid/Onboarding" (stage 6) entirely -- that stage was
-- unreachable by any automation. Payment received should land a lead in
-- Paid/Onboarding, not Active Client; graduating to Active Client once
-- onboarding is actually done stays a staff call, same as marking a consult
-- completed does today.
update public.automation_steps
set action_config = jsonb_set(action_config, '{process_stage_id}', '"a823a9e7-5fef-4142-a3f4-3bc1cff5f2b0"')
where id = 'b1d962a7-65e3-4071-b617-e3eba328b7f8';

update public.automation_steps
set action_config = jsonb_set(action_config, '{tag}', '"onboarding:in-progress"')
where id = 'bf290bf7-cfe4-4a89-821a-66b2790ef06d';
