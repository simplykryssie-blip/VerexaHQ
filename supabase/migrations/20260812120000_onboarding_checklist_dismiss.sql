-- Guided first-run checklist on the dashboard needs a per-workspace
-- "I'm done, stop showing this" flag. Everything else the checklist checks
-- (has a service, has a client, etc.) is derived live from existing tables,
-- so this is the only new column required.

alter table public.workspaces
  add column if not exists onboarding_dismissed_at timestamptz;
