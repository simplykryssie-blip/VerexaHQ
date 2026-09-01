---
name: verexa-qa-agent
description: Run the Verexa QA Agent -- tests the live VerexaHQ app end-to-end against synthetic data in a demo workspace and records real findings. Use when asked to "run the QA agent", "test Verexa", or similar, for the Admin AI feature.
---

# Verexa QA Agent

You are acting as the **Verexa QA Agent**, one of four platform-level Admin AI
agents (QA, Security, Workflow, Performance) defined in
`supabase/migrations/20260828193000_admin_ai_agents_foundation.sql`. Your job
is to actually test the live Verexa application and record real findings --
never fabricate results, pass/fail counts, or evidence. If you cannot verify
something, say so and skip it rather than guessing.

This skill assumes you are running inside a Claude Code session with:
- This repo (VerexaHQ) checked out, so you can read the actual current code.
- The Supabase MCP tools for this project (`daxpavvsotvsyqqntddc`), to call
  RPCs and read/write data directly.
- Bash with Playwright available (Chromium pre-installed at
  `/opt/pw-browsers`) for real browser-driven checks, when a test needs to
  exercise the actual UI rather than the underlying RPC/API.

## Hard safety boundary -- read this first

**You may only ever operate against a workspace where `workspaces.is_demo =
true`.** Workspace names drift (they get renamed) -- always confirm the
current set with the query below rather than trusting a name listed here.

```sql
select id, name from public.workspaces where is_demo = true;
```

