// Automations reconciliation, Phase 19/9: server-side publish validation
// enforcement. validate_automation() already existed and is thorough, but
// it was only ever consulted from the client immediately before a plain
// `.update({status: 'published', is_enabled: true})` -- nothing stopped
// that update from being sent directly, skipping validation entirely. See
// supabase/migrations/20261101090000_workflow_publish_validation_enforcement.sql
// for the AFTER INSERT OR UPDATE trigger that closes that gap by re-running
// validate_automation itself (not a second rule set) whenever a row
// transitions into "live", and the new webhook.received integration-id
// check added to validate_automation's own body.
//
// This suite deliberately calls `.update()` directly on the automations
// table (bypassing validate_automation client-side, the way a bug or a
// different caller could) to prove the DATABASE, not just the UI, rejects
// an invalid workflow going live.
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

describe("workflow publish validation is enforced server-side", () => {
  let service: SupabaseClient;
  let userClient: SupabaseClient;
  let testUserId: string;
  const testEmail = `publish-validation-test-${Date.now()}@example.invalid`;
  const testPassword = `Pv-${Math.random().toString(36).slice(2)}!Aa1`;
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

  async function makeWorkspace() {
    const slugSuffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const { data, error } = await service
      .from("workspaces")
      .insert({ name: "Publish Validation Test", slug: `publish-validation-test-${slugSuffix}` })
      .select("id")
      .single();
    expect(error).toBeNull();
    cleanupWorkspaceIds.push(data!.id);
    return data!.id as string;
  }

  async function makeAutomation(workspaceId: string, overrides: Record<string, unknown> = {}) {
    const slugSuffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const { data, error } = await service
      .from("automations")
      .insert({
        workspace_id: workspaceId,
        name: "Publish Validation Automation",
        slug: `publish-validation-automation-${slugSuffix}`,
        trigger_type: "lead.created",
        is_enabled: false,
        status: "draft",
        ...overrides,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data!.id as string;
  }

  async function addValidStep(automationId: string) {
    const { error } = await service.from("automation_steps").insert({
      automation_id: automationId,
      display_order: 1,
      action_type: "add_note",
      action_config: { body: "test" },
    });
    expect(error).toBeNull();
  }

  it("rejects enabling a workflow with no steps, even when the client update bypasses validate_automation", async () => {
    const workspaceId = await makeWorkspace();
    const automationId = await makeAutomation(workspaceId); // no steps added

    const { error } = await userClient.from("automations").update({ is_enabled: true }).eq("id", automationId);
    expect(error).not.toBeNull();
    expect(error?.message).toContain("no steps");
  });

  it("rejects publishing (status transition) the same way it rejects enabling", async () => {
    const workspaceId = await makeWorkspace();
    const automationId = await makeAutomation(workspaceId); // no steps added

    const { error } = await userClient.from("automations").update({ status: "published", is_enabled: true }).eq("id", automationId);
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/no steps|activating it does nothing/i);
  });

  it("rejects a webhook.received trigger configured against an integration that doesn't exist", async () => {
    const workspaceId = await makeWorkspace();
    const automationId = await makeAutomation(workspaceId, {
      trigger_type: "webhook.received",
      trigger_config: { integration_id: "00000000-0000-0000-0000-000000000000" },
    });
    await addValidStep(automationId);

    const { error } = await userClient.from("automations").update({ is_enabled: true }).eq("id", automationId);
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/webhook integration/i);
  });

  it("rejects a webhook.received trigger configured against a disabled integration", async () => {
    const workspaceId = await makeWorkspace();
    const { data: integration, error: integrationError } = await service
      .from("webhook_integrations")
      .insert({ workspace_id: workspaceId, provider: "generic", name: "Test Integration", signing_secret: "test-secret", status: "disabled" })
      .select("id")
      .single();
    expect(integrationError).toBeNull();

    const automationId = await makeAutomation(workspaceId, {
      trigger_type: "webhook.received",
      trigger_config: { integration_id: integration!.id },
    });
    await addValidStep(automationId);

    const { error } = await userClient.from("automations").update({ is_enabled: true }).eq("id", automationId);
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/webhook integration/i);
  });

  it("allows a genuinely valid workflow (including a valid webhook.received integration) to go live", async () => {
    const workspaceId = await makeWorkspace();
    const { data: integration, error: integrationError } = await service
      .from("webhook_integrations")
      .insert({ workspace_id: workspaceId, provider: "generic", name: "Test Integration Active", signing_secret: "test-secret", status: "active" })
      .select("id")
      .single();
    expect(integrationError).toBeNull();

    const automationId = await makeAutomation(workspaceId, {
      trigger_type: "webhook.received",
      trigger_config: { integration_id: integration!.id },
    });
    await addValidStep(automationId);

    const { error } = await userClient.from("automations").update({ status: "published", is_enabled: true }).eq("id", automationId);
    expect(error).toBeNull();

    const { data: after } = await service.from("automations").select("status, is_enabled").eq("id", automationId).single();
    expect(after?.status).toBe("published");
    expect(after?.is_enabled).toBe(true);
  });

  it("does not retroactively block an already-live workflow that has since become invalid from being edited for an unrelated reason", async () => {
    const workspaceId = await makeWorkspace();
    const automationId = await makeAutomation(workspaceId);
    await addValidStep(automationId);

    // Legitimately go live first.
    const { error: enableError } = await userClient.from("automations").update({ is_enabled: true }).eq("id", automationId);
    expect(enableError).toBeNull();

    // Now silently drift invalid without touching is_enabled/status at all
    // (deleting the only step is the same "no steps" issue the first test
    // above exercises, just reached via a different route).
    const { error: stepDeleteError } = await service.from("automation_steps").delete().eq("automation_id", automationId);
    expect(stepDeleteError).toBeNull();

    // An unrelated edit (renaming it) must not be blocked -- the trigger
    // only re-validates on the is_enabled/status transition itself, not on
    // every write to an already-live row.
    const { error: renameError } = await userClient.from("automations").update({ name: "Renamed While Invalid" }).eq("id", automationId);
    expect(renameError).toBeNull();

    const { data: after } = await service.from("automations").select("name, is_enabled").eq("id", automationId).single();
    expect(after?.name).toBe("Renamed While Invalid");
    expect(after?.is_enabled).toBe(true); // still live -- this migration never un-publishes anything retroactively
  });
});
