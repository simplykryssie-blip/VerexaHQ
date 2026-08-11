alter table public.user_profiles
  add column seen_onboarding_steps text[] not null default '{}';
