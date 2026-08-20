-- Lets an ERO/Service Bureau workspace preset who a new client's
-- relationship manager/reviewer/compliance officer defaults to, instead of
-- always falling back to the account holder. reviewer/compliance_officer
-- (but not relationship_manager -- that's inherently local to whoever owns
-- the day-to-day relationship) also flow down as the fallback for new
-- clients created in a connected downline workspace, since oversight roles
-- are what an ERO/SB is actually presetting network-wide.
alter table public.workspaces
  add column default_relationship_manager_id uuid references public.user_profiles(id),
  add column default_reviewer_id uuid references public.user_profiles(id),
  add column default_compliance_officer_id uuid references public.user_profiles(id);
