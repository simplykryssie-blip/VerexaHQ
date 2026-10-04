// P08-01/P08-02 corrective migration -- source-level checks against
// 20261104030000_fix_retry_failed_automation_run_production_baseline.sql,
// mirroring this repo's existing convention for asserting migration SQL
// content (e.g. tests/p08-01-automation-completion-state.test.ts).
//
// Why this migration exists: PR #362's migration
// (20261104020000_fix_automation_completion_state_and_pending_step_loss.sql,
// merged to main, never applied to production) rewrote
// retry_failed_automation_run() against the repository's only tracked
// definition, which turned out to be stale -- production's live function
// has materially diverged (returns jsonb, not void; workspace-scoped +
// platform authorization, not platform-only; an operational gate; an
// audit trail into automation_run_retry_attempts, a table with no
// corresponding migration anywhere in git -- tracked separately as
// DRIFT-001, not addressed here). Applying PR #362's migration to
// production failed with "cannot change return type of existing function".
// This migration is NOT a modification of 20261104020000 -- that file is
// left exactly as merged, as the historical record of what PR #362
// contained. This migration supersedes it at apply time by redefining the
// same two functions again, this time against the actual verified live
// baseline.
//
// Before writing this file, every scenario below was proven against a
// real, disposable local Postgres 16 instance seeded with a reconstruction
// of the ACTUAL production schema for automation_run_retry_attempts (PK,
// both FKs, the UNIQUE(run_id, attempt_number) constraint, RLS enabled)
// alongside the real, unmodified execute_automation_step body from
// supabase/migrations/20261030095000_fix_automation_resume_skips_blocked_step.sql
// and this migration's two functions -- 21 scenarios, all passing,
// covering authorization (workspace-scoped permission, platform admin,
// platform IT, unauthorized rejection, non-operational-workspace
// rejection), existing validation (missing run, non-failed run), P08
// retry-dispatch correctness (ordinary action failure vs. each of the four
// resolution-failure shapes, each proven via a distinguishing side effect:
// the wrong dispatch would flip status to 'completed' or omit the expected
// marker), audit-trail behavior (attempt_number sequencing across
// multiple retries of the same run, step_id_at_retry correctly NULL for a
// no-entry-step retry, retried_by matching the acting user), and direct
// (non-retry) P08-01 behavior for all four abnormal-termination shapes
// plus the legitimate-leaf-stays-completed case. Torn down afterward
// (DROP DATABASE + service stop). Not part of this CI-reproducible suite;
// disclosed here and in the PR description, same convention as this
// engagement's F-03/F-04 and P08-01/P08-02 work.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const migration = readFileSync(
  join(migrationsDir, "20261104030000_fix_retry_failed_automation_run_production_baseline.sql"),
  "utf8"
);
const originalP08Migration = readFileSync(
  join(migrationsDir, "20261104020000_fix_automation_completion_state_and_pending_step_loss.sql"),
  "utf8"
);
// Strip comment lines before scope-discipline checks below -- this
// migration's own header prose discusses DRIFT-001 and the failed
// 20261104020000 attempt in terms that would otherwise false-positive
// against a naive keyword search (e.g. explaining that no CREATE TABLE is
// included), mirroring this repo's existing comment-stripping convention
// (e.g. tests/fix-submit-public-organizer-response-client-binding-and-validation.test.ts).
const migrationExecutable = migration
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

function functionBody(name: string, endMarker: string): string {
  const start = migration.indexOf(`function public.${name}(`);
  expect(start, `function public.${name} should be defined in this migration`).toBeGreaterThan(-1);
  const end = migration.indexOf(endMarker, start);
  return migration.slice(start, end);
}

describe("historical artifact is untouched", () => {
  it("20261104020000 (PR #362's merged migration) is not modified by this corrective migration", () => {
    // This test only asserts the file this suite reads is the same one
    // tests/p08-01-automation-completion-state.test.ts reads -- a content
    // change there would be caught by that file's own assertions, which
    // this migration does not touch.
    expect(originalP08Migration).toMatch(/create or replace function public\.start_next_automation_step/);
    expect(originalP08Migration).toMatch(/create or replace function public\.retry_failed_automation_run/);
    expect(originalP08Migration).toMatch(/returns void/); // the stale, pre-drift-discovery version, preserved as history
  });
});

