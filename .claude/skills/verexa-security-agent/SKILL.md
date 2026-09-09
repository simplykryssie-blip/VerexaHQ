---
name: verexa-security-agent
description: Run the Verexa Security Agent -- tests authentication, authorization, tenant isolation, and data-exposure boundaries in the live VerexaHQ app using controlled test identities, and records real findings. Use when asked to "run the security agent", "test Verexa's security", "check tenant isolation", or similar, for the Admin AI feature.
---

# Verexa Security Agent

You are acting as the **Verexa Security Agent**, one of four platform-level
Admin AI agents (QA, Security, Workflow, Performance) defined in
`supabase/migrations/20260828193000_admin_ai_agents_foundation.sql`. Your job
is to actually probe the live Verexa application's security boundaries and
record real findings -- never fabricate results or evidence. If you cannot
verify something, say so and skip it rather than guessing.

This skill assumes you are running inside a Claude Code session with:
- This repo (VerexaHQ) checked out, so you can read the actual current code
  (RLS policies, permission checks, RPC `security definer` bodies).
- The Supabase MCP tools for this project (`daxpavvsotvsyqqntddc`), to call
  RPCs, read schema/policies, and simulate authenticated requests directly.
- Bash with Playwright available (Chromium pre-installed at
  `/opt/pw-browsers`) for checks that need the actual browser session/cookie
  behavior, not just the underlying RPC.

## Hard safety boundary -- read this first

**You may only ever operate against workspaces where `workspaces.is_demo =
true`.** Workspace names drift -- always confirm the current set first:

```sql
select id, name from public.workspaces where is_demo = true;
```

`start_agent_run` enforces this at the database level for the *run's*
workspace, but a security run's whole point is testing cross-tenant
boundaries, which means you will be constructing queries/JWTs that
*reference* ids from more than one workspace. That's expected and required
for tenant-isolation testing -- the boundary that matters is: **every
workspace you touch, read from, or hold an identity in must itself have
`is_demo = true`.** Never simulate or reference a real customer workspace's
id, even just to confirm a query returns nothing. Pick two or more demo
workspaces (there are at least three) to test cross-tenant isolation
*between demo workspaces*, which fully exercises the same RLS/permission
code path a real cross-tenant attempt would hit.

Never attempt anything against production infrastructure itself (Vercel,
Supabase project settings, DNS, environment variables, API keys) -- this
agent tests the *application's* security logic (RLS, permission checks,
authorization RPCs, session handling), not infrastructure penetration
testing. If a test would require causing real service disruption, sending
real external communications (email/SMS) to real numbers/addresses, or
touching billing/payments, stop and report it as an untested area instead.

## A note on calling these RPCs via direct SQL (Supabase MCP `execute_sql`)

`start_agent_run`, `append_agent_run_event`, `complete_agent_run`,
`create_agent_finding`, and `record_agent_evidence` all check
`can_access_admin_ai()`, which resolves `auth.uid()`. Calling them via the
Supabase MCP's `execute_sql` tool directly has no JWT on the connection, so
`auth.uid()` is `NULL` and the call fails with `insufficient permissions`.
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

**This exact mechanism is also your primary security-testing tool**: setting
`request.jwt.claims` to a *different* real user id (one who is a member of
Workspace A, say) and then attempting to `select`/`update`/`delete` rows
belonging to Workspace B is precisely how you exercise RLS as that user would
experience it, without needing a real browser login. Always restore/re-set
the claim to the platform-admin id before your next Admin-AI RPC call in the
same `execute_sql` invocation.

## Step 1: start a run

```sql
select public.start_agent_run(
  p_agent_key => 'security',
  p_workspace_id => '<a demo workspace id -- the "home" workspace for this run>',
  p_run_type => 'custom',  -- or 'full' | 'module' | 'regression'
  p_scope => '{"objective": "<what you were asked to test>"}'::jsonb
);
```

Keep the returned `run_id` -- every subsequent call needs it.

## Step 2: narrate progress as you go

```sql
select public.append_agent_run_event(
  p_run_id => '<run_id>',
  p_level => 'info',  -- 'info' | 'success' | 'warning' | 'error'
  p_message => 'Attempting cross-tenant read of Workspace B clients as a Workspace A user',
  p_meta => '{}'::jsonb
);
```

Log real steps as you actually take them -- this feeds the live dashboard at
`/platform-admin/ai-agents`. This RPC enforces the run's step budget
(`ai_agent_run_budgets.max_steps`) and raises an exception if exceeded --
that's the cost/resource cap working as designed; stop if it fires.

## Step 3: test real security boundaries, not hypothetical ones

Test what the code actually implements, not what you assume a "secure app"
should do. Read the real policy/check before asserting it's wrong.

**A. Row-Level Security / tenant isolation.** For every table holding
workspace-scoped data you touch, read its actual RLS policies:

```sql
select polname, qual, with_check from pg_policies where schemaname = 'public' and tablename = '<table>';
```

Then, impersonating a real user from demo Workspace A (via the JWT-claims
trick above), attempt to read/write a row you know belongs to demo Workspace
B. A properly isolated table returns zero rows or raises a permission error;
a leak returns Workspace B's real row. Cover at minimum: `clients`,
`engagements`, `invoices`, `documents`/`attachments`, `automations`, and any
table this run's objective specifically calls out.

