// Automations reconciliation, Phase 15: workspace-authorized workflow retry.
// retry_failed_automation_run already existed (platform-admin/IT only) and
// was already correctly idempotent -- it reuses the same run_id and
// re-invokes execute_automation_step on the exact failed step, so this
// branch's own automation_dedupe_key columns already protect every side
// effect from being duplicated. This suite covers the new pieces: workspace
// authorization (replacing platform-admin-only), cross-workspace rejection,
// and the new automation_run_retry_attempts audit trail.
//
// Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and
// SUPABASE_SERVICE_ROLE_KEY in the environment, pointed at an isolated test
// project (never production). Fails loudly rather than skipping when
// they're missing, matching tests/database-contract-guard.test.ts's own
// reasoning.
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

describe("workspace-authorized workflow retry", () => {
  let service: SupabaseClient;
  let publisherClient: SupabaseClient;
  let publisherUserId: string;
  const publisherEmail = `retry-publisher-${Date.now()}@example.invalid`;
  const publisherPassword = `Rp-${Math.random().toString(36).slice(2)}!Aa1`;
  const cleanupWorkspaceIds: string[] = [];
  const cleanupUserIds: string[] = [];

  beforeAll(async () => {
    requireEnv();
    service = createClient(supabaseUrl!, serviceRoleKey!);

    // A separate, platform-admin fixture user solely to publish
    // makeFailedRun's automation: enforce_automation_publish_validation_trg
    // (this same PR's own migration) runs has_permission(...) on any
    // automation going live, which a raw service-role insert has no
    // context to satisfy. Kept distinct from makeAuthorizedStaffClient
    // below, which is the actual thing under test (workspace-scoped
    // retry authorization) and must stay a plain, non-admin staff member.
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: publisherEmail,
      password: publisherPassword,
      email_confirm: true,
    });
    expect(createError).toBeNull();
    publisherUserId = created!.user!.id;
    const { error: profileError } = await service.from("user_profiles").update({ is_platform_admin: true }).eq("id", publisherUserId);
    expect(profileError).toBeNull();
    publisherClient = createClient(supabaseUrl!, anonKey!);
    const { error: signInError } = await publisherClient.auth.signInWithPassword({ email: publisherEmail, password: publisherPassword });
    expect(signInError).toBeNull();
  });

  afterAll(async () => {
    if (!canRun) return;
    if (publisherUserId) {
      await service.auth.admin.deleteUser(publisherUserId);
    }
    if (cleanupWorkspaceIds.length > 0) {
      await service.from("workspaces").delete().in("id", cleanupWorkspaceIds);
    }
    for (const id of cleanupUserIds) {
      await service.auth.admin.deleteUser(id);
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

  // A signed-in staff member with a real, workspace-scoped automations.manage
  // grant (a role + role_permissions row + workspace_users membership) --
  // matches the existing has_permission(workspace_id, 'automations.manage')
  // check every other automation RPC in this domain already relies on, and
  // (unlike a platform-admin fixture) actually exercises has_permission's
  // own workspace-scoping rather than bypassing it via is_platform_admin().
  async function makeAuthorizedStaffClient(workspaceId: string) {
    const email = `retry-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.invalid`;
    const password = `Rt-${Math.random().toString(36).slice(2)}!Aa1`;
    const { data: created, error: createError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(createError).toBeNull();
    const userId = created!.user!.id;
    cleanupUserIds.push(userId);

    const { data: permission, error: permissionError } = await service
      .from("permissions")
      .select("id")
      .eq("key", "automations.manage")
      .single();
    expect(permissionError).toBeNull();

    const { data: role, error: roleError } = await service
      .from("roles")
      .insert({ workspace_id: workspaceId, name: "Retry Test Role", slug: `retry-test-role-${Date.now()}-${Math.floor(Math.random() * 1e6)}` })
      .select("id")
      .single();
    expect(roleError).toBeNull();

    const { error: rolePermissionError } = await service
      .from("role_permissions")
      .insert({ role_id: role!.id, permission_id: permission!.id });
    expect(rolePermissionError).toBeNull();

    const { error: membershipError } = await service
      .from("workspace_users")
      .insert({ workspace_id: workspaceId, user_id: userId, role_id: role!.id, status: "active" });
    expect(membershipError).toBeNull();

    const client = createClient(supabaseUrl!, anonKey!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    expect(signInError).toBeNull();
    return client;
  }

  async function makeFailedRun(workspaceId: string) {
    const slug = `retry-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const { data: automation } = await service
      .from("automations")
      .insert({ workspace_id: workspaceId, name: slug, slug, trigger_type: "lead.created", is_enabled: false, status: "draft" })
      .select("id")
      .single();
    const { data: step } = await service
      .from("automation_steps")
      .insert({ automation_id: automation!.id, display_order: 1, action_type: "add_note", action_config: { body: "test note" } })
      .select("id")
      .single();
    const { error: publishError } = await publisherClient
      .from("automations")
      .update({ is_enabled: true, status: "published" })
      .eq("id", automation!.id);
    expect(publishError).toBeNull();
    const { data: client } = await service
      .from("clients")
      .insert({ workspace_id: workspaceId, first_name: "Retry", last_name: "Test", client_type: "individual", lifecycle_status: "active" })
      .select("id")
      .single();
    const { data: run } = await service
      .from("automation_runs")
      .insert({
        workspace_id: workspaceId,
        automation_id: automation!.id,
        client_id: client!.id,
        current_step_id: step!.id,
        status: "failed",
        completed_at: new Date().toISOString(),
        trigger_snapshot: {},
      })
      .select("id")
      .single();
    return { runId: run!.id as string, stepId: step!.id as string, clientId: client!.id as string };
  }

  it("an authorized workspace user can retry a failed run in their own workspace", async () => {
    const workspaceId = await makeWorkspace("Retry Valid Test");
    const { runId } = await makeFailedRun(workspaceId);
    const staffClient = await makeAuthorizedStaffClient(workspaceId);

    const { data, error } = await staffClient.rpc("retry_failed_automation_run", { p_run_id: runId });
    expect(error).toBeNull();
    expect((data as { ok?: boolean } | null)?.ok).toBe(true);
    expect((data as { attempt_number?: number } | null)?.attempt_number).toBe(1);

    const { data: runAfter } = await service.from("automation_runs").select("status").eq("id", runId).single();
    expect(runAfter?.status).not.toBe("failed");

    const { data: attempts } = await service.from("automation_run_retry_attempts").select("attempt_number, run_id").eq("run_id", runId);
    expect(attempts).toHaveLength(1);
    expect(attempts?.[0].attempt_number).toBe(1);
  });

  it("rejects retry from a user with no permission in the run's workspace", async () => {
    const workspaceId = await makeWorkspace("Retry Unauthorized Test");
    const { runId } = await makeFailedRun(workspaceId);

    // A plain signed-in user with no workspace_users row anywhere and no
    // platform-admin flag -- has_permission and is_platform_admin/is_platform_it
    // should all be false for them.
    const email = `retry-unauth-${Date.now()}@example.invalid`;
    const password = `Rt-${Math.random().toString(36).slice(2)}!Aa1`;
    const { data: created } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    cleanupUserIds.push(created!.user!.id);
    const client = createClient(supabaseUrl!, anonKey!);
    await client.auth.signInWithPassword({ email, password });

    const { error } = await client.rpc("retry_failed_automation_run", { p_run_id: runId });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("insufficient permissions");
  });

  it("rejects retry across workspaces: an authorized staff member of workspace A cannot retry workspace B's run", async () => {
    const workspaceA = await makeWorkspace("Retry Cross WS A");
    const workspaceB = await makeWorkspace("Retry Cross WS B");
    const { runId: runInA } = await makeFailedRun(workspaceA);
    const { runId: runInB } = await makeFailedRun(workspaceB);
    const staffOfA = await makeAuthorizedStaffClient(workspaceA);

    // Same user, same real automations.manage grant -- succeeds for their
    // own workspace's run, fails for the other workspace's run. Proves
    // has_permission's workspace scoping, not just "some user is authorized
    // somewhere."
    const { error: ownWorkspaceError } = await staffOfA.rpc("retry_failed_automation_run", { p_run_id: runInA });
    expect(ownWorkspaceError).toBeNull();

    const { error: otherWorkspaceError } = await staffOfA.rpc("retry_failed_automation_run", { p_run_id: runInB });
    expect(otherWorkspaceError).not.toBeNull();
    expect(otherWorkspaceError?.message).toContain("insufficient permissions");
  });

  it("rejects retrying a run that is not in a failed state", async () => {
    const workspaceId = await makeWorkspace("Retry Not Failed Test");
    const { runId } = await makeFailedRun(workspaceId);
    await service.from("automation_runs").update({ status: "completed" }).eq("id", runId);
    const staffClient = await makeAuthorizedStaffClient(workspaceId);

    const { error } = await staffClient.rpc("retry_failed_automation_run", { p_run_id: runId });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("not in a failed state");
  });

  it("a second retry attempt increments attempt_number and does not duplicate the note the first attempt already created", async () => {
    const workspaceId = await makeWorkspace("Retry Attempt Count Test");
    const { runId, stepId } = await makeFailedRun(workspaceId);
    const staffClient = await makeAuthorizedStaffClient(workspaceId);

    await staffClient.rpc("retry_failed_automation_run", { p_run_id: runId });
    // The add_note step should have succeeded and completed the run -- force
    // it back to failed to simulate a second failure needing another retry.
    await service.from("automation_runs").update({ status: "failed", current_step_id: stepId }).eq("id", runId);

    const { data: secondAttempt, error } = await staffClient.rpc("retry_failed_automation_run", { p_run_id: runId });
    expect(error).toBeNull();
    expect((secondAttempt as { attempt_number?: number } | null)?.attempt_number).toBe(2);

    const { data: notes } = await service.from("notes").select("id").eq("automation_dedupe_key", `automation_step:${stepId}:${runId}`);
    expect(notes).toHaveLength(1);
  });
});
