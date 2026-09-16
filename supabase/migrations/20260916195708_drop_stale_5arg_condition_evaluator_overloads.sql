-- create or replace does not remove a function when the parameter list
-- changes -- it created new 7-arg overloads of evaluate_automation_conditions
-- and _evaluate_condition_list alongside the old 5-arg ones instead of
-- replacing them, leaving two overloads live and ambiguous for any 5-arg
-- caller. Every real call site was already updated to pass all 7 args, so
-- the old signatures are dead; drop them so only the partner-aware version
-- can ever be resolved.
drop function if exists public.evaluate_automation_conditions(jsonb, jsonb, uuid, uuid, uuid);
drop function if exists public._evaluate_condition_list(jsonb, jsonb, uuid, uuid, uuid);
