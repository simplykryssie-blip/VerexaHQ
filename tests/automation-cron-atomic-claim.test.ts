// Automations reconciliation, Phase 10: wait/resume concurrency.
// app/api/cron/run-pending-automation-steps/route.ts runs every minute
// (vercel.json) and used to select due rows with a plain, unlocked SELECT --
// two overlapping invocations (a slow run still finishing when the next
// tick fires, or a manual trigger during a scheduled one) could both select
// the same due row and both execute it, duplicating its side effect. See
// supabase/migrations/20261101040000_automation_cron_atomic_claim.sql for
// claim_due_pending_automation_steps/claim_blocked_automation_runs, which
// atomically claim rows via `for update skip locked` so two concurrent
// claimers never both get the same row.
//
// Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and
// SUPABASE_SERVICE_ROLE_KEY in the environment, pointed at an isolated test
// project (never production). Fails loudly rather than skipping when
// they're missing, matching tests/database-contract-guard.test.ts's own
// reasoning: a silently-skipped guard is a false green in CI.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRun = Boolean(supabaseUrl && anonKey && serviceRoleKey);

function requireEnv() {
  if (!canRun) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and/or SUPABASE_SERVICE_ROLE_KEY are not set. " +
        "This suite requires an isolated Supabase test project to run against -- set all three env vars " +
        "(see .env.local.example) rather than letting this skip silently."
    );
  }
}

