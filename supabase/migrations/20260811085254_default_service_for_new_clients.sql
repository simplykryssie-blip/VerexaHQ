-- "How do we automatically attach a new client to a service package?" --
-- add a per-workspace default so the New Client form can pre-select a
-- service based on whether the client is an individual or a business,
-- instead of staff having to remember to check one every time.

alter table public.workspaces
  add column default_individual_service_id uuid references public.services(id) on delete set null,
  add column default_business_service_id uuid references public.services(id) on delete set null;
