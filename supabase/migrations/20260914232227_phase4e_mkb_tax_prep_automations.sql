-- Phase 4E: MKB Tax Prep automations, wiring the full lifecycle using
-- only existing automation-engine capability (no new action types, no new
-- trigger types beyond what fire_quote_status_changed_automations /
-- fire_engagement_letter_signed_automations already support).
--
-- 1. Lead capture: a client expressing interest in Individual/Sched C
--    starts this pipeline at "Lead", via the existing generic
--    move_lead_to_service_pipeline action (already used elsewhere in the
--    product; not new capability).
with a0 as (
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    '2896bf43-95db-420f-9bb5-8854f537bbd1',
    'Individual/Sched C -- New Lead Enters Pipeline',
    'individual-sched-c-new-lead-enters-pipeline',
    'A client expressing interest in Individual/Sched C Tax Prep starts the pipeline at Lead.',
    'client.service_interest_selected',
    '{"service_id":"f0526ed4-5927-42c1-8fd9-eb019eb386ee"}'::jsonb,
    '[]'::jsonb,
    true,
    'published'
  )
  returning id
)
insert into public.automation_steps (automation_id, action_type, action_config, display_order)
select id, 'move_lead_to_service_pipeline', '{}'::jsonb, 0 from a0;

-- 2. Organizer submitted -> Organizer Under Review. Guarded to only fire
--    while the engagement is still at Lead, since move_pipeline_stage
--    cannot move backward -- a resubmission during Missing Docs/
--    Information (a later stage) must not attempt this move.
with a1 as (
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    '2896bf43-95db-420f-9bb5-8854f537bbd1',
    'Individual/Sched C -- Organizer Submitted',
    'individual-sched-c-organizer-submitted',
    'Moves a Lead-stage engagement to Organizer Under Review once the intake organizer is submitted.',
    'organizer.submitted',
    '{"organizer_template_id":"578c6135-3978-48d4-a3a1-539cd5bd1e0f"}'::jsonb,
    '[{"conditions":[{"op":"eq","field":"engagement.process_stage_id","value":"acb41acc-a709-4452-a786-074a8e02fb52"}]}]'::jsonb,
    true,
    'published'
  )
  returning id
)
insert into public.automation_steps (automation_id, action_type, action_config, display_order)
select id, 'move_pipeline_stage',
  '{"process_id":"575a51fd-835e-449a-b915-edcd2bd1513a","process_stage_id":"b68cc894-9622-429a-92bd-677cc1d04f49"}'::jsonb,
  0
from a1;

-- 3. The three organizer review-decision routing automations (same
--    proven pattern as Summit/Phase 4C).
with a2 as (
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    '2896bf43-95db-420f-9bb5-8854f537bbd1',
    'Individual/Sched C -- Review Approved',
    'individual-sched-c-review-approved',
    'Organizer review decided Approved -- moves the engagement to Ready for Preparation.',
    'organizer_response.review_decided',
    '{"to_status":"Approved","organizer_template_id":"578c6135-3978-48d4-a3a1-539cd5bd1e0f"}'::jsonb,
    '[]'::jsonb,
    true,
    'published'
  )
  returning id
)
insert into public.automation_steps (automation_id, action_type, action_config, display_order)
select id, 'move_pipeline_stage',
  '{"process_id":"575a51fd-835e-449a-b915-edcd2bd1513a","process_stage_id":"b79115cc-8a05-4d6e-aafa-9b8427111b2d"}'::jsonb,
  0
from a2;

with a3 as (
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    '2896bf43-95db-420f-9bb5-8854f537bbd1',
    'Individual/Sched C -- Review Corrections Requested',
    'individual-sched-c-review-corrections-requested',
    'Organizer review decided Corrections Requested -- moves the engagement to Missing Docs/Information.',
    'organizer_response.review_decided',
    '{"to_status":"Corrections Requested","organizer_template_id":"578c6135-3978-48d4-a3a1-539cd5bd1e0f"}'::jsonb,
    '[]'::jsonb,
    true,
    'published'
  )
  returning id
)
insert into public.automation_steps (automation_id, action_type, action_config, display_order)
select id, 'move_pipeline_stage',
  '{"process_id":"575a51fd-835e-449a-b915-edcd2bd1513a","process_stage_id":"7982ebee-a3f0-4aea-aded-cd8d2376530c"}'::jsonb,
  0
from a3;

with a4 as (
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    '2896bf43-95db-420f-9bb5-8854f537bbd1',
    'Individual/Sched C -- Review Rejected',
    'individual-sched-c-review-rejected',
    'Organizer review decided Rejected -- moves the engagement to Declined - ERO Review.',
    'organizer_response.review_decided',
    '{"to_status":"Rejected","organizer_template_id":"578c6135-3978-48d4-a3a1-539cd5bd1e0f"}'::jsonb,
    '[]'::jsonb,
    true,
    'published'
  )
  returning id
)
insert into public.automation_steps (automation_id, action_type, action_config, display_order)
select id, 'move_pipeline_stage',
  '{"process_id":"575a51fd-835e-449a-b915-edcd2bd1513a","process_stage_id":"6371f44e-9957-4e61-a1c6-274fb24a0579"}'::jsonb,
  0
from a4;

