-- "Powered by VerexaHQ" must never be hidden for a workspace that isn't
-- entitled to hide it, regardless of which code path writes to
-- workspace_brand_profiles. Enforcing this at the database layer (not just
-- in BrandCenter's UI) so every current and future write path is covered.
create or replace function public.enforce_verexahq_branding_entitlement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.show_powered_by = false and not public.can_remove_verexahq_branding(new.workspace_id) then
    new.show_powered_by := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_verexahq_branding_entitlement on public.workspace_brand_profiles;
create trigger trg_enforce_verexahq_branding_entitlement
before insert or update on public.workspace_brand_profiles
for each row execute function public.enforce_verexahq_branding_entitlement();
