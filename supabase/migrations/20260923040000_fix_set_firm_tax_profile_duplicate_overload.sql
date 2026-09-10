-- 20260923020000 appended p_caf/p_clear_caf via `create or replace function`,
-- but Postgres only replaces a function in place when the argument list is
-- identical -- adding parameters (even at the end, even with defaults)
-- registers a second overload instead, leaving the old 10-arg version live
-- and callable alongside the new 12-arg one. Drop the stale overload so
-- there's exactly one set_firm_tax_profile again.
drop function if exists public.set_firm_tax_profile(uuid, text, text, text, boolean, boolean, boolean, text[], jsonb, jsonb);