describe("automation cron atomic claim", () => {
  let service: SupabaseClient;
  let userClient: SupabaseClient;
  let testUserId: string;
  const testEmail = `cron-claim-test-${Date.now()}@example.invalid`;
  const testPassword = `Cc-${Math.random().toString(36).slice(2)}!Aa1`;
  const cleanupWorkspaceIds: string[] = [];

  beforeAll(async () => {
    requireEnv();
    service = createClient(supabaseUrl!, serviceRoleKey!);

    // Publishing a fixture automation requires a real authenticated user:
    // enforce_automation_publish_validation_trg (this same PR's own
    // migration) runs has_permission(...) on any automation going live.
    // Platform-admin bypasses the workspace-membership check, which is
    // fine here since this suite is about cron claim atomicity, not
    // permission scoping.
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });
    expect(createError).toBeNull();
    testUserId = created!.user!.id;

    const { error: profileError } = await service.from("user_profiles").update({ is_platform_admin: true }).eq("id", testUserId);
    expect(profileError).toBeNull();

    userClient = createClient(supabaseUrl!, anonKey!);
    const { error: signInError } = await userClient.auth.signInWithPassword({ email: testEmail, password: testPassword });
    expect(signInError).toBeNull();
  });

  afterAll(async () => {
    if (!canRun) return;
    if (cleanupWorkspaceIds.length > 0) {
      await service.from("workspaces").delete().in("id", cleanupWorkspaceIds);
    }
    if (testUserId) {
      await service.auth.admin.deleteUser(testUserId);
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

  // Insert as a draft (no auth/steps required until a row goes live), add
  // a step (required before it can publish), then publish via the
  // authenticated userClient.
  async function makeAutomation(workspaceId: string, name: string, stepOverrides: Record<string, unknown> = {}) {
    const { data, error } = await service
      .from("automations")
      .insert({
        workspace_id: workspaceId,
        name,
        slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        trigger_type: "lead.created",
        is_enabled: false,
        status: "draft",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const automationId = data!.id as string;

    const { data: stepData, error: stepError } = await service
      .from("automation_steps")
      .insert({ automation_id: automationId, display_order: 1, action_type: "add_note", action_config: { body: "test" }, ...stepOverrides })
      .select("id")
      .single();
    expect(stepError).toBeNull();

    const { error: publishError } = await userClient
      .from("automations")
      .update({ is_enabled: true, status: "published" })
      .eq("id", automationId);
    expect(publishError).toBeNull();

    return { automationId, stepId: stepData!.id as string };
  }

  it("two concurrent claim_due_pending_automation_steps calls never both claim the same row", async () => {
    const workspaceId = await makeWorkspace("Claim Race Test");
    const { automationId, stepId } = await makeAutomation(workspaceId, "Claim Test", { delay_minutes: 5 });

    const { data: run, error: runError } = await service
      .from("automation_runs")
      .insert({ workspace_id: workspaceId, automation_id: automationId, status: "running", trigger_snapshot: {} })
      .select("id")
      .single();
    expect(runError).toBeNull();

    const { error: pendingError } = await service.from("automation_pending_steps").insert({
      workspace_id: workspaceId,
      run_id: run!.id,
      automation_step_id: stepId,
      status: "pending_delay",
      scheduled_for: new Date(Date.now() - 1000).toISOString(),
    });
    expect(pendingError).toBeNull();

    // Two "concurrent" claim attempts, fired together.
    const [first, second] = await Promise.all([
      service.rpc("claim_due_pending_automation_steps", { p_limit: 10 }),
      service.rpc("claim_due_pending_automation_steps", { p_limit: 10 }),
    ]);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();

    const firstIds = (first.data ?? []).map((r: { id: string }) => r.id);
    const secondIds = (second.data ?? []).map((r: { id: string }) => r.id);
    const overlap = firstIds.filter((id: string) => secondIds.includes(id));

    expect(overlap).toEqual([]);
    expect(firstIds.length + secondIds.length).toBe(1);
  });

  it("a claimed row is not reclaimed until it goes stale, and releasing it (claimed_at = null) makes it claimable again immediately", async () => {
    const workspaceId = await makeWorkspace("Claim Release Test");
    const { automationId, stepId } = await makeAutomation(workspaceId, "Release Test");
    const { data: run } = await service
      .from("automation_runs")
      .insert({ workspace_id: workspaceId, automation_id: automationId, status: "running", trigger_snapshot: {} })
      .select("id")
      .single();
    const { data: pending } = await service
      .from("automation_pending_steps")
      .insert({
        workspace_id: workspaceId,
        run_id: run!.id,
        automation_step_id: stepId,
        status: "pending_delay",
        scheduled_for: new Date(Date.now() - 1000).toISOString(),
      })
      .select("id")
      .single();

    const { data: firstClaim } = await service.rpc("claim_due_pending_automation_steps", { p_limit: 10 });
    expect(firstClaim?.map((r: { id: string }) => r.id)).toContain(pending!.id);

    const { data: secondClaimBeforeRelease } = await service.rpc("claim_due_pending_automation_steps", { p_limit: 10 });
    expect(secondClaimBeforeRelease?.map((r: { id: string }) => r.id)).not.toContain(pending!.id);

    await service.from("automation_pending_steps").update({ claimed_at: null }).eq("id", pending!.id);

    const { data: thirdClaimAfterRelease } = await service.rpc("claim_due_pending_automation_steps", { p_limit: 10 });
    expect(thirdClaimAfterRelease?.map((r: { id: string }) => r.id)).toContain(pending!.id);
  });

  it("two concurrent claim_blocked_automation_runs calls never both claim the same run", async () => {
    const workspaceId = await makeWorkspace("Blocked Claim Race Test");
    const { automationId } = await makeAutomation(workspaceId, "Blocked Claim Test");
    const { data: run, error: runError } = await service
      .from("automation_runs")
      .insert({ workspace_id: workspaceId, automation_id: automationId, status: "running", trigger_snapshot: {}, blocked_at: new Date().toISOString() })
      .select("id")
      .single();
    expect(runError).toBeNull();

    const [first, second] = await Promise.all([
      service.rpc("claim_blocked_automation_runs", { p_limit: 10 }),
      service.rpc("claim_blocked_automation_runs", { p_limit: 10 }),
    ]);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();

    const firstIds = (first.data ?? []).map((r: { id: string }) => r.id);
    const secondIds = (second.data ?? []).map((r: { id: string }) => r.id);
    const overlap = firstIds.filter((id: string) => secondIds.includes(id));

    expect(overlap).toEqual([]);
    expect([...firstIds, ...secondIds]).toContain(run!.id);
  });
});
