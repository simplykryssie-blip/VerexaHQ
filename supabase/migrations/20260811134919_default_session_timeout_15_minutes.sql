-- workspace_security_policies.session_timeout_minutes existed but was never
-- actually enforced anywhere in the app -- IdleLogout now reads it client-
-- side. Change the default to 15 minutes and backfill every workspace still
-- sitting on the unmodified old default of 60, so it's automatic without
-- requiring an admin to go configure it. Only touches rows still at the old
-- default -- a workspace that already customized this away from 60 keeps
-- its own value.

alter table public.workspace_security_policies
  alter column session_timeout_minutes set default 15;

update public.workspace_security_policies
set session_timeout_minutes = 15
where session_timeout_minutes = 60;
