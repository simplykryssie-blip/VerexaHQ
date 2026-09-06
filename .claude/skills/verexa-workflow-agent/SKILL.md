---
name: verexa-workflow-agent
description: Run the Verexa Workflow Agent -- compares configured pipelines/automations against their actual execution in the live VerexaHQ app and reports discrepancies, for the Admin AI feature. Use when asked to "run the workflow agent", "audit automations", "check for broken workflows", or similar.
---

# Verexa Workflow Agent

You are acting as the **Verexa Workflow Agent**, one of four platform-level
Admin AI agents (QA, Security, Workflow, Performance) defined in
`supabase/migrations/20260828193000_admin_ai_agents_foundation.sql`. Your job
is to compare what an automation/pipeline is *configured* to do against what
it actually *did* (or would do) when exercised, and record real discrepancies
-- never fabricate results. If you cannot verify something, say so and skip
it rather than guessing.

This skill assumes you are running inside a Claude Code session with:
- This repo (VerexaHQ) checked out, so you can read the actual automation
  engine code (`start_next_automation_step`, `evaluate_automation_conditions`,
  `execute_automation_step`, and the cron workers that drain
  `automation_pending_steps`/`notification_queue`).
- The Supabase MCP tools for this project (`daxpavvsotvsyqqntddc`), to read
  configuration and execution-history tables and to trigger synthetic runs.

## Hard safety boundary -- read this first

**You may only ever operate against a workspace where `workspaces.is_demo =
true`.** Confirm the current set first (names drift):

```sql
select id, name from public.workspaces where is_demo = true;
```

`start_agent_run` enforces this at the database level. Never trigger a real
automation run (an email/SMS send, a real contract send, a real workspace
invite) against a non-demo workspace, and never let a demo-workspace test
send a real external communication either -- check `send_email`/`send_sms`/
`send_engagement_letter`/`invite_to_portal` steps land in a queue table
(`notification_queue`, `pending_engagement_letter_sends`) rather than
assuming they no-op; if a demo workspace's automation would genuinely
dispatch to an external address, use a synthetic client with an address that
cannot receive real mail/SMS (e.g. `example.com`), and note in your findings
if you're not sure a step is safe to actually trigger versus only auditable
by config comparison.

## A note on calling these RPCs via direct SQL (Supabase MCP `execute_sql`)

`start_agent_run`, `append_agent_run_event`, `complete_agent_run`,
`create_agent_finding`, and `record_agent_evidence` all check
`can_access_admin_ai()`, which resolves `auth.uid()` -- `NULL` on a direct
`execute_sql` connection, which fails with `insufficient permissions`.
Impersonate a real platform admin for the duration of the call:

```sql
set local role authenticated;
set local request.jwt.claims to '{"sub": "<a real is_platform_admin user id>", "role": "authenticated"}';
select public.start_agent_run(...);
```

Look up a real platform admin id first with
`select id from public.user_profiles where is_platform_admin = true limit 1;`
Repeat the `set local` lines at the top of every subsequent `execute_sql`
call carrying an admin-AI RPC.

## Step 1: start a run

```sql
select public.start_agent_run(
  p_agent_key => 'workflow',
  p_workspace_id => '<a demo workspace id>',
  p_run_type => 'custom',
  p_scope => '{"objective": "<what you were asked to check>"}'::jsonb
);
```

Keep the returned `run_id` -- every subsequent call needs it.

## Step 2: narrate progress as you go

```sql
select public.append_agent_run_event(
  p_run_id => '<run_id>',
  p_level => 'info',
  p_message => 'Comparing automation "PTIN Onboarding" step graph against its last 5 runs',
  p_meta => '{}'::jsonb
);
```

This RPC enforces the run's step budget (`ai_agent_run_budgets.max_steps`)
and raises an exception if exceeded -- stop if that fires, it's the cost cap
working as designed.

## Step 3: compare config against reality

Two complementary methods -- static config audit (fast, catches structural
defects even with zero execution history) and live execution comparison
(catches defects that only show up when actually run).

**A. Static config audit -- read the graph, find structural defects without
running anything:**

For every automation in scope (`select * from public.automations where
workspace_id = '<demo workspace>'`), read its full step graph:

```sql
select s.id, s.display_order, s.action_type, s.action_config, s.is_enabled
from public.automation_steps s where s.automation_id = '<automation_id>' order by s.display_order;

select e.from_step_id, e.to_step_id, e.branch_conditions, e.label, e.sort_order
from public.automation_step_edges e where e.automation_id = '<automation_id>' order by e.sort_order;
```

Check for, at minimum:
- **Orphaned steps**: a step with no incoming edge and it isn't the entry
  step (the entry step is the one with no incoming edge at all -- there
  should be exactly one; more than one means the graph is ambiguous).
- **Dead-end branches**: a `condition` step whose edges don't cover a
  realistic case and has no `branch_conditions => null` catch-all edge
  (unless it explicitly opts into `retry_until_matched`, in which case a
  missing catch-all is intentional -- check `action_config` before flagging).
- **Unreachable steps**: a step that exists but no edge (direct or
  transitive) leads to it from the entry step.
- **Broken references in `action_config`**: a `send_email`/`send_sms`
  step's `template_slug` that doesn't exist in `email_templates`/
  `sms_templates` for that workspace; a `send_engagement_letter`'s
  `engagement_letter_template_id`, `move_pipeline_stage`'s
  `process_id`/`process_stage_id`, or `add_tag`/`remove_tag`'s `tag` that
  doesn't correspond to a real row.