describe("retry_failed_automation_run -- matches the verified production baseline", () => {
  const body = functionBody("retry_failed_automation_run", "$function$;");

  it("returns jsonb, not void", () => {
    expect(migration).toMatch(/create or replace function public\.retry_failed_automation_run\(p_run_id uuid\)\s*\nreturns jsonb/);
  });

  it("preserves workspace-scoped + platform authorization exactly as live", () => {
    expect(body).toMatch(/public\.has_permission\(v_run\.workspace_id, 'automations\.manage'\)/);
    expect(body).toMatch(/or public\.is_platform_admin\(\)/);
    expect(body).toMatch(/or public\.is_platform_it\(\)/);
    expect(body).toMatch(/insufficient permissions to retry this automation run/);
  });

  it("preserves the operational gate exactly as live", () => {
    expect(body).toMatch(/if not public\.is_workspace_operational\(v_run\.workspace_id\) then/);
    expect(body).toMatch(/this workspace is not currently operational/);
  });

  it("preserves the exact existing-validation error text", () => {
    expect(body).toMatch(/automation run not found/);
    expect(body).toMatch(/this run is not in a failed state/);
  });

  it("removes the unconditional current_step_id IS NULL rejection (P08-01: no-entry-step is now retriable)", () => {
    expect(body).not.toMatch(/this run has no step to retry/);
  });

  it("preserves the audit insert -- same columns, same attempt_number sequencing, inserted before dispatch", () => {
    expect(body).toMatch(/select coalesce\(max\(attempt_number\), 0\) \+ 1 into v_attempt_number\s*\n\s*from public\.automation_run_retry_attempts where run_id = p_run_id;/);
    const auditInsertIndex = body.indexOf("insert into public.automation_run_retry_attempts");
    expect(auditInsertIndex).toBeGreaterThan(-1);
    expect(body.slice(auditInsertIndex, auditInsertIndex + 300)).toMatch(
      /\(run_id, workspace_id, attempt_number, step_id_at_retry, retried_by\)\s*\n\s*values \(p_run_id, v_run\.workspace_id, v_attempt_number, v_run\.current_step_id, auth\.uid\(\)\);/
    );
    const dispatchIndex = body.indexOf("if v_is_resolution_failure");
    expect(auditInsertIndex).toBeLessThan(dispatchIndex);
  });

  it("preserves the exact jsonb return shape", () => {
    expect(body).toMatch(/return jsonb_build_object\('ok', true, 'attempt_number', v_attempt_number\);/);
  });

  it("inspects the latest failed execution log for all four P08 resolution-failure markers", () => {
    expect(body).toMatch(/\(v_last_log_data->>'dead_end'\)::boolean/);
    expect(body).toMatch(/\(v_last_log_data->>'unwired_branch'\)::boolean/);
    expect(body).toMatch(/\(v_last_log_data->>'no_entry_step'\)::boolean/);
    expect(body).toMatch(/\(v_last_log_data->>'unexpected_error'\)::boolean/);
  });

  it("dispatches a resolution failure (or a null current_step_id) via start_next_automation_step, never execute_automation_step on the already-completed step", () => {
    const dispatch = body.slice(body.indexOf("if v_is_resolution_failure"));
    expect(dispatch).toMatch(/if v_is_resolution_failure or v_run\.current_step_id is null then\s*\n\s*perform public\.start_next_automation_step\(p_run_id\);\s*\n\s*else\s*\n\s*perform public\.execute_automation_step\(p_run_id, v_run\.current_step_id\);/);
  });
});

describe("start_next_automation_step -- carried forward unchanged from PR #362", () => {
  const body = functionBody("start_next_automation_step", "$function$;");

  it("has the LEFT JOIN fix for to_step_id IS NULL edges", () => {
    expect(body).toMatch(/left join public\.automation_steps ts on ts\.id = e\.to_step_id/);
    expect(body).toMatch(/e\.to_step_id is null or ts\.automation_id = v_run\.automation_id/);
  });

  it("marks no_entry_step/dead_end/unwired_branch as failed, not completed", () => {
    expect(body).toMatch(/'no_entry_step', true/);
    expect(body).toMatch(/'dead_end', true/);
    expect(body).toMatch(/'unwired_branch', true/);
  });

  it("the legitimate no-outgoing-edges leaf case remains completed", () => {
    const section = body.slice(body.indexOf("-- Genuinely no outgoing edges"), body.indexOf("-- Genuinely no outgoing edges") + 400);
    expect(section).toMatch(/update public\.automation_runs set status = 'completed'/);
  });

  it("has its own exception handler so an unexpected error doesn't roll back its own evidence", () => {
    expect(body).toMatch(/exception when others then/);
    expect(body).toMatch(/'unexpected_error', true/);
  });
});

describe("P08 corrective migration -- scope discipline", () => {
  it("does not touch F-03/F-04, organizer submission, RLS, grants, or any table/index/constraint", () => {
    expect(migrationExecutable).not.toMatch(/submit_public_organizer_response/);
    expect(migrationExecutable).not.toMatch(/fire_organizer_submitted_automations/);
    expect(migrationExecutable).not.toMatch(/create policy|alter policy|drop policy/i);
    expect(migrationExecutable).not.toMatch(/\bgrant\b|\brevoke\b/i);
    expect(migrationExecutable).not.toMatch(/create table|alter table|create index|add constraint/i);
  });

  it("does not create automation_run_retry_attempts (DRIFT-001 is a separate, unaddressed finding)", () => {
    expect(migrationExecutable).not.toMatch(/create table.*automation_run_retry_attempts/i);
  });

  it("defines exactly the two functions this remediation requires", () => {
    const defs = migration.match(/create or replace function public\.\w+/g) ?? [];
    expect(defs.sort()).toEqual(
      ["create or replace function public.retry_failed_automation_run", "create or replace function public.start_next_automation_step"].sort()
    );
  });
});
