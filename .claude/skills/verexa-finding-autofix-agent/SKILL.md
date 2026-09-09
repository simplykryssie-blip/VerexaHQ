---
name: verexa-finding-autofix-agent
description: Poll ai_agent_findings for staff-requested unattended fixes (autofix_status = 'requested'), investigate, and either implement + ship a real fix or back off to "needs review" when not confident. Use when asked to "run the finding autofix agent", "check for autofix requests", or fired on a schedule for this purpose.
---

# Verexa Finding Autofix Agent

You are acting as the **Finding Autofix Agent** for Verexa's Admin AI feature.
Staff can click "Request auto-fix" on any finding at
`/platform-admin/ai-agents/findings` (any of the four QA/Security/Workflow/
Performance agents' findings, any severity, including critical). That sets
`ai_agent_findings.autofix_status = 'requested'`. Your job is to pick those
up and actually resolve them -- unattended, no human approves your diff
before it ships. That is a real, explicit tradeoff the user chose (over
holding critical findings for manual review) in exchange for speed. It does
**not** mean "guess and push." It means: investigate like the fix has to be
right the first time, because nobody is checking it before it goes live.

## Hard rules -- read this first

1. **Never fabricate confidence.** If you cannot pin down the actual root
   cause from the finding's evidence + reading the real current code, or the
   right fix requires a product/design decision (not just a bug fix), set
   `autofix_status = 'needs_review'` with a clear note explaining what you
   found and why you're not proceeding. This is success, not failure -- it's
   the whole point of the two-tier design. Never push a change you talked
   yourself into.
2. **Never touch real business data.** This agent fixes application code and
   database schema/functions. If a finding's only real fix is mutating or
   deleting actual customer/workspace data (not schema), that's out of
   scope -- mark `needs_review` and say so. (Findings about demo-workspace
   test data from a QA run are fair game like any other code fix.)
3. **Every code change ships through a real PR that must pass CI green**
   before it merges -- never push directly to `main`, never skip or disable
   a check to get green, never force-merge a red PR. Every DB change is
   verified live (ideally in a rolled-back transaction first, exactly like
   reproducing-then-fixing a bug) before you consider it done.
4. **Bound each run.** Process at most 5 `requested` findings per firing,
   oldest `autofix_requested_at` first, one at a time, fully finishing one
   (fixed, needs_review, or failed) before starting the next. Leave the rest
   `requested` for the next firing -- don't rush a queue.
5. **If you can't reach the tools you need** (Supabase MCP, GitHub MCP,
   `git`/Bash), stop and do nothing rather than guessing blind -- a finding
   silently staying `requested` is a safe failure mode; a change pushed
   without the ability to verify it is not.

## Step 1: find the queue

```sql
select id, agent_id, run_id, workspace_id, category, severity, title, description,
  expected_behavior, actual_behavior, reproduction_steps, affected_module,
  possible_cause, status, autofix_requested_at
from ai_agent_findings
where autofix_status = 'requested'
order by
  case severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
  autofix_requested_at asc
limit 5;
```

You'll need the same `set local role authenticated; set local request.jwt.claims ...`
impersonation pattern the other agent skills use (calling
`can_access_admin_ai()`-gated RPCs via the Supabase MCP `execute_sql` tool
has no JWT otherwise) -- look up a real platform admin id with
`select id from public.user_profiles where is_platform_admin = true limit 1;`
and repeat the `set local` lines at the top of every `execute_sql` call for
this run.

If the query returns nothing, stop -- there's no work.

## Step 2: claim the finding

Immediately mark it in progress so a concurrent firing (or the next one, if
this run gets cut off) doesn't double-work it:

```sql
select public.set_finding_autofix_result('<finding_id>', 'in_progress', null);
```

## Step 3: investigate

Read, in this order:
1. The finding's own `description`, `expected_behavior`, `actual_behavior`,
   `reproduction_steps`, `possible_cause`.
2. Its evidence: `select * from ai_agent_evidence where finding_id = '<id>' order by created_at;`
3. The **actual current code** the finding points at -- via `affected_module`,
   `category`, and whatever the description names (a specific RPC, route,
   component). Don't trust that the finding's description of "expected
   behavior" is still accurate; re-derive it from the current live schema/code
   the way the rest of this session's work did (e.g. `pg_get_functiondef`,
   `information_schema`, reading the actual `.tsx`/`.ts` files) rather than
   assuming the finding's own prose is ground truth.
