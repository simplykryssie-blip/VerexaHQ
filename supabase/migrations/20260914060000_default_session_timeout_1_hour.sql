-- Revert session_timeout_minutes' default back to 60 (1 hour) -- 15 minutes
-- (set in 20260811134919_default_session_timeout_15_minutes.sql) proved too
-- aggressive for day-to-day staff use. Only touches rows still sitting on
-- that unmodified 15-minute default, same convention as that migration --
-- a workspace that's already customized this value (e.g. to 120 or 1440)
-- keeps its own setting.

alter table public.workspace_security_policies
  alter column session_timeout_minutes set default 60;

update public.workspace_security_policies
set session_timeout_minutes = 60
where session_timeout_minutes = 15;
