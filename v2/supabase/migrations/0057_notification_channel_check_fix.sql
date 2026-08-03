-- Epic 3A: Engagement Foundation -- Part 10 (notification channel fix).
--
-- Caught by the Epic 3A smoke test: notification_queue.channel (Phase 0,
-- lowercase 'email'/'sms'/'portal'/'push') and notification_queue.channels
-- (added later by the same external drift as event_type/priority, defaults
-- to array['In-App']) disagree on both casing and vocabulary -- 'In-App'
-- isn't a legal `channel` value at all, so create_notification() (0053)
-- failed the moment it tried to notify anyone through the default channel.
-- Standardizing both columns on the capitalized convention the drift
-- already established elsewhere in this cluster (engagement_priority's
-- Low/Medium/High/Urgent, workflow_run_status's Active/Completed, etc.),
-- and adding 'In-App' since the spec lists it as a first-class channel
-- alongside Email/SMS/Portal/Push.

alter table public.notification_queue drop constraint if exists notification_queue_channel_check;
alter table public.notification_queue add constraint notification_queue_channel_check check (channel in (
  'In-App', 'Email', 'SMS', 'Portal', 'Push'
));
