// Automations reconciliation, Phase 9: workflow-to-workflow recursion guard.
// start_workflow (execute_automation_step) starts a fully independent child
// automation_runs row and lets it run in parallel with the parent -- that's
// existing, intentional behavior this reconciliation preserves. What was
// missing: no bound on how many workflows can start each other, so
// automation A's start_workflow step starting B, whose start_workflow step
// starts A again, would recurse forever (execute_automation_step calls
// start_next_automation_step calls execute_automation_step... with no
// depth check anywhere in that chain). See
// supabase/migrations/20261101030000_workflow_chain_depth_guard.sql for the
// parent_run_id/chain_depth columns and the platform-level (not
// customer-configurable) max-depth-10 guard in execute_automation_step's
// start_workflow branch.
//
// Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and
// SUPABASE_SERVICE_ROLE_KEY in the environment, pointed at an isolated test
// project (never production). Fails loudly rather than skipping when
// they're missing, matching tests/database-contract-guard.test.ts's own
// reasoning: a silently-skipped guard is a false green in CI.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(supabaseUrl && serviceRoleKey);

function requireEnv() {
  if (!canRun) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are not set. This suite requires an isolated " +
        "Supabase test project to run against -- set both env vars (see .env.local.example) rather than letting " +
        "this skip silently."
    );
  }
}

