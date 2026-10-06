// P08-01 / P08-02 (automation completion-state reliability) -- source-level
// checks against the DB-side migration, mirroring this repo's existing
// convention for asserting migration SQL content (e.g.
// tests/aal2-migration.test.ts, tests/contact-sharing-schema.test.ts).
//
// Before writing this file, every scenario below (plus the retry-dispatch
// and dashboard-discoverability ones) was proven against a real, disposable
// local Postgres 16 instance: the actual, unmodified execute_automation_step
// body from supabase/migrations/20261030095000_fix_automation_resume_skips_blocked_step.sql
// loaded alongside this migration's new start_next_automation_step /
// retry_failed_automation_run, plus the real, unmodified
// get_platform_failed_automation_runs from
// supabase/migrations/20260905140000_it_command_center_foundation.sql,
// against a minimal stand-in schema (automations/automation_steps/
// automation_step_edges/automation_runs/automation_execution_logs/
// automation_pending_steps + stub is_workspace_operational/is_platform_admin/
// is_platform_it/evaluate_automation_conditions), run with real SQL calls
// and real fixture data, then torn down (DROP DATABASE + service stop) --
// same harness convention as this engagement's F-03/F-04 work. Not part of
// this CI-reproducible suite; disclosed here and in the PR description.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const migration = readFileSync(
  join(migrationsDir, "20261104020000_fix_automation_completion_state_and_pending_step_loss.sql"),
  "utf8"
);

function functionBody(name: string): string {
  const start = migration.indexOf(`function public.${name}(`);
  expect(start, `function public.${name} should be defined in this migration`).toBeGreaterThan(-1);
  const end = migration.indexOf(name === "start_next_automation_step" ? "$function$;" : "$$;", start);
  return migration.slice(start, end);
}

