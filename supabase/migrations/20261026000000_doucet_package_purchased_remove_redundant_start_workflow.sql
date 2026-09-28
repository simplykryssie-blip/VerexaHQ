-- Reconciles live Supabase with source control for the Doucet "Software/
-- Banking Package Purchased" automation (185626b5-9feb-4d0c-908d-
-- 33e368273f19). An earlier, isolated session added a start_workflow step
-- (ec2f79c1-9289-4a72-9e0f-d6801d88c858) to its BOTH-complete branch,
-- unaware that the target automation ("Software & Banking Setup",
-- f0085488-6bd1-4cac-83e9-c7720c0d9b8c) is already correctly wired to fire
-- on its own via partner_onboarding.status_changed (to_status=setup) --
-- the staff-approval-gated trigger that is the sole intended starter of
-- that workflow. Leaving both in place would let a purchaser trigger Setup
-- immediately on completing application+agreement, then trigger it again
-- when staff later approves: a duplicate run and a bypass of the approval
-- gate. This was already corrected live; this migration makes that
-- correction deterministic and idempotent in source control.
--
-- Scoped narrowly to this one automation's specific step/edge rows by id.
-- Every statement is a no-op if already applied (the step/edges may
-- already be gone, or the direct edge may already point the right way),
-- so this is safe to run against a database that already has the fix,
-- one that still has the original (pre-fix) graph, or one that never had
-- either -- it does not depend on any disposable test data.
delete from public.automation_step_edges
where automation_id = '185626b5-9feb-4d0c-908d-33e368273f19'
  and (from_step_id = 'ec2f79c1-9289-4a72-9e0f-d6801d88c858' or to_step_id = 'ec2f79c1-9289-4a72-9e0f-d6801d88c858');

delete from public.automation_steps
where id = 'ec2f79c1-9289-4a72-9e0f-d6801d88c858'
  and automation_id = '185626b5-9feb-4d0c-908d-33e368273f19';

update public.automation_step_edges
set to_step_id = '86e469da-145d-4171-8498-7be867c4d095'
where id = '13c01b66-f27b-4ae0-ac22-92bfef0eeaa0'
  and automation_id = '185626b5-9feb-4d0c-908d-33e368273f19'
  and from_step_id = '72caa283-8640-48f5-a4b4-38b7805e2bb3'
  and to_step_id is distinct from '86e469da-145d-4171-8498-7be867c4d095';
