-- Phase 4C Parts 2-4: wire the human organizer-review decision on the
-- Individual/Sched C intake form (organizer_template_id
-- 51d0c196-43a7-4e8e-b1e1-0a30d6b3daa4, Summit demo workspace
-- b41f7ee8-e811-4d4d-8156-5ebf43014462) to the Individual/Sched C
-- Onboarding pipeline (process_id 043d74b3-61f7-4fb1-8977-5c48a456e687)
-- using only existing mechanisms: the organizer_response.review_decided
-- trigger (already implemented, zero prior automations used it) and the
-- move_pipeline_stage action. One Tax Prep Pipeline; conditional routing
-- to different stages depending on the review outcome -- no new pipeline,
-- no new stage, no new automation-engine capability.

-- Part 2: 679131dd ("Individual/ Sched C Tax Prep Workflow", disabled)
-- has a top-level client.organizer_status condition checking the exact
-- same organizer_template_id its own trigger_config already scopes this
-- automation's organizer.submitted trigger to -- by the time this
-- automation's conditions are evaluated at all, the check is already
-- guaranteed true. Removing it is a no-op for behavior; the automation
-- stays disabled.
update public.automations
set conditions = '[]'::jsonb
where id = '679131dd-7a87-462f-99ab-69814ec776e2'
  and is_enabled = false;

-- Part 3: three new automations, one per review outcome, each scoped to
-- this exact organizer template so they never fire for any other
-- organizer in this workspace. Deliberately three separate automations
-- rather than one branching workflow.
with a1 as (
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    'b41f7ee8-e811-4d4d-8156-5ebf43014462',
    'Individual/Sched C -- Review Approved',
    'individual-sched-c-review-approved',
    'Organizer review decided Approved for the Individual/Sched C intake form -- moves the engagement to Ready for Preparation.',
    'organizer_response.review_decided',
    '{"to_status":"Approved","organizer_template_id":"51d0c196-43a7-4e8e-b1e1-0a30d6b3daa4"}'::jsonb,
    '[]'::jsonb,
    true,
    'published'
  )
  returning id
)
insert into public.automation_steps (automation_id, action_type, action_config, display_order)
select id, 'move_pipeline_stage',
  '{"process_id":"043d74b3-61f7-4fb1-8977-5c48a456e687","process_stage_id":"f9c4a3d5-3d7f-4cb5-b5e3-bc57913f71f5"}'::jsonb,
  0
from a1;

with a2 as (
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    'b41f7ee8-e811-4d4d-8156-5ebf43014462',
    'Individual/Sched C -- Review Corrections Requested',
    'individual-sched-c-review-corrections-requested',
    'Organizer review decided Corrections Requested for the Individual/Sched C intake form -- moves the engagement to Missing Docs/ Information.',
    'organizer_response.review_decided',
    '{"to_status":"Corrections Requested","organizer_template_id":"51d0c196-43a7-4e8e-b1e1-0a30d6b3daa4"}'::jsonb,
    '[]'::jsonb,
    true,
    'published'
  )
  returning id
)
insert into public.automation_steps (automation_id, action_type, action_config, display_order)
select id, 'move_pipeline_stage',
  '{"process_id":"043d74b3-61f7-4fb1-8977-5c48a456e687","process_stage_id":"d1140411-a8c4-4f40-a33f-c1d270ba2e73"}'::jsonb,
  0
from a2;

with a3 as (
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    'b41f7ee8-e811-4d4d-8156-5ebf43014462',
    'Individual/Sched C -- Review Rejected',
    'individual-sched-c-review-rejected',
    'Organizer review decided Rejected for the Individual/Sched C intake form -- moves the engagement to Declined - ERO Review.',
    'organizer_response.review_decided',
    '{"to_status":"Rejected","organizer_template_id":"51d0c196-43a7-4e8e-b1e1-0a30d6b3daa4"}'::jsonb,
    '[]'::jsonb,
    true,
    'published'
  )
  returning id
)
insert into public.automation_steps (automation_id, action_type, action_config, display_order)
select id, 'move_pipeline_stage',
  '{"process_id":"043d74b3-61f7-4fb1-8977-5c48a456e687","process_stage_id":"0d879800-8e51-4eba-8f4b-cf1680d8f38e"}'::jsonb,
  0
from a3;

-- Part 4: of the three pre-existing engagement.stage_entered automations
-- for this process, only 512f8cba ("Individual/Sched C -- ERO Review
-- Declined") passed inspection against the 8 required criteria -- a
-- clean, linear, correctly-labeled sequence (email, mark_lead_lost, tag
-- hygiene, move to the New Leads- Stalled nurturing pipeline) with no
-- broken condition fields and no unintended stage movement. It is
-- enabled here. 307e83c0 ("Missing Info") and 3ab3846e ("Ready for
-- Prep") both failed inspection (a wrong/mismatched email template on
-- 307e83c0's resolved-docs branch; 3ab3846e resends the same intake
-- organizer and moves the engagement into a separate, legacy
-- "Individual/Sched C Prep Started" process instead of this one) and are
-- left disabled -- see the Phase 4C report for the full per-automation
-- criteria breakdown; fixing them is out of this phase's authorized
-- scope.
update public.automations
set is_enabled = true
where id = '512f8cba-fcb6-4d5b-9b34-08dfb27fa412';
