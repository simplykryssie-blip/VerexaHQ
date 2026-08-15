-- Advisor: unindexed_foreign_keys.
create index if not exists idx_automation_pending_steps_approved_by on public.automation_pending_steps (approved_by);
create index if not exists idx_automation_pending_steps_automation_step_id on public.automation_pending_steps (automation_step_id);
create index if not exists idx_engagement_letter_public_signatures_template_id on public.engagement_letter_public_signatures (engagement_letter_template_id);
