-- Contact Sharing Phase 0: database-level enforcement that an Independent
-- PTIN workspace has at most one active ero_ptin firm_connections row.
-- Prerequisite for the "Share with ERO" feature (later passes) -- the
-- create_contact_share RPC will rely on this being structurally impossible
-- to violate, rather than defending against ambiguity in application code.
--
-- Self-verifying, not dependent on any prior audit's point-in-time read:
-- preflight first, name the violating rows and abort if any exist, only
-- then create the constraint. CREATE UNIQUE INDEX would itself refuse to
-- build over violating data anyway -- the preflight exists purely to give
-- a clear, specific error naming the offending workspaces rather than a
-- generic Postgres uniqueness-violation message.

do $$
declare
  v_violation record;
  v_violations text := '';
  v_count int := 0;
begin
  for v_violation in
    select child_workspace_id, count(*) as active_count
    from public.firm_connections
    where relationship_type = 'ero_ptin'
      and status = 'active'
      and child_workspace_id is not null
    group by child_workspace_id
    having count(*) > 1
  loop
    v_count := v_count + 1;
    v_violations := v_violations || format('child_workspace_id=%s (active_count=%s); ', v_violation.child_workspace_id, v_violation.active_count);
  end loop;

  if v_count > 0 then
    raise exception 'one-active-ERO constraint preflight failed: % child workspace(s) have more than one active ero_ptin connection -- %. Resolve these before this migration can proceed. No data was modified.', v_count, v_violations;
  end if;
end $$;

create unique index firm_connections_one_active_ero_per_child_idx
  on public.firm_connections (child_workspace_id, relationship_type)
  where status = 'active' and relationship_type = 'ero_ptin';