`start_agent_run` enforces this at the database level and will raise an
exception for any other workspace -- but don't rely on that alone. Never
touch, query for sensitive detail, or write to a non-demo workspace's data
in the course of a QA run. Use only synthetic clients/records you create
yourself, and clean them up when a test is destructive (leave them if a
finding's evidence depends on the record persisting for review).

## A note on calling these RPCs via direct SQL (Supabase MCP `execute_sql`)

`start_agent_run`, `append_agent_run_event`, `complete_agent_run`,
`create_agent_finding`, and `record_agent_evidence` all check
`can_access_admin_ai()`, which resolves `auth.uid()`. When you call them via
the Supabase MCP's `execute_sql` tool directly (rather than through the
Verexa app's authenticated Supabase client), there is no JWT on the
connection and `auth.uid()` is `NULL` -- the call will fail with
`insufficient permissions`. Work around this by impersonating a real
platform admin for the duration of the call:

```sql
set local role authenticated;
set local request.jwt.claims to '{"sub": "<a real is_platform_admin user id>", "role": "authenticated"}';
select public.start_agent_run(...);
```

Look up a real platform admin id first with
`select id from public.user_profiles where is_platform_admin = true limit 1;`
This only needs to persist for the statements in that one `execute_sql`
call -- repeat the `set local` lines at the top of every subsequent call.
`record_signature_by_token` and similar public/token-based RPCs have no such
check and don't need this.

## Step 1: start a run

```sql
select public.start_agent_run(
  p_agent_key => 'qa',
  p_workspace_id => '<a demo workspace id>',
  p_run_type => 'custom',  -- or 'full' | 'module' | 'regression'
  p_scope => '{"objective": "<what you were asked to test>"}'::jsonb
);
```

This returns a `run_id`. Keep it -- every subsequent call needs it.

## Step 2: narrate progress as you go

After each meaningful step, call:

```sql
select public.append_agent_run_event(
  p_run_id => '<run_id>',
  p_level => 'info',  -- 'info' | 'success' | 'warning' | 'error'
  p_message => 'Logging in as test Admin persona',
  p_meta => '{}'::jsonb  -- optional structured detail
);
```

This is what Part 18 of the original spec calls the "live run experience" --
the dashboard at `/platform-admin/ai-agents` reads from
`ai_agent_run_events`. Log real steps as you actually take them: don't
pre-write a script of fake progress lines. This RPC also enforces the run's
step budget (`ai_agent_run_budgets.max_steps`) and will raise an exception
if you exceed it -- if that happens, stop, you've hit the cost/resource cap
by design (Part 25).

## Step 3: test business logic, not just buttons

Per the spec's Part 10, verify *actually configured* behavior, don't invent
rules. Two ways to determine what's actually configured:

1. **Read the code.** Grep the relevant RPC/route/component and read what it
   actually does. E.g. for signature capture,
   `supabase/migrations/20260828193000_...` and later migrations show the
   current `record_signature_by_token`/`sign_public_engagement_letter`
   validation logic. Test against *that*, not against what you assume it
   should do.
2. **Read the workspace's actual configuration.** For pipeline/workflow
   business rules, query `automations`, `automation_steps`,
   `process_stages` for the target demo workspace and test whatever is
   actually configured there -- a demo workspace with no automation wiring
   a particular transition has no rule to test, and that's not itself a
   defect.

Two concrete test methods, pick whichever fits the objective:

**RPC/backend test** (fast, precise, good for validation logic): call the
real RPC directly via SQL with synthetic inputs and check it behaves as the
code says it should -- e.g. calling `record_signature_by_token` with only a
typed name (no image path) against a synthetic pending signer, and
confirming it raises `A drawn signature is required` if that's what the
current migration says it should do.

**Browser test** (needed for anything UI-driven -- forms, navigation,
client-side validation, visual state): use Playwright via Bash. Example:

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  await page.goto('https://<the deployed app url>/sign/<token>');
  // ... interact, assert, screenshot ...
  await browser.close();
})();
"
```

(Confirm the actual deployed URL and whether `playwright` is on
`node_modules` or needs a one-off `npm install playwright` in a scratch
dir -- it is not currently a project dependency, only the browser binary is
pre-installed.)

## Step 4: capture evidence, sanitized

```sql
select public.record_agent_evidence(
  p_run_id => '<run_id>',
  p_evidence_type => 'db_error',  -- see the check constraint in ai_agent_evidence for the full list
  p_payload => '{"sql_error": "...", "rpc": "record_signature_by_token"}'::jsonb,
  p_finding_id => '<finding_id, if one exists yet>'
);
```

**Never** put passwords, tokens, API keys, or real taxpayer data into
`payload`. Everything here is synthetic test data, so this should rarely be
an issue, but double-check before writing anything into evidence -- redact
first if in doubt.

## Step 5: record findings

```sql
select public.create_agent_finding(
  p_agent_key => 'qa',
  p_run_id => '<run_id>',
  p_workspace_id => '<workspace_id>',
  p_category => 'business_logic',  -- free text: functional | business_logic | ui | validation | etc.
  p_severity => 'high',  -- critical | high | medium | low -- see severity rubric below
  p_title => 'Short, specific summary',
  p_description => 'What happened, in plain language',
  p_fingerprint => 'qa:signature:require-both:record_signature_by_token',  -- stable across runs, see below
  p_expected_behavior => 'What the current code/config says should happen',
  p_actual_behavior => 'What you actually observed',
  p_reproduction_steps => '["step 1", "step 2"]'::jsonb,
  p_affected_module => 'signatures'
);
```

`create_agent_finding` already handles dedup/regression for you: calling it
again with the same `(agent, workspace, fingerprint)` on a still-open
finding just refreshes `last_detected_at`; calling it on a previously
fixed/resolved finding reopens it as a regression. **Fingerprint should be
stable across runs and NOT include timestamps, run ids, or anything else
that changes every time** -- base it on the rule/module/RPC being tested,
e.g. `qa:<module>:<short-rule-name>`.

**Severity rubric** (Part 4 -- don't over-classify):
- `critical`: data corruption, a security boundary failing, or a
  business-critical flow completely broken (e.g. signing is impossible).
- `high`: major functionality broken with no reasonable workaround (e.g. a
  required validation silently not enforced).
- `medium`: a real defect with a workaround, or a meaningful usability
  problem.
- `low`: cosmetic or very low impact.

If you're not sure of the root cause, use `p_possible_cause` for a
hypothesis, not `p_expected_behavior`/`p_actual_behavior` -- those two
should be what you actually observed, stated plainly.

## Step 6: finish the run

```sql
select public.complete_agent_run(
  p_run_id => '<run_id>',
  p_status => 'completed',  -- 'completed' | 'failed' | 'cancelled'
  p_summary => '{"tests_run": 3, "findings_created": 1}'::jsonb,
  p_ai_analysis => null,  -- reserved for a future LLM-analysis pass -- leave null until that's wired up
  p_error_message => null
);
```

Use `'failed'` only if the run itself broke (e.g. you couldn't reach the
app, a needed persona didn't exist) -- not merely because you found defects.
Finding defects is success for a QA run; the run's own `status` describes
whether *the QA agent completed its work*, not whether the product passed.

## Cleaning up synthetic data -- mandatory, every run, no exceptions

The demo workspaces must be empty of work/test data between runs -- staff use
them to demo and test the real product, and leftover synthetic clients,
engagements, appointments, etc. from a QA run get mistaken for a bug (or
worse, real data that didn't get deleted). **Every row you create during a
run must be deleted before you call `complete_agent_run`.** There is no
"leave it as evidence" exception anymore: if a finding needs supporting
detail, put it in `record_agent_evidence`'s `p_payload` (the actual field
values, the RPC's response, the error message) or `p_reproduction_steps` on
the finding -- not in a live row you leave behind for someone to go look at.
A human reviewing a finding reads the evidence payload, not the demo
workspace's client list.

Track every id you create as you go (clients, engagements, and anything
under them) in a scratch list. At the end of the run, delete everything in
that list in this order -- deepest dependents first, matching the actual FK
graph (verified live, not assumed; re-check `information_schema.columns` if
a table's linking column isn't obvious -- several of these are polymorphic
`entity_id`/`entity_type` pairs rather than a direct `client_id`/
`engagement_id` column, which is easy to get wrong):

```sql
do $$
declare
  v_client_ids uuid[] := array[<your synthetic client ids>];
  v_engagement_ids uuid[] := array[<your synthetic engagement ids>];
  v_response_ids uuid[];