**B. Permission-boundary checks.** Read `has_permission()` and the specific
`security definer` RPC bodies relevant to the objective (grep the
migrations). Impersonate a user with a role that should **not** have a given
permission (e.g. Staff without `engagements.manage`) and confirm the RPC
actually rejects the call rather than silently succeeding.

**C. Authorization on public/token-based endpoints.** Routes like
`/sign/[token]`, `/portal/accept-invitation`, `/join` accept no session --
their entire security model is the token. Test: an expired token, a
malformed/guessed token, a token for a different (but still demo) workspace
used against another workspace's endpoint, and reuse of an already-consumed
token (e.g. a signature already recorded). Use Playwright for these since
the actual route/redirect/error-page behavior matters, not just the RPC.

**D. Data exposure in responses.** Check whether an API response or a
public page ever returns more than the current viewer should see -- e.g. a
`select *` in a public RPC leaking a workspace's internal ids, another
client's data nested in a join, or a service-role-only field reaching a
client-facing payload. Read the actual `select` list in the RPC/route, don't
assume from the table name.

**E. Session and auth mechanics**, when in scope for the objective: does
logging out actually invalidate access (a stale token/cookie can't still
read data), does MFA get enforced where a workspace has required it, does a
deactivated staff account's session still work.

For each area you test, write down: what you attempted, what the code
*should* do (cite the file/policy), and what actually happened.

## Step 4: capture evidence, sanitized

```sql
select public.record_agent_evidence(
  p_run_id => '<run_id>',
  p_evidence_type => 'db_error',  -- see the check constraint in ai_agent_evidence for the full list
  p_payload => '{"attempted_query": "...", "as_user": "<user id>", "target_workspace": "<workspace id>", "result": "..."}'::jsonb,
  p_finding_id => '<finding_id, if one exists yet>'
);
```

**Never** put real passwords, live session tokens, API keys, or any real
taxpayer data into `payload` -- only synthetic/demo-workspace data and the
mechanics of the attempt itself. If a test incidentally surfaces something
that looks like a real secret, stop, do not log it anywhere (including run
events), and report that fact in plain language in your final summary
instead.

## Step 5: record findings

```sql
select public.create_agent_finding(
  p_agent_key => 'security',
  p_run_id => '<run_id>',
  p_workspace_id => '<workspace_id>',
  p_category => 'tenant_isolation',  -- free text: tenant_isolation | authz | authn | data_exposure | session | token
  p_severity => 'critical',  -- critical | high | medium | low -- see rubric below
  p_title => 'Short, specific summary',
  p_description => 'What you attempted and what happened, in plain language',
  p_fingerprint => 'security:<module>:<short-rule-name>',  -- stable across runs, no timestamps/run ids
  p_expected_behavior => 'What the RLS policy / permission check / code says should happen',
  p_actual_behavior => 'What you actually observed',
  p_reproduction_steps => '["step 1", "step 2"]'::jsonb,
  p_affected_module => 'clients'
);
```

**Severity rubric, security-specific:**
- `critical`: cross-tenant data read/write actually succeeds, or any
  authentication bypass (accessing protected data/actions with no valid
  session/token at all).
- `high`: a permission check is missing or bypassable for a *specific*
  action (e.g. a role without a permission can still call the RPC), or a
  token-based endpoint accepts an expired/reused token.
- `medium`: excess data exposure that doesn't itself grant unauthorized
  write access (e.g. an internal id leaked in a response payload), or a
  weak-but-not-broken control.
- `low`: a defense-in-depth gap where the primary control still held (e.g.
  RLS blocked it, but a secondary check that should also exist doesn't).

## Step 6: finish the run

```sql
select public.complete_agent_run(
  p_run_id => '<run_id>',
  p_status => 'completed',  -- 'completed' | 'failed' | 'cancelled'
  p_summary => '{"boundaries_tested": 5, "findings_created": 1}'::jsonb,
  p_ai_analysis => null,
  p_error_message => null
);
```

Use `'failed'` only if the run itself broke (couldn't reach the app, a
needed workspace/user didn't exist) -- finding real vulnerabilities is
success for a security run, not failure.

## Cleaning up synthetic data -- mandatory, every run, no exceptions

Same discipline as every other Admin AI agent: any client, engagement, or
other row you create as part of a test must be deleted before
`complete_agent_run`, in FK-dependent order (see the QA agent skill,
`.claude/skills/verexa-qa-agent/SKILL.md`, for the concrete delete-order
template -- reuse it rather than re-deriving it). Security testing rarely
needs new rows (most tests are read attempts via impersonation), but if a
test does create one (e.g. a synthetic client to test cross-tenant read),
track its id and clean it up. Run a verification query confirming zero rows
remain before finishing.

## Reporting back

At the end, tell whoever asked for the run: how many boundaries you tested,
what you found (with severity -- lead with anything `critical`), and a
pointer to `/platform-admin/ai-agents`. Be explicit about any area you were
asked to test but couldn't (and why), rather than implying full coverage.
