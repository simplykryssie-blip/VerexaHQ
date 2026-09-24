// Automations reconciliation, Phase 6 (continued): missing triggers.
// task.assigned, task.reassigned, invoice.created, payment.failed were all
// confirmed genuinely missing (no equivalent existed under another name --
// see supabase/migrations/20261101060000_automation_missing_triggers.sql for
// the full inventory this was based on). document.reviewed/approved/rejected
// were deliberately NOT added -- no document-review-decision concept exists
// anywhere in the schema to fire them from.
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
// environment, pointed at an isolated test project (never production).
// Fails loudly rather than skipping when they're missing, matching
// tests/database-contract-guard.test.ts's own reasoning.
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

describe("automation missing-trigger wire-up", () => {
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
    const slug = `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const { data, error } = await service.from("workspaces").insert({ name, slug }).select("id").single();
    expect(error).toBeNull();
    cleanupWorkspaceIds.push(data!.id);
    return data!.id as string;
  }

  async function makeAutomation(workspaceId: string, triggerType: string) {
    const slug = `${triggerType.replace(/\./g, "-")}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const { data, error } = await service
      .from("automations")
      .insert({ workspace_id: workspaceId, name: slug, slug, trigger_type: triggerType, is_enabled: true, status: "published" })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data!.id as string;
  }

  async function makeClient(workspaceId: string) {
    const { data, error } = await service
      .from("clients")
      .insert({ workspace_id: workspaceId, first_name: "Test", last_name: "Client", client_type: "individual", lifecycle_status: "active" })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data!.id as string;
  }

  async function runCountFor(automationId: string) {
    const { data, error } = await service.from("automation_runs").select("id").eq("automation_id", automationId);
    expect(error).toBeNull();
    return data?.length ?? 0;
  }

  it("task.assigned fires the first time a task gets an assignee; task.reassigned fires on a change of assignee", async () => {
    const workspaceId = await makeWorkspace("Task Assign Trigger Test");
    const clientId = await makeClient(workspaceId);
    const assignedAutomation = await makeAutomation(workspaceId, "task.assigned");
    const reassignedAutomation = await makeAutomation(workspaceId, "task.reassigned");

    const { data: task, error: taskError } = await service
      .from("tasks")
      .insert({ workspace_id: workspaceId, client_id: clientId, title: "Test task", status: "pending" })
      .select("id")
      .single();
    expect(taskError).toBeNull();

    const staffIdA = "00000000-0000-0000-0000-000000000001";
    const staffIdB = "00000000-0000-0000-0000-000000000002";

    // null -> staffIdA: task.assigned only.
    await service.from("tasks").update({ assigned_staff_id: staffIdA }).eq("id", task!.id);
    expect(await runCountFor(assignedAutomation)).toBe(1);
    expect(await runCountFor(reassignedAutomation)).toBe(0);

    // staffIdA -> staffIdB: task.reassigned only.
    await service.from("tasks").update({ assigned_staff_id: staffIdB }).eq("id", task!.id);
    expect(await runCountFor(assignedAutomation)).toBe(1);
    expect(await runCountFor(reassignedAutomation)).toBe(1);

    // staffIdB -> null: neither fires (unassignment is not a trigger event).
    await service.from("tasks").update({ assigned_staff_id: null }).eq("id", task!.id);
    expect(await runCountFor(assignedAutomation)).toBe(1);
    expect(await runCountFor(reassignedAutomation)).toBe(1);
  });

  it("invoice.created fires on insert regardless of status (including draft)", async () => {
    const workspaceId = await makeWorkspace("Invoice Created Trigger Test");
    const clientId = await makeClient(workspaceId);
    const automationId = await makeAutomation(workspaceId, "invoice.created");

    const { error: invoiceError } = await service
      .from("invoices")
      .insert({ workspace_id: workspaceId, client_id: clientId, status: "draft", total_amount: 100 });
    expect(invoiceError).toBeNull();

    expect(await runCountFor(automationId)).toBe(1);
  });

  it("payment.failed fires only for a failed payment, not a succeeded one", async () => {
    const workspaceId = await makeWorkspace("Payment Failed Trigger Test");
    const clientId = await makeClient(workspaceId);
    const automationId = await makeAutomation(workspaceId, "payment.failed");

    const { error: succeededError } = await service
      .from("payments")
      .insert({ workspace_id: workspaceId, client_id: clientId, amount: 50, status: "succeeded" });
    expect(succeededError).toBeNull();
    expect(await runCountFor(automationId)).toBe(0);

    const { error: failedError } = await service
      .from("payments")
      .insert({ workspace_id: workspaceId, client_id: clientId, amount: 50, status: "failed" });
    expect(failedError).toBeNull();
    expect(await runCountFor(automationId)).toBe(1);
  });

  it("a task attached only to a partner_prospect (no engagement/client/firm_connection) satisfies the recovered 4-way check constraint", async () => {
    const workspaceId = await makeWorkspace("Task Prospect Constraint Test");
    const { data: prospect, error: prospectError } = await service
      .from("partner_prospects")
      .insert({ owning_workspace_id: workspaceId, first_name: "Prospect", last_name: "Test", email: `prospect-${Date.now()}@example.invalid` })
      .select("id")
      .single();
    expect(prospectError).toBeNull();

    const { error: taskError } = await service
      .from("tasks")
      .insert({ workspace_id: workspaceId, partner_prospect_id: prospect!.id, title: "Prospect-only task", status: "pending" });
    expect(taskError).toBeNull();
  });
});