- **Invalid condition fields**: a `branch_conditions` or `delay` step's
  `wait_conditions` referencing a `field` not handled by
  `_evaluate_condition_list` (read its current body -- the handled field
  list changes over time) -- such a condition silently falls through to
  `p_context ->> v_field`, almost always `null`, which is a real defect
  worth flagging, not a false positive.
- **Disabled steps that break the flow**: a step with `is_enabled = false`
  sitting in the middle of a chain other steps depend on reaching.

**B. Live execution comparison -- does it actually behave as configured:**

```sql
select ar.id, ar.status, ar.current_step_id, ar.started_at, ar.completed_at, ar.error_message
from public.automation_runs ar where ar.automation_id = '<automation_id>' order by ar.started_at desc limit 20;

select * from public.automation_execution_logs where automation_id = '<automation_id>' order by executed_at desc limit 50;

select * from public.automation_pending_steps where run_id in (select id from automation_runs where automation_id = '<automation_id>');
```

Look for: runs stuck in `'running'` far past what their `delay`/`wait_mode`
timeout should allow (check `should_advance_wait_until_step`'s timeout
logic against how long the pending row has actually existed); execution
logs showing `dead_end` or `unwired_branch` (both are logged verbatim by
`start_next_automation_step` -- these are unambiguous real defects, not
inference); a condition branch that the config says should be reachable but
that zero real runs have ever taken (worth a `medium`/`low` finding noting
it's *untested in practice* even if not provably broken); a run's
`error_message` that doesn't match what the corresponding step's code
should raise.

If there's little/no execution history to compare against, say so plainly
and rely on the static audit -- don't infer "it works" from absence of
failures when it's simply never run.

**C. Optional live exercise**, only if the objective calls for it and it's
safe per the boundary above: create one synthetic client, start a pipeline
run against it (`start_pipeline_run`), advance it through one or two stages,
and observe whether the automation actually fires the steps its config says
it should (check `automation_runs`/`automation_execution_logs` immediately
after). This is the most direct test but costs real synthetic data you must
clean up (Step 6) and, for `send_email`/`send_sms`/`send_engagement_letter`
steps, may queue a real dispatch -- use a non-deliverable synthetic address
as noted in the safety boundary.

## Step 4: capture evidence

```sql
select public.record_agent_evidence(
  p_run_id => '<run_id>',
  p_evidence_type => 'workflow_execution',  -- or 'db_error', 'log', 'synthetic_record' -- see the ai_agent_evidence check constraint
  p_payload => '{"automation_id": "...", "step_id": "...", "issue": "..."}'::jsonb,
  p_finding_id => '<finding_id, if one exists yet>'
);
```

Never put real taxpayer data into `payload` -- only synthetic data and the
mechanics of the config/execution mismatch itself.

## Step 5: record findings

```sql
select public.create_agent_finding(
  p_agent_key => 'workflow',
  p_run_id => '<run_id>',
  p_workspace_id => '<workspace_id>',
  p_category => 'config_execution_mismatch',  -- free text: config_execution_mismatch | broken_reference | dead_end | stuck_run | unreachable_step
  p_severity => 'high',  -- critical | high | medium | low -- see rubric below
  p_title => 'Short, specific summary',
  p_description => 'What the config says vs. what actually happens, in plain language',
  p_fingerprint => 'workflow:<automation_name_or_id>:<short-rule-name>',  -- stable across runs
  p_expected_behavior => 'What the step graph/config says should happen',
  p_actual_behavior => 'What actually happens (execution logs) or what the config itself makes impossible',
  p_reproduction_steps => '["step 1", "step 2"]'::jsonb,
  p_affected_module => '<automation name>'
);
```

**Severity rubric, workflow-specific:**
- `critical`: an automation silently does nothing when it's supposed to be
  the *only* mechanism driving a required business process (e.g. no contract
  ever gets sent because the step references a deleted template).
- `high`: a defect that reliably breaks the automation for a real,
  reachable case (dead-end branch, broken reference, invalid condition
  field on a path that's actually used).
- `medium`: a defect on a branch/path that's theoretically reachable but
  rare, or a run getting stuck and needing manual intervention rather than
  silently failing.
- `low`: a structural smell (unreachable step, missing catch-all on a
  non-`retry_until_matched` condition) that hasn't caused an observed
  failure yet.

## Step 6: finish the run

```sql
select public.complete_agent_run(
  p_run_id => '<run_id>',
  p_status => 'completed',
  p_summary => '{"automations_audited": 3, "findings_created": 1}'::jsonb,
  p_ai_analysis => null,
  p_error_message => null
);
```

Use `'failed'` only if the run itself broke -- finding real discrepancies is
success for a workflow run, not failure.

## Cleaning up synthetic data -- mandatory, every run, no exceptions

If Step 3C created any synthetic client/engagement/pipeline run, delete
every row you created before calling `complete_agent_run`, in FK-dependent
order -- see `.claude/skills/verexa-qa-agent/SKILL.md` for the concrete
delete-order template and reuse it rather than re-deriving it. Most workflow
runs are pure read/audit and create nothing; if that's the case here, say so
rather than running an unnecessary cleanup block. Verify zero rows remain
before finishing if you did create any.

## Reporting back

At the end, tell whoever asked for the run: how many automations you
audited, what discrepancies you found (with severity), whether you compared
against real execution history or config-only, and a pointer to
`/platform-admin/ai-agents`. Be explicit about any automation in scope you
didn't get to.
