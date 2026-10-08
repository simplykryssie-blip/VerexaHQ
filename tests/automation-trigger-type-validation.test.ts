// Automations reconciliation: trigger-type validation. automations.trigger_type
// has always been unconstrained text with no server-side source of truth --
// the vocabulary lived only in components/workflows/TriggerFields.tsx's
// TRIGGER_TYPES. See supabase/migrations/20261101020000_automation_trigger_type_validation.sql
// for the known_automation_trigger_types() RPC and the validate_automation
// patch that consults it. This suite guards two things: that the server-side
// list and the client-side list never silently drift apart, and that
// validate_automation actually surfaces an unrecognized trigger_type as a
// validation issue instead of letting the workflow publish and silently
// never fire.
//
// Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and
// SUPABASE_SERVICE_ROLE_KEY in the environment, pointed at an isolated test
// project (never production). Fails loudly rather than skipping when they're
// missing, matching tests/database-contract-guard.test.ts's own reasoning:
// a silently-skipped guard is a false green in CI.
//
// validate_automation itself requires an authenticated caller with
// automations.manage on the workspace (or a platform admin) -- the service
// role has no auth.uid(), so a real signed-in test user is created and
// promoted to platform admin (via user_profiles) for the duration of this
// suite, then removed in afterAll.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TRIGGER_TYPES } from "@/components/workflows/TriggerFields";

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

describe("automation trigger-type validation", () => {
  let service: SupabaseClient;
  let userClient: SupabaseClient;
  let testUserId: string;
  const testEmail = `trigger-validation-test-${Date.now()}@example.invalid`;
  const testPassword = `Tv-${Math.random().toString(36).slice(2)}!Aa1`;
  const cleanupWorkspaceIds: string[] = [];

  beforeAll(async () => {
    requireEnv();
    service = createClient(supabaseUrl!, serviceRoleKey!);

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

  async function makeTestWorkspaceWithAutomation(triggerType: string) {
    const slugSuffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const { data: workspace, error: workspaceError } = await service
      .from("workspaces")
      .insert({ name: "Trigger Validation Test", slug: `trigger-validation-test-${slugSuffix}` })
      .select("id")
      .single();
    expect(workspaceError).toBeNull();
    cleanupWorkspaceIds.push(workspace!.id);

    const { data: automation, error: automationError } = await service
      .from("automations")
      .insert({
        workspace_id: workspace!.id,
        name: "Trigger Type Test",
        slug: `trigger-type-test-${slugSuffix}`,
        trigger_type: triggerType,
        is_enabled: false,
        status: "draft",
      })
      .select("id")
      .single();
    expect(automationError).toBeNull();

    const { error: stepError } = await service.from("automation_steps").insert({
      automation_id: automation!.id,
      display_order: 1,
      action_type: "add_note",
      action_config: { body: "test" },
    });
    expect(stepError).toBeNull();

    return automation!.id as string;
  }

  it("known_automation_trigger_types() matches TriggerFields.tsx's TRIGGER_TYPES exactly", async () => {
    const { data, error } = await userClient.rpc("known_automation_trigger_types");
    expect(error).toBeNull();
    const serverSet = new Set(data as string[]);
    const clientSet = new Set(TRIGGER_TYPES.map((t) => t.value));

    const missingFromServer = [...clientSet].filter((v) => !serverSet.has(v));
    const extraOnServer = [...serverSet].filter((v) => !clientSet.has(v));

    expect(missingFromServer, "TriggerFields.tsx has a trigger the server-side list doesn't know about").toEqual([]);
    expect(extraOnServer, "the server-side list has a trigger TriggerFields.tsx no longer offers").toEqual([]);
  });

  it("validate_automation flags an unrecognized trigger_type as a publish-blocking issue", async () => {
    const automationId = await makeTestWorkspaceWithAutomation("this.trigger.does.not.exist");
    const { data: issues, error } = await userClient.rpc("validate_automation", { p_automation_id: automationId });
    expect(error).toBeNull();
    expect(issues?.some((i: { issue: string }) => i.issue.includes("not a recognized trigger type"))).toBe(true);
  });

  it("validate_automation does not flag a real trigger type", async () => {
    const automationId = await makeTestWorkspaceWithAutomation("lead.created");
    const { data: issues, error } = await userClient.rpc("validate_automation", { p_automation_id: automationId });
    expect(error).toBeNull();
    expect(issues?.some((i: { issue: string }) => i.issue.includes("not a recognized trigger type"))).toBe(false);
  });
});