-- 4. Missing Docs/Information reminder loop -- correct field from the
--    start (engagement.process_stage_id), no dangling cross-workspace
--    id, since MKB is a fresh build, not a clone. One reminder, escalate
--    to a staff task if the engagement is still at Missing Docs/
--    Information after the wait; resolves cleanly the moment a new
--    review decision moves the engagement elsewhere.
with a5 as (
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    '2896bf43-95db-420f-9bb5-8854f537bbd1',
    'Individual/Sched C -- Missing Info Reminder',
    'individual-sched-c-missing-info-reminder',
    'Reminds the client while Missing Docs/Information, escalates to staff if unresolved, resolves cleanly once a new review decision moves the engagement elsewhere.',
    'engagement.stage_entered',
    '{"process_id":"575a51fd-835e-449a-b915-edcd2bd1513a","process_stage_id":"7982ebee-a3f0-4aea-aded-cd8d2376530c"}'::jsonb,
    '[]'::jsonb,
    false,
    'published'
  )
  returning id
), s1 as (
  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  select id, 'send_notification', '{"channels":["In-App"],"message":"{{client_name}} is missing information for Individual/Sched C -- reminder sent."}'::jsonb, 0 from a5
  returning id, automation_id
), s2 as (
  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  select automation_id, 'delay', '{"delay_unit":"days"}'::jsonb, 1 from s1
  returning id, automation_id
), s3 as (
  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  select automation_id, 'condition', '{}'::jsonb, 2 from s2
  returning id, automation_id
), s4 as (
  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  select automation_id, 'create_task', '{"title":"Follow up: {{client_name}} still missing documents","priority":"medium","due_in_days":"1"}'::jsonb, 3 from s3
  returning id, automation_id
), s5 as (
  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  select automation_id, 'add_tag', '{"tag":"Missing Docs - Resolved"}'::jsonb, 4 from s3
  returning id, automation_id
)
insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, sort_order)
select s3.automation_id, s3.id, s4.id,
  '[{"conditions":[{"op":"eq","field":"engagement.process_stage_id","value":"7982ebee-a3f0-4aea-aded-cd8d2376530c"}]}]'::jsonb, 0
from s3, s4
union all
select s3.automation_id, s3.id, s5.id,
  '[{"conditions":[{"op":"neq","field":"engagement.process_stage_id","value":"7982ebee-a3f0-4aea-aded-cd8d2376530c"}]}]'::jsonb, 1
from s3, s5;

-- 5. Quote declined -> disengage. MKB has no existing nurture pipeline
--    (0 processes existed before this migration beyond the one just
--    created), so per explicit instruction this does NOT invent a
--    Tax-Prep-internal nurture stage -- it marks the lead lost and tags
--    it, which is the whole of "disengage" that MKB's current
--    architecture actually supports. Scoped to this service only.
with a6 as (
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    '2896bf43-95db-420f-9bb5-8854f537bbd1',
    'Individual/Sched C -- Quote Declined',
    'individual-sched-c-quote-declined',
    'Client declined the quote -- marks the lead lost and tags it. No nurture pipeline exists in MKB yet, so this is disengagement only.',
    'quote.declined',
    '{"service_id":"f0526ed4-5927-42c1-8fd9-eb019eb386ee"}'::jsonb,
    '[]'::jsonb,
    true,
    'published'
  )
  returning id
), s1 as (
  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  select id, 'add_tag', '{"tag":"Quote Declined"}'::jsonb, 0 from a6
  returning id, automation_id
), s2 as (
  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  select automation_id, 'mark_lead_lost', '{"reason":"Declined the Individual/Sched C quote"}'::jsonb, 1 from s1
  returning id, automation_id
), s3 as (
  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  select automation_id, 'send_notification', '{"channels":["In-App"],"message":"{{client_name}} declined the Individual/Sched C quote."}'::jsonb, 2 from s2
  returning id, automation_id
)
insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
select s1.automation_id, s1.id, s2.id, 0 from s1, s2
union all
select s2.automation_id, s2.id, s3.id, 0 from s2, s3;

-- 6. Preparation can begin once BOTH quote is accepted and the
--    engagement letter is signed -- order-independent by construction:
--    each of these two automations only acts if the OTHER condition is
--    already true; whichever event fires second is the one that
--    actually performs the move.
with a7 as (
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    '2896bf43-95db-420f-9bb5-8854f537bbd1',
    'Individual/Sched C -- Preparation Can Begin (Quote Accepted)',
    'individual-sched-c-prep-can-begin-quote',
    'Quote accepted -- moves to Preparation Started only if the engagement letter is already signed.',
    'quote.accepted',
    '{"service_id":"f0526ed4-5927-42c1-8fd9-eb019eb386ee"}'::jsonb,
    '[{"conditions":[{"op":"eq","field":"engagement.engagement_letter_status","value":"completed"}]}]'::jsonb,
    true,
    'published'
  )
  returning id
)
insert into public.automation_steps (automation_id, action_type, action_config, display_order)
select id, 'move_pipeline_stage',
  '{"process_id":"575a51fd-835e-449a-b915-edcd2bd1513a","process_stage_id":"76e41c7a-171b-4082-845e-4c58612ca54a"}'::jsonb,
  0
from a7;

with a8 as (
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    '2896bf43-95db-420f-9bb5-8854f537bbd1',
    'Individual/Sched C -- Preparation Can Begin (Letter Signed)',
    'individual-sched-c-prep-can-begin-letter',
    'Engagement letter signed -- moves to Preparation Started only if the quote is already accepted.',
    'engagement_letter.signed',
    '{"service_id":"f0526ed4-5927-42c1-8fd9-eb019eb386ee"}'::jsonb,
    '[{"conditions":[{"op":"eq","field":"quote.status","value":"accepted"}]}]'::jsonb,
    true,
    'published'
  )
  returning id
)
insert into public.automation_steps (automation_id, action_type, action_config, display_order)
select id, 'move_pipeline_stage',
  '{"process_id":"575a51fd-835e-449a-b915-edcd2bd1513a","process_stage_id":"76e41c7a-171b-4082-845e-4c58612ca54a"}'::jsonb,
  0
from a8;
