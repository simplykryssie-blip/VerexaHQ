-- Epic 3A: Engagement Foundation -- Part 9 (cover remaining FK indexes).
--
-- Performance advisor pass: foreign keys on tables this epic built or
-- touched that were missing a covering index. (Pre-existing gaps on
-- Phase 0/Phase 2 tables this epic never touched -- created_by columns
-- mostly -- are left alone; same for firm_onboarding's unrelated
-- multiple-permissive-policies finding and the old duplicate index on
-- activity_log. Out of scope for this epic.)

create index if not exists idx_automation_execution_logs_automation on public.automation_execution_logs (automation_id);
create index if not exists idx_automation_execution_logs_engagement on public.automation_execution_logs (engagement_id);
create index if not exists idx_automation_execution_logs_workspace on public.automation_execution_logs (workspace_id);

create index if not exists idx_draft_saves_user on public.draft_saves (user_id);

create index if not exists idx_engagement_assignment_history_changed_by on public.engagement_assignment_history (changed_by);
create index if not exists idx_engagement_assignment_history_new_user on public.engagement_assignment_history (new_user_id);
create index if not exists idx_engagement_assignment_history_previous_user on public.engagement_assignment_history (previous_user_id);

create index if not exists idx_engagement_review_actions_actor on public.engagement_review_actions (actor_id);

create index if not exists idx_engagement_shares_reviewed_by on public.engagement_shares (reviewed_by);
create index if not exists idx_engagement_shares_shared_by on public.engagement_shares (shared_by);

create index if not exists idx_engagement_status_history_audit_reference on public.engagement_status_history (audit_reference);
create index if not exists idx_engagement_status_history_changed_by on public.engagement_status_history (changed_by);

create index if not exists idx_engagements_assigned_staff on public.engagements (assigned_staff_id);
create index if not exists idx_engagements_blueprint on public.engagements (blueprint_id);
create index if not exists idx_engagements_compliance_officer on public.engagements (compliance_officer_id);
create index if not exists idx_engagements_owner_workspace on public.engagements (owner_workspace_id);
create index if not exists idx_engagements_reviewer on public.engagements (reviewer_id);
create index if not exists idx_engagements_workflow on public.engagements (workflow_id);

create index if not exists idx_workflow_runs_current_stage on public.workflow_runs (current_stage_id);
create index if not exists idx_workflow_runs_process on public.workflow_runs (process_id);

create index if not exists idx_workflow_stages_assigned_staff on public.workflow_stages (assigned_staff_id);
create index if not exists idx_workflow_stages_process_stage on public.workflow_stages (process_stage_id);
create index if not exists idx_workflow_stages_reviewer on public.workflow_stages (reviewer_id);
create index if not exists idx_workflow_stages_workspace on public.workflow_stages (workspace_id);