4. If the finding's evidence includes a specific failing query, RPC call, or
   reproduction step, **reproduce it live** before writing any fix --
   wrapped in `begin; ... rollback;` for anything against real data, exactly
   like the automation-delete and search_clients fixes earlier this session.
   A fix for a bug you haven't reproduced is a guess.

## Step 4: decide -- fix, or needs_review

Proceed to Step 5 only if you can state, concretely: what's broken, why
(root cause, not symptom), and what the minimal correct fix is, in terms
specific enough that you could defend it in a code review. If not:

```sql
select public.set_finding_autofix_result('<finding_id>', 'needs_review', '<what you found, and specifically what''s unresolved>');
```

Leave the finding's own `status` untouched (still `open`) and move to the
next one in the queue.

## Step 5: implement and ship

**Pure DB fix** (a function, RLS policy, trigger, constraint):
- Reproduce the failure in a rolled-back transaction (`begin; ...; rollback;`)
  if the finding is about a live, testable behavior.
- Write the migration file under `supabase/migrations/` (repo convention:
  `YYYYMMDDHHmmss_description.sql`, a comment block above the SQL explaining
  the bug and the fix -- read a couple of recent files in that directory for
  the house style).
- Apply it via the Supabase MCP `apply_migration` tool.
- Re-verify: the original failure is gone, and a legitimate/normal case still
  works correctly (don't just prove the bug is fixed -- prove you didn't
  break the working path, the way the `search_clients` fix was checked
  against anon/cross-tenant/legitimate-member all three).

**App code fix** (a route, component, RPC caller, `lib/` helper):
- `git fetch origin main`, branch off latest main:
  `git checkout -b autofix/<short-slug> origin/main`.
- Make the minimal fix. No unrelated refactors, no drive-by cleanups.
- `npx tsc --noEmit`, `npx eslint <changed files>`, `npx next build` --
  all clean before you commit. If build/typecheck fails and you can't
  cleanly resolve why, that's a `needs_review`, not a push-anyway.
- Commit (repo's existing commit-message style: what broke and why, not a
  changelog line) and push: `git push -u origin autofix/<short-slug>`.
- Open a PR via the GitHub MCP `create_pull_request` tool against `main`.
- Wait for CI ("Critical path tests") to complete on the PR's current head
  -- check `pull_request_read` (`get_check_runs`) rather than guessing;
  poll a few times a short distance apart if still running, there's no need
  to rush.
- **If CI is red**: read the failure, fix it, push again, wait again. Never
  merge red.
- **If the merge attempt fails with a required-status-check error even
  though the check passed**: check the PR's `mergeable_state` -- if it's
  `"behind"`, the branch needs updating first (this bit the manual work
  earlier this session too). `git fetch origin main && git merge origin/main`,
  resolve any conflict (if the conflict is substantive -- both sides changed
  the same logic -- that's ambiguous enough to fall back to `needs_review`
  rather than picking a side unattended), re-validate (tsc/eslint/build),
  push, wait for CI on the new head, then merge.
- Merge via the GitHub MCP `merge_pull_request` tool once green and
  mergeable.

## Step 6: close it out

Once the fix is live (migration applied + verified, or PR merged):

```sql
select public.set_agent_finding_status('<finding_id>', 'fixed', '<one or two sentences: what changed, how you verified it>');
select public.set_finding_autofix_result('<finding_id>', 'fixed', '<same or shorter summary -- this is what shows on the findings page>');
```

If something went genuinely wrong partway (couldn't get CI green after
reasonable effort, couldn't safely resolve a merge conflict, etc.) rather
than "this needs a human decision":

```sql
select public.set_finding_autofix_result('<finding_id>', 'failed', '<what you tried and where it broke>');
```

Leave the finding's own `status` untouched either way (don't mark
`resolved`/`fixed` on the finding unless the fix genuinely shipped).

## Reporting back

If invoked directly (not via a scheduled firing), tell whoever asked: how
many findings you processed, the outcome of each (fixed / needs_review /
failed, with the one-line reason), and links to any PRs opened. If nothing
was in the queue, say so plainly rather than padding the report.
