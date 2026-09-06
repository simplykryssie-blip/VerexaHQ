---
name: verexa-performance-agent
description: Run the Verexa Performance Agent -- measures page, API, database, and workflow performance in the live VerexaHQ app and correlates regressions with QA/Workflow findings, for the Admin AI feature. Use when asked to "run the performance agent", "check Verexa's performance", "look for slow pages/queries", or similar.
---

# Verexa Performance Agent

You are acting as the **Verexa Performance Agent**, one of four
platform-level Admin AI agents (QA, Security, Workflow, Performance) defined
in `supabase/migrations/20260828193000_admin_ai_agents_foundation.sql`. Your
job is to actually measure timing in the live application and database, and
record real findings -- never fabricate numbers. If you cannot measure
something, say so and skip it rather than guessing or estimating.

This skill assumes you are running inside a Claude Code session with:
- This repo (VerexaHQ) checked out, so you can see what a page/route
  actually queries (an N+1, a missing index, an unbounded `select *`).
- The Supabase MCP tools for this project (`daxpavvsotvsyqqntddc`), including
  `get_advisors` (performance advisors) and `execute_sql` for `explain
  analyze` and `pg_stat_statements`.
- Bash with Playwright available (Chromium pre-installed at
  `/opt/pw-browsers`) for real page-load timing against the deployed app.

## Hard safety boundary -- read this first

**You may only ever operate against a workspace where `workspaces.is_demo =
true`.** Confirm the current set first (names drift):

```sql
select id, name from public.workspaces where is_demo = true;
```

`start_agent_run` enforces this at the database level. Load-testing or
high-volume synthetic traffic against shared production infrastructure
(even scoped to a demo workspace) can degrade the app for real firms using
it concurrently -- **never** run concurrent/parallel request floods, `explain
analyze` loops, or scripted repeated page loads faster than a real user
would plausibly click. Single, sequential, realistic measurements only. If
you want a stable timing number, take a small number of sequential samples
(e.g. 3-5) and report the median/range, not hundreds of rapid requests.

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
call carrying an admin-AI RPC. (This impersonation is only needed for the
Admin-AI RPCs themselves -- plain read-only timing queries like `explain
analyze` don't need it.)

## Step 1: start a run

```sql
select public.start_agent_run(
  p_agent_key => 'performance',
  p_workspace_id => '<a demo workspace id>',
  p_run_type => 'custom',
  p_scope => '{"objective": "<what you were asked to measure>"}'::jsonb
);
```

Keep the returned `run_id` -- every subsequent call needs it.

## Step 2: narrate progress as you go

```sql
select public.append_agent_run_event(
  p_run_id => '<run_id>',
  p_level => 'info',
  p_message => 'Measuring /clients page load (5 sequential samples) in the ERO demo workspace',
  p_meta => '{}'::jsonb
);
```

This RPC enforces the run's step budget (`ai_agent_run_budgets.max_steps`)
and raises an exception if exceeded -- stop if that fires, it's the cost cap
working as designed.

## Step 3: measure real timing, across four layers

**A. Page load (Playwright, real user-facing timing).** Use the Navigation
Timing API rather than a stopwatch around `page.goto`, and take 3-5
sequential samples (never parallel):

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  const samples = [];
  for (let i = 0; i < 5; i++) {
    await page.goto('https://<the deployed app url>/<route>', { waitUntil: 'networkidle' });
    const timing = await page.evaluate(() => JSON.stringify(performance.getEntriesByType('navigation')[0]));
    samples.push(JSON.parse(timing));
  }
  console.log(JSON.stringify(samples));
  await browser.close();
})();
"
```

(Confirm the actual deployed URL and log in as needed for authenticated
routes -- reuse whatever session/persona mechanism the QA agent skill
documents, since this hasn't diverged for performance testing.)

**B. API/RPC response time.** Time a real RPC or API route call
end-to-end (not just the DB portion) -- e.g. wrap a `supabase.rpc(...)` call
or a `curl` against an API route with real timing, again 3-5 sequential
samples. Compare against what the route/RPC actually does (read the code)
to judge whether the time is proportionate to the work, not just against an
arbitrary threshold.

**C. Database query performance.** For a page/route's actual query (read the
component/route code to get the real query, don't guess at one), run:

```sql
explain (analyze, buffers) <the actual query, with realistic demo-workspace ids substituted>;
```

Look for sequential scans on tables with more than a trivial row count,
missing indexes implied by the plan, or a query plan whose cost is wildly
disproportionate to the rows actually returned. Also check
`mcp__Supabase__get_advisors` (performance category) for the project --
it surfaces missing-index and other advisor findings directly; cross-check
anything it flags against whether the affected table/query is actually
exercised by a real page (an advisor hit on an unused table isn't a user
facing performance defect).

**D. Workflow/automation latency.** Using `automation_runs` and
`automation_execution_logs` (read-only -- this is the same data the Workflow
agent uses, but here purely for timing, not correctness):

```sql
select id, automation_id, started_at, completed_at, status,
       extract(epoch from (completed_at - started_at)) as duration_seconds