describe("start_next_automation_step -- P08-01 abnormal-termination shapes", () => {
  const body = functionBody("start_next_automation_step");

  it("no_entry_step: logs a failed execution row (previously logged nothing at all) and marks the run failed, not completed", () => {
    const section = body.slice(body.indexOf("if v_next_step_id is null then"), body.indexOf("else\n        v_matched"));
    expect(section).toMatch(/'no_entry_step', true/);
    expect(section).toMatch(/status = 'failed', completed_at = now\(\) where id = p_run_id/);
    expect(section).not.toMatch(/status = 'completed'/);
  });

  it("dead_end: the log row's own status is 'failed' (not 'completed' as before), and automation_runs is marked failed", () => {
    const markerIndex = body.indexOf("'dead_end', true");
    const section = body.slice(markerIndex - 200, markerIndex + 400);
    // The insert's own column list binds `status` positionally to the 5th value -- 'failed'.
    expect(section).toMatch(/v_run\.engagement_id, p_run_id, 'failed',\s*\n\s*jsonb_build_object\('run_id', p_run_id, 'step_id', v_current_step_id, 'dead_end', true/);
    expect(body).toMatch(/update public\.automation_runs set status = 'failed', completed_at = now\(\) where id = p_run_id;\s*\n\s*else\s*\n\s*-- Genuinely no outgoing edges/);
  });

  it("the genuinely-legitimate leaf case (no outgoing edges at all) is unchanged: still 'completed', no dead_end log", () => {
    const section = body.slice(body.indexOf("-- Genuinely no outgoing edges"), body.indexOf("-- Genuinely no outgoing edges") + 400);
    expect(section).toMatch(/update public\.automation_runs set status = 'completed', completed_at = now\(\) where id = p_run_id;/);
    expect(section).not.toMatch(/dead_end/);
  });

  it("unwired_branch: the log row's own status is 'failed', and automation_runs is marked failed", () => {
    const markerIndex = body.indexOf("'unwired_branch', true");
    const section = body.slice(markerIndex - 200, markerIndex + 400);
    expect(section).toMatch(/v_run\.engagement_id, p_run_id, 'failed',\s*\n\s*jsonb_build_object\('run_id', p_run_id, 'step_id', v_current_step_id, 'unwired_branch', true/);
  });

  it("the edge-matching loop and the has-edges check use LEFT JOIN, not INNER JOIN, so an edge with to_step_id = null is still considered instead of silently vanishing", () => {
    const loopQuery = body.slice(body.indexOf("for v_edge in"), body.indexOf("loop", body.indexOf("for v_edge in")));
    expect(loopQuery).toMatch(/left join public\.automation_steps ts on ts\.id = e\.to_step_id/);
    expect(loopQuery).toMatch(/e\.to_step_id is null or ts\.automation_id = v_run\.automation_id/);
    expect(loopQuery).not.toMatch(/\n\s*join public\.automation_steps/); // no bare inner join left

    const hasEdgesIndex = body.indexOf("into v_has_edges");
    const hasEdgesBlock = body.slice(body.lastIndexOf("select exists(", hasEdgesIndex), hasEdgesIndex + 20);
    expect(hasEdgesBlock).toMatch(/left join public\.automation_steps ts on ts\.id = e\.to_step_id/);
    expect(hasEdgesBlock).toMatch(/e\.to_step_id is null or ts\.automation_id = v_run\.automation_id/);
  });
});

describe("start_next_automation_step -- P08-02(b) root-cause fix: no more silent evidence-erasing rollback", () => {
  const body = functionBody("start_next_automation_step");

  it("wraps the step-resolution loop in its own exception handler (previously had none at all)", () => {
    expect(body).toMatch(/begin\s*\n\s*loop/);
    expect(body).toMatch(/end loop;\s*\n\s*exception when others then/);
  });

  it("the exception handler logs a failed execution row with an unexpected_error marker and sqlerrm, then marks the run failed", () => {
    const handler = body.slice(body.indexOf("exception when others then"));
    expect(handler).toMatch(/'unexpected_error', true/);
    expect(handler).toMatch(/sqlerrm, now\(\)\);/);
    expect(handler).toMatch(/update public\.automation_runs set status = 'failed', completed_at = now\(\) where id = p_run_id;/);
  });

  it("because the handler lives inside this function, it also covers the function's own recursive invocation from execute_automation_step's tail call -- no change to execute_automation_step was needed", () => {
    const execStep = migration; // execute_automation_step is NOT redefined in this migration at all
    expect(execStep).not.toMatch(/create or replace function public\.execute_automation_step/);
  });
});

describe("retry_failed_automation_run -- dispatches to the correct resume function", () => {
  const body = functionBody("retry_failed_automation_run");

  it("no longer rejects a run with a null current_step_id (a no-entry-step failure is now a legitimate retry target)", () => {
    expect(body).not.toMatch(/this run has no step to retry/);
  });

  it("inspects the latest failed execution log for dead_end/unwired_branch/no_entry_step/unexpected_error to decide which function to re-invoke", () => {
    expect(body).toMatch(/where workflow_run_id = p_run_id and status = 'failed'\s*\n\s*order by executed_at desc\s*\n\s*limit 1/);
    expect(body).toMatch(/\(v_last_log_data->>'dead_end'\)::boolean/);
    expect(body).toMatch(/\(v_last_log_data->>'unwired_branch'\)::boolean/);
    expect(body).toMatch(/\(v_last_log_data->>'no_entry_step'\)::boolean/);
    expect(body).toMatch(/\(v_last_log_data->>'unexpected_error'\)::boolean/);
  });

  it("a step-resolution failure (or a null current_step_id) retries via start_next_automation_step, never execute_automation_step on the already-completed step", () => {
    const dispatch = body.slice(body.indexOf("if v_is_resolution_failure"));
    expect(dispatch).toMatch(/if v_is_resolution_failure or v_run\.current_step_id is null then\s*\n\s*perform public\.start_next_automation_step\(p_run_id\);\s*\n\s*else\s*\n\s*perform public\.execute_automation_step\(p_run_id, v_run\.current_step_id\);/);
  });

  it("still requires platform-admin/platform-IT and still requires status='failed' (unchanged guards)", () => {
    expect(body).toMatch(/if not \(public\.is_platform_admin\(\) or public\.is_platform_it\(\)\) then/);
    expect(body).toMatch(/if v_run\.status <> 'failed' then/);
  });
});

describe("P08-01/P08-02 scope discipline", () => {
  it("does not touch the F-03/F-04 public organizer response remediation", () => {
    expect(migration).not.toMatch(/submit_public_organizer_response/);
  });

  it("does not modify any RLS policy, grant, table, index, or constraint", () => {
    expect(migration).not.toMatch(/create policy|alter policy|drop policy/i);
    expect(migration).not.toMatch(/\bgrant\b|\brevoke\b/i);
    expect(migration).not.toMatch(/create table|alter table|create index|add constraint/i);
  });

  it("defines exactly the two functions this remediation requires, nothing else", () => {
    const defs = migration.match(/create or replace function public\.\w+/g) ?? [];
    expect(defs.sort()).toEqual(
      ["create or replace function public.retry_failed_automation_run", "create or replace function public.start_next_automation_step"].sort()
    );
  });
});
