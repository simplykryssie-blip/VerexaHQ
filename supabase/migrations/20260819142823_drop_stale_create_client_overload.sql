-- CREATE OR REPLACE FUNCTION with an added trailing parameter creates a new
-- overload rather than replacing the old signature -- same trap this
-- codebase already hit once with create_engagement. Drop the superseded
-- 11-arg signature so a call omitting p_force_create can't become ambiguous.
drop function public.create_client(uuid, text, text, text, text, date, text, text, text, text, text);