describe("workflow-to-workflow chain depth guard", () => {
  let service: SupabaseClient;
  const cleanupWorkspaceIds: string[] = [];

  beforeAll(() => {
    requireEnv();
    service = createClient(supabaseUrl!, serviceRoleKey!);
  });

  afterAll(async () => {
    if (!canRun) return;
    if (cleanupWorkspaceIds.length > 0) {
      await service.from("workspaces").delete().in("id", cleanupWorkspaceIds);
    }
  });

  async function makeWorkspace(name: string) {
    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const slug = `${slugBase}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const { data, error } = await service.from("workspaces").insert({ name, slug }).select("id").single();
    expect(error).toBeNull();
    cleanupWorkspaceIds.push(data!.id);
    return data!.id as string;
  }

  // A published, enabled automation with a single start_workflow step
  // pointing at `targetAutomationId` (or none, for a leaf that just ends).
  async function makeAutomation(workspaceId: string, name: string, targetAutomationId: string | null) {
    const slug = `${name.toLowerCase().replace(/\s+/g, "-")}-${Math.floor(Math.random() * 1e6)}`;
    const { data: automation, error: automationError } = await service
      .from("automations")
      .insert({ workspace_id: workspaceId, name, slug, trigger_type: "lead.created", is_enabled: true, status: "published" })
      .select("id")
      .single();
    expect(automationError).toBeNull();

    if (targetAutomationId) {
      const { error: stepError } = await service.from("automation_steps").insert({
        automation_id: automation!.id,
        display_order: 1,
        action_type: "start_workflow",
        action_config: { automation_id: targetAutomationId },
      });
      expect(stepError).toBeNull();
    } else {
      const { error: stepError } = await service.from("automation_steps").insert({
        automation_id: automation!.id,
        display_order: 1,
        action_type: "end_workflow",
        action_config: {},
      });
      expect(stepError).toBeNull();
    }

    return automation!.id as string;
  }

  async function startRun(automationId: string, workspaceId: string) {
    const { data: run, error } = await service
      .from("automation_runs")
      .insert({ workspace_id: workspaceId, automation_id: automationId, status: "running", trigger_snapshot: {} })
      .select("id")
      .single();
    expect(error).toBeNull();
    const { error: startError } = await service.rpc("start_next_automation_step", { p_run_id: run!.id });
    expect(startError).toBeNull();
    return run!.id as string;
  }

  it("A -> B: records parent_run_id and chain_depth on the child run", async () => {
    const workspaceId = await makeWorkspace("Chain A-B Test");
    const automationB = await makeAutomation(workspaceId, "Leaf B", null);
    const automationA = await makeAutomation(workspaceId, "Root A", automationB);

    const runA = await startRun(automationA, workspaceId);

    const { data: runs, error } = await service
      .from("automation_runs")
      .select("id, automation_id, parent_run_id, chain_depth")
      .eq("workspace_id", workspaceId)
      .order("chain_depth", { ascending: true });
    expect(error).toBeNull();
    expect(runs).toHaveLength(2);

    const rootRun = runs!.find((r) => r.id === runA)!;
    const childRun = runs!.find((r) => r.id !== runA)!;
    expect(rootRun.parent_run_id).toBeNull();
    expect(rootRun.chain_depth).toBe(0);
    expect(childRun.parent_run_id).toBe(runA);
    expect(childRun.chain_depth).toBe(1);
    expect(childRun.automation_id).toBe(automationB);
  });

  it("A -> B -> A: stops at the platform depth cap instead of recursing forever", async () => {
    const workspaceId = await makeWorkspace("Chain Loop Test");

    // Create A and B pointing at each other's (not-yet-known) id by creating
    // both first with no step, then adding the start_workflow steps once
    // both ids exist.
    const automationA = await makeAutomation(workspaceId, "Loop A", null);
    const automationB = await makeAutomation(workspaceId, "Loop B", automationA);

    // Replace A's leaf end_workflow step with a start_workflow -> B step,
    // completing the A <-> B cycle.
    await service.from("automation_steps").delete().eq("automation_id", automationA);
    await service.from("automation_steps").insert({
      automation_id: automationA,
      display_order: 1,
      action_type: "start_workflow",
      action_config: { automation_id: automationB },
    });

    const runA = await startRun(automationA, workspaceId);

    const { data: runs, error } = await service.from("automation_runs").select("id, status, chain_depth").eq("workspace_id", workspaceId);
    expect(error).toBeNull();

    // The chain must have actually stopped -- not run away indefinitely --
    // and none of the runs it did create should exceed the platform cap.
    expect(runs!.length).toBeGreaterThan(1);
    expect(runs!.length).toBeLessThan(50);
    for (const run of runs!) {
      expect(run.chain_depth).toBeLessThanOrEqual(10);
    }

    // The run at the cap must have failed via the depth-guard exception,
    // not succeeded silently.
    const deepestRun = runs!.reduce((a, b) => (a.chain_depth > b.chain_depth ? a : b));
    if (deepestRun.chain_depth === 10) {
      const { data: logs } = await service
        .from("automation_execution_logs")
        .select("status, error_message")
        .eq("execution_data->>run_id", deepestRun.id);
      expect(logs?.some((l) => l.status === "failed" && l.error_message?.includes("platform maximum"))).toBe(true);
    }

    expect(runA).toBeTruthy();
  });

  it("cross-workspace start_workflow is impossible: the target automation lookup is workspace-scoped", async () => {
    const workspaceOneId = await makeWorkspace("Chain Cross WS 1");
    const workspaceTwoId = await makeWorkspace("Chain Cross WS 2");
    const targetInWorkspaceTwo = await makeAutomation(workspaceTwoId, "Other Workspace Target", null);
    const automationInWorkspaceOne = await makeAutomation(workspaceOneId, "Cross WS Root", targetInWorkspaceTwo);

    const runId = await startRun(automationInWorkspaceOne, workspaceOneId);

    const { data: logs, error } = await service
      .from("automation_execution_logs")
      .select("status, error_message")
      .eq("execution_data->>run_id", runId);
    expect(error).toBeNull();
    expect(logs?.some((l) => l.status === "failed" && l.error_message?.includes("not available to start"))).toBe(true);

    const { data: childRuns } = await service.from("automation_runs").select("id").eq("automation_id", targetInWorkspaceTwo);
    expect(childRuns).toHaveLength(0);
  });
});
