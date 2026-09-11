-- Lets an ERO opt a specific connected PTIN into keeping a small piece of
-- their own visual identity (just logo + accent color) even while fully
-- whitelabeled by the ERO for everything else. Off by default -- the ERO
-- decides per PTIN, same shape as the existing shares_communications_identity
-- toggle on this table.
alter table public.firm_connections
  add column allows_branding_override boolean not null default false;
