-- Trigger-only function, never meant to be called directly via RPC.
revoke all on function public.sync_automation_step_edges() from public, anon, authenticated;
