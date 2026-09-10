-- start_trial_workspace was a duplicate of create_trial_workspace, added in
-- the same session as a separate concurrent fix for the same request before
-- discovering the other already-merged implementation. Dropped in favor of
-- create_trial_workspace (see 20260909200000_reopen_self_serve_trial_signup),
-- which is more thorough (confirmed-email check, one-trial-per-account
-- guard, sets current_period_start/end too) and is what app/trial-signup
-- actually calls.
drop function if exists public.start_trial_workspace(text, text);