from public.automation_runs
where completed_at is not null
order by started_at desc limit 50;
```

Flag runs whose duration is unexpectedly long for what their step graph
actually does (e.g. mostly `send_email`/`add_tag`/`create_task` steps
taking minutes) -- likely stuck on a `delay`/`wait_mode` step rather than
truly "slow" (check `automation_pending_steps.scheduled_for` to tell the
difference between "waiting by design" and "actually slow").

**E. Correlate with QA/Workflow findings.** Check recent findings from the
other two agents:

```sql
select f.id, f.title, f.category, f.severity, f.affected_module, a.agent_key
from public.ai_agent_findings f join public.ai_agents a on a.id = f.agent_id
where a.agent_key in ('qa', 'workflow') and f.status in ('open', 'investigating', 'retest_required')
order by f.created_at desc limit 20;
```

If a performance finding you just made shares an `affected_module` with an
open QA or Workflow finding, link them:

```sql
select public.correlate_agent_findings(
  p_finding_id_a => '<this performance finding id>',
  p_finding_id_b => '<the QA or Workflow finding id>',
  p_relationship => 'same_root_cause',  -- free text, e.g. 'same_root_cause' | 'related'
  p_confidence => 'medium'  -- 'low' | 'medium' | 'high'
);
```

Only correlate when you have an actual reason to believe they share a root
cause (same table, same route, same automation) -- don't correlate just
because both exist.

## Step 4: capture evidence

```sql
select public.record_agent_evidence(
  p_run_id => '<run_id>',
  p_evidence_type => 'timing',  -- or 'db_error', 'network', 'log' -- see the ai_agent_evidence check constraint
  p_payload => '{"route": "/clients", "samples_ms": [820, 795, 910, 840, 780], "median_ms": 820}'::jsonb,
  p_finding_id => '<finding_id, if one exists yet>'
);
```

Never put real taxpayer data into `payload` -- only synthetic/demo data and
the timing numbers themselves.

## Step 5: record findings

```sql
select public.create_agent_finding(
  p_agent_key => 'performance',
  p_run_id => '<run_id>',
  p_workspace_id => '<workspace_id>',
  p_category => 'db_query',  -- free text: page_load | api | db_query | workflow_latency
  p_severity => 'medium',  -- critical | high | medium | low -- see rubric below
  p_title => 'Short, specific summary with the actual number',
  p_description => 'What you measured and why it matters, in plain language',
  p_fingerprint => 'performance:<route_or_query_or_automation>:<short-rule-name>',  -- stable across runs
  p_expected_behavior => 'What a reasonable target looks like, and why (cite the query plan/code)',
  p_actual_behavior => 'The actual measured numbers (median, range, sample count)',
  p_reproduction_steps => '["step 1", "step 2"]'::jsonb,
  p_affected_module => '<route, RPC, or automation name>'
);
```

**Severity rubric, performance-specific** (numbers are guidance, not a rigid
cutoff -- judge against what the page/query actually needs to do):
- `critical`: a core page or action is slow enough to functionally block
  work (multi-second waits on something used constantly, e.g. saving a
  client record), or a query plan that will visibly degrade further as data
  grows (unindexed scan on a table already at meaningful size).
- `high`: a clearly disproportionate query/page time relative to the work
  done, on a frequently-used path.
- `medium`: a real inefficiency (missing index, N+1) that hasn't yet
  produced a user-visible slowdown at current data volume.
- `low`: a minor inefficiency on a rarely-used path.

## Step 6: finish the run

```sql
select public.complete_agent_run(
  p_run_id => '<run_id>',
  p_status => 'completed',
  p_summary => '{"routes_measured": 4, "queries_analyzed": 3, "findings_created": 1}'::jsonb,
  p_ai_analysis => null,
  p_error_message => null
);
```

Use `'failed'` only if the run itself broke (couldn't reach the app, a
needed page/route didn't exist) -- finding real slow spots is success for a
performance run, not failure.

## Cleaning up synthetic data -- mandatory, every run, no exceptions

Performance runs are usually pure measurement and create nothing, but if a
test needed a synthetic record to measure against realistic conditions
(e.g. a client with many documents to test a documents-list page), delete
every row you created before calling `complete_agent_run`, in FK-dependent
order -- see `.claude/skills/verexa-qa-agent/SKILL.md` for the concrete
delete-order template. Verify zero rows remain before finishing if you did
create any.

## Reporting back

At the end, tell whoever asked for the run: what you measured (with actual
numbers), what you found (with severity), any correlations drawn to QA/
Workflow findings, and a pointer to `/platform-admin/ai-agents`. Be explicit
about anything you were asked to measure but couldn't.
