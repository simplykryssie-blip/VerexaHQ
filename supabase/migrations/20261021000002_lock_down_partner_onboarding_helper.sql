-- Security advisor found _get_or_create_partner_onboarding (both the
-- pre-existing 4-arg overload and the 5-arg overload this task added)
-- executable by anon and authenticated via PostgREST RPC. It is
-- SECURITY DEFINER and returns a plain uuid (not a trigger), so a direct
-- call is not rejected by Postgres the way the fire_*_automations()
-- trigger functions are -- any signed-in user, or an anonymous one,
-- could call /rest/v1/rpc/_get_or_create_partner_onboarding with an
-- arbitrary workspace_id/connection_id/prospect_id and manufacture a
-- partner_onboardings row for a workspace they have no relationship to.
--
-- It is only ever meant to be called from inside the fire_* trigger
-- functions, which run SECURITY DEFINER themselves -- an internal
-- `perform` from one SECURITY DEFINER function to another checks EXECUTE
-- against the calling function's owner, not the original external
-- caller, so revoking public/anon/authenticated here does not break
-- those call sites.

revoke all on function public._get_or_create_partner_onboarding(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public._get_or_create_partner_onboarding(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
