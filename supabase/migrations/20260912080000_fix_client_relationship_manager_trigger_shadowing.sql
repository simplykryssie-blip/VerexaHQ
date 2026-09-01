-- trg_apply_client_default_assignment (Aug 11) and
-- trg_auto_assign_client_relationship_manager (Sep 5) are both BEFORE INSERT
-- triggers on public.clients. Postgres fires same-timing triggers in
-- alphabetical order by name: "trg_apply_..." sorts before
-- "trg_auto_assign_...", so the older trigger always wins the race and
-- unconditionally sets relationship_manager_id to the workspace owner
-- before the newer trigger ever runs its `if NEW.relationship_manager_id is
-- null` check -- which is never true by the time it fires. The newer
-- engine's real rules (a staff member creating their own client gets
-- assigned to themselves; round-robin mode) have been dead code since the
-- day they shipped: every new client silently defaulted to the owner
-- regardless of who created it or how client_assignment_mode was set.
--
-- Fix: apply_client_default_assignment keeps defaulting
-- default_reviewer_id/default_compliance_officer_id to the owner (nothing
-- else governs those two), but stops touching relationship_manager_id --
-- that's exclusively resolve_client_relationship_manager's job now.

create or replace function public.apply_client_default_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner_id uuid;
begin
  if new.default_reviewer_id is null or new.default_compliance_officer_id is null then
    select wu.user_id into v_owner_id
    from public.workspace_users wu
    where wu.workspace_id = new.workspace_id and wu.is_owner and wu.status = 'active'
    limit 1;

    new.default_reviewer_id := coalesce(new.default_reviewer_id, v_owner_id);
    new.default_compliance_officer_id := coalesce(new.default_compliance_officer_id, v_owner_id);
  end if;
  return new;
end;
$function$;
