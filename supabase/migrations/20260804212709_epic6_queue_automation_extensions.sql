-- Notification Queue: retry ceiling for dead-letter detection (reuse status='failed', no new enum value)
alter table public.notification_queue add column if not exists max_attempts integer not null default 5;
create index if not exists idx_notification_queue_dispatch on public.notification_queue (status, scheduled_at) where status = 'pending';

-- Automation escalation action type (extends existing action_type vocabulary, not a new mechanism)
alter table public.automation_steps drop constraint if exists automation_steps_action_type_check;
alter table public.automation_steps add constraint automation_steps_action_type_check
  check (action_type = any (array['send_email','send_sms','send_notification','create_task','assign_user','change_stage','request_approval','delay','webhook','escalate']));

-- Future AI hook, reserved and unpopulated -- same convention as attachments.ai_metadata
alter table public.automations add column if not exists ai_config jsonb;
comment on column public.automations.ai_config is
  'Reserved for future AI-assisted trigger/condition suggestions (e.g. suggested escalation targets). Not populated or read by any code yet.';

-- Message drafts reuse draft_saves rather than a new table/column
alter table public.draft_saves drop constraint if exists draft_saves_draft_type_check;
alter table public.draft_saves add constraint draft_saves_draft_type_check
  check (draft_type = any (array['client','engagement','workflow','blueprint','organizer','document_request','engagement_letter','automation','settings','message']));

-- Message read receipts (single-reader model: a thread has exactly one client-side and one staff-side)
alter table public.messages add column if not exists read_at timestamptz;
