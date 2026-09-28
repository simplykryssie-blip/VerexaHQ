-- Automations reconciliation, Phase 19/9: server-side publish validation
-- enforcement.
--
-- Audited how a workflow actually goes live today: validate_automation()
-- already exists and is genuinely thorough for per-step config (missing
-- template, missing tag, missing pipeline stage, unrecognized trigger type
-- as of 20261101020000, etc.) -- but it is only ever CALLED from the
-- client (components/workflows/WorkflowList.tsx, WorkflowBuilder.tsx)
-- immediately before a plain `.update({status: 'published', is_enabled:
-- true})`. Nothing stops that update from being sent directly (a
-- different client, a bug that skips the check, a future code path) --
-- the RLS policy on automations_update only checks
-- has_permission(workspace_id, 'automations.manage'), it says nothing
-- about the automation's own validity. That is exactly the "server-side
-- enforcement required, not merely UI validation" gap: today publishing
-- is enforced by a client convention, not a database guarantee.
--
-- Fix: an AFTER INSERT OR UPDATE trigger that re-runs the EXISTING
-- validate_automation() (not a second, duplicated rule set) whenever a
-- row transitions INTO "live" -- is_enabled flips false/absent -> true,
-- or status transitions into 'published' -- and aborts the write if any
-- issue is found. A row that is already live and is being edited for an
-- unrelated reason (e.g. renaming it, or the GHL-import pause/resume flow
-- flipping is_enabled back on) is only re-validated when it's the
-- is_enabled/status transition itself doing the flipping, so this can't
-- newly block an already-published workflow from being renamed if it
-- happens to have since drifted invalid -- consistent with "existing
-- workflows must remain backward compatible where still valid" (and,
-- separately, an already-invalid already-published workflow simply
-- keeps running exactly as it does today; this only ever blocks a NEW
-- transition into live, never retroactively un-publishes anything).
--
-- AFTER (not BEFORE) because validate_automation looks the row up by id
-- from the table itself (`where id = p_automation_id`) -- in a BEFORE
-- INSERT trigger the row does not exist yet and the lookup would find
-- nothing, incorrectly raising "automation not found" on every insert
-- that happened to set is_enabled/status directly. No current code path
-- does that (every insert observed leaves status/is_enabled at their
-- column defaults, draft/false), but AFTER is correct regardless of that
-- and costs nothing extra since raising inside an AFTER trigger still
-- rolls back the entire statement.
--
-- validate_automation's own has_permission(workspace_id, 'automations.manage')
-- check fires again here, but that's the exact same permission the
-- automations_update/automations_insert RLS policies already require to
-- reach this trigger at all -- never a new or stricter requirement for a
-- legitimately authorized caller, including the GHL-import route's
-- session-bound re-enable of paused automations.
create or replace function public.enforce_automation_publish_validation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_going_live boolean;
  v_issue record;
begin
  if tg_op = 'INSERT' then
    v_going_live := coalesce(new.is_enabled, false) or new.status = 'published';
  else
    v_going_live := (coalesce(new.is_enabled, false) and not coalesce(old.is_enabled, false))
      or (new.status = 'published' and old.status is distinct from 'published');
  end if;

  if not v_going_live then
    return new;
  end if;

  select * into v_issue from public.validate_automation(new.id) limit 1;
  if found then
    raise exception 'Cannot activate or publish this workflow: %', v_issue.issue;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_automation_publish_validation_trg on public.automations;
create trigger enforce_automation_publish_validation_trg
  after insert or update on public.automations
  for each row execute function public.enforce_automation_publish_validation();

-- New, additive validation content (safe to add: a purely new check on a
-- brand-new config shape this same branch introduced, never tightening an
-- existing check whose full current config shape wasn't independently
-- re-verified here -- see the migration header comment on why e.g.
-- assign_user's staff/pool assignment shape and move_pipeline_stage's
-- existence-check were deliberately NOT touched in this pass).
--
-- Considered and DROPPED: a "dangling branch edge" check (an
-- automation_step_edges row whose from_step_id/to_step_id no longer points
-- at a real step). automation_step_edges.from_step_id/to_step_id are both
-- `references automation_steps(id) on delete cascade`
-- (20260819172238_automation_graph_model_schema_and_backfill.sql) -- the
-- database itself already guarantees that state can never exist, so a
-- check for it would be dead code, not a real safeguard.
--
-- webhook.received trigger config: when trigger_config->>'integration_id'
-- is set (the new generic-webhook-infrastructure path added earlier in
-- this branch), it must reference a webhook_integrations row that
-- actually exists, belongs to this automation's own workspace, and is
-- active -- otherwise the workflow would publish successfully and then
-- never fire, the same silent-failure class known_automation_trigger_types
-- was added to catch for an unrecognized trigger_type string. Anchored on
-- validate_automation's step-count check, which is the next-most-stable,
-- very-unlikely-to-move point in the function (immediately after it,
-- before the per-step loop begins).
do $migration$
declare
  v_def text;
  v_anchor text := $anchor$  select count(*) into v_step_count from public.automation_steps where automation_id = p_automation_id;
  if v_step_count = 0 then
    return query select 0, 'no_steps'::text, 'Steps'::text, 'This automation has no steps, so activating it does nothing.'::text;
  end if;$anchor$;
  v_insert text := $anchor$  select count(*) into v_step_count from public.automation_steps where automation_id = p_automation_id;
  if v_step_count = 0 then
    return query select 0, 'no_steps'::text, 'Steps'::text, 'This automation has no steps, so activating it does nothing.'::text;
  end if;

  if v_trigger_type = 'webhook.received' then
    declare
      v_integration_id text;
    begin
      select trigger_config->>'integration_id' into v_integration_id from public.automations where id = p_automation_id;
      if nullif(v_integration_id, '') is not null then
        if not exists (
          select 1 from public.webhook_integrations wi
          where wi.id = v_integration_id::uuid and wi.workspace_id = v_workspace_id and wi.status = 'active'
        ) then
          return query select 0, 'trigger'::text, 'Trigger'::text, 'The webhook integration configured for this trigger no longer exists, belongs to a different workspace, or has been disabled.'::text;
        end if;
      end if;
    end;
  end if;$anchor$;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc
  where proname = 'validate_automation' and pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception 'validate_automation not found -- cannot patch publish validation in';
  end if;

  if v_def not like '%' || v_anchor || '%' then
    raise exception 'validate_automation''s body has changed in a way this migration did not expect (anchor not found) -- update this migration''s anchor to match the current function body before re-running';
  end if;

  execute replace(v_def, v_anchor, v_insert);
end;
$migration$;
