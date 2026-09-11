-- notification_queue.is_test and the 'simulated' status value were added
-- in 20260913090000 to represent what a test-mode automation run would
-- have sent, but no function ever writes them (findings c9e47bd9 / 3b127052):
-- execute_automation_step's is_test branches only set an in-memory
-- v_skip_note that lands in automation_execution_logs.execution_data --
-- they never insert a notification_queue row at all. Building the
-- "insert a real simulated row" feature would touch all 7 test-mode
-- action types for a low-severity gap that's already visible via the
-- Activity log; simpler and more honest to drop the dead schema surface
-- that nothing populates or reads.

alter table public.notification_queue drop column if exists is_test;

alter table public.notification_queue drop constraint if exists notification_queue_status_check;
alter table public.notification_queue add constraint notification_queue_status_check
  check (status = any (array['pending'::text, 'sent'::text, 'failed'::text, 'cancelled'::text]));
