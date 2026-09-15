-- Fixes a real bug found in testing: the Missing Info Reminder
-- automation's delay step had action_config.delay_unit set (display
-- metadata only) but never got the actual delay_minutes column set --
-- it defaulted to 0, so start_next_automation_step() executed straight
-- through it with no wait at all, making the reminder fire and its
-- follow-up condition evaluate in the same instant instead of after a
-- real wait. Sets it to 1 day (1440 minutes), matching the unit already
-- declared in its own action_config.
update public.automation_steps
set delay_minutes = 1440
where id = '3516039b-6874-41c5-9b7e-4937eb502753';