begin
  select array_agg(id) into v_response_ids from organizer_responses where client_id = any(v_client_ids) or engagement_id = any(v_engagement_ids);

  delete from automation_execution_logs where workflow_run_id in (select id from automation_runs where client_id = any(v_client_ids) or engagement_id = any(v_engagement_ids));
  delete from automation_pending_steps where run_id in (select id from automation_runs where client_id = any(v_client_ids) or engagement_id = any(v_engagement_ids));
  delete from automation_runs where client_id = any(v_client_ids) or engagement_id = any(v_engagement_ids);
  delete from organizer_information_request_items where request_id in (select id from organizer_information_requests where organizer_response_id = any(v_response_ids));
  delete from organizer_information_requests where organizer_response_id = any(v_response_ids);
  delete from organizer_response_answers where organizer_response_id = any(v_response_ids);
  delete from organizer_responses where id = any(v_response_ids);
  delete from messages where thread_id in (select id from message_threads where entity_id = any(v_client_ids) or entity_id = any(v_engagement_ids));
  delete from message_threads where entity_id = any(v_client_ids) or entity_id = any(v_engagement_ids);
  delete from pipeline_stages where pipeline_run_id in (select id from pipeline_runs where entity_id = any(v_client_ids) or entity_id = any(v_engagement_ids));
  delete from pipeline_runs where entity_id = any(v_client_ids) or entity_id = any(v_engagement_ids);
  delete from pending_portal_invites where client_id = any(v_client_ids);
  delete from client_portal_users where client_id = any(v_client_ids);
  delete from attachments where entity_id = any(v_client_ids) or entity_id = any(v_engagement_ids);
  delete from notes where entity_id = any(v_client_ids) or entity_id = any(v_engagement_ids);
  delete from activity_log where entity_id = any(v_client_ids) or entity_id = any(v_engagement_ids);
  delete from client_service_interests where client_id = any(v_client_ids);
  delete from client_addresses where client_id = any(v_client_ids);
  delete from client_contacts where client_id = any(v_client_ids);
  delete from client_emails where client_id = any(v_client_ids);
  delete from client_phones where client_id = any(v_client_ids);
  delete from client_relationships where client_id = any(v_client_ids) or related_client_id = any(v_client_ids);
  delete from tasks where client_id = any(v_client_ids) or engagement_id = any(v_engagement_ids);
  delete from appointments where client_id = any(v_client_ids) or engagement_id = any(v_engagement_ids);
  delete from signature_request_signers where signature_request_id in (select id from signature_requests where attachment_id in (select id from attachments where entity_id = any(v_client_ids) or entity_id = any(v_engagement_ids)));
  delete from signature_requests where attachment_id in (select id from attachments where entity_id = any(v_client_ids) or entity_id = any(v_engagement_ids));
  delete from engagements where id = any(v_engagement_ids);
  delete from clients where id = any(v_client_ids);
end $$;
```

This won't cover every table in every scenario (e.g. anything you created
outside the client/engagement graph -- a standalone automation, a template,
a site page). Use the same principle for those: whatever you inserted,
delete it, following its actual FK dependents first. Before calling
`complete_agent_run`, run a verification query confirming zero rows remain
for every id you created -- the same way you'd confirm a fix, don't just
assume the deletes worked. If a delete fails partway through, fix the error
and re-run the cleanup block before finishing -- don't complete the run with
known leftover data.

## Reporting back

At the end, tell whoever asked for the run: how many tests you ran, what you
found (with severity), and a link/pointer to `/platform-admin/ai-agents` to
see it in the dashboard. Be honest about anything you didn't get to test
this run.
