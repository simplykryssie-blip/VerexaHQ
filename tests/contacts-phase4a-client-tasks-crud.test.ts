// Regression coverage for VEREXAHQ -- CONTACTS COMPLETION PASS, Phase 4a
// (Client Tasks CRUD). The Tasks tab previously only supported
// checkbox-complete; this reuses the existing `tasks` table (no new task
// architecture) to add create/edit/delete/reopen, following the exact
// InlineAddForm pattern every other client sub-record (contacts, addresses,
// notes) already uses in app/(app)/clients/[id]/AddForms.tsx.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FixtureResult } from "./helpers/fakeSupabase";
import { WORKSPACE_FIXTURE, CLIENT_NO_RELATED_RECORDS } from "./fixtures/clientRecords";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const clientIdDir = join(dirname(fileURLToPath(import.meta.url)), "..", "app/(app)/clients/[id]");

const state = vi.hoisted(() => ({ supabase: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => state.supabase,
}));
vi.mock("@/lib/workspace", () => ({
  getCurrentWorkspace: () => Promise.resolve(WORKSPACE_FIXTURE),
}));

function setSupabase(tables: Record<string, FixtureResult> = {}, rpcs: Record<string, FixtureResult> = {}) {
  state.supabase = createFakeSupabase({ tables, rpcs });
}

beforeEach(() => {
  vi.resetModules();
});

describe("getClientWorkspaceData -- completedTasks", () => {
  it("returns an empty completedTasks array for a client with no tasks", async () => {
    setSupabase({ clients: { data: CLIENT_NO_RELATED_RECORDS } });
    const { getClientWorkspaceData } = await import("@/app/(app)/clients/[id]/getClientWorkspaceData");
    const result = await getClientWorkspaceData(CLIENT_NO_RELATED_RECORDS.id);
    expect(result?.completedTasks).toEqual([]);
  });

  it("does not throw when the tasks table returns rows (open vs completed split happens server-side via separate queries)", async () => {
    setSupabase({
      clients: { data: CLIENT_NO_RELATED_RECORDS },
      tasks: {
        data: [
          {
            id: "task-1",
            title: "Collect W-2",
            description: null,
            status: "completed",
            priority: "high",
            due_date: null,
            engagement_id: null,
            client_id: CLIENT_NO_RELATED_RECORDS.id,
            related_organizer_response_id: null,
            assigned_staff_id: null,
            visibility: "internal",
          },
        ],
      },
    });
    const { getClientWorkspaceData } = await import("@/app/(app)/clients/[id]/getClientWorkspaceData");
    const result = await getClientWorkspaceData(CLIENT_NO_RELATED_RECORDS.id);
    expect(result).toBeTruthy();
    expect(Array.isArray(result?.completedTasks)).toBe(true);
  });
});

describe("AddForms.tsx -- Client Task CRUD source-level invariants", () => {
  const source = readFileSync(join(clientIdDir, "AddForms.tsx"), "utf8");

  it("AddClientTaskForm inserts into the existing tasks table with client_id set, not a new table", () => {
    const body = source.match(/export function AddClientTaskForm\([\s\S]*?\n\}/)?.[0] ?? "";
    expect(body).toMatch(/\.from\("tasks"\)\.insert\(/);
    expect(body).toMatch(/client_id: clientId/);
    expect(body).toMatch(/status: "pending"/);
  });

  it("EditTaskForm updates the existing tasks table by id, prefilled from the current task", () => {
    const body = source.match(/export function EditTaskForm\([\s\S]*?\n\}/)?.[0] ?? "";
    expect(body).toMatch(/\.from\("tasks"\)\s*\.update\(/);
    expect(body).toMatch(/\.eq\("id", task\.id\)/);
    expect(body).toMatch(/initialValues=\{\{/);
  });

  it("DeleteTaskButton confirms before deleting, matching DeleteContactButton/DeleteAddressButton's own pattern", () => {
    const body = source.match(/export function DeleteTaskButton\([\s\S]*?\n\}/)?.[0] ?? "";
    expect(body).toMatch(/window\.confirm\(/);
    expect(body).toMatch(/\.from\("tasks"\)\.delete\(\)\.eq\("id", taskId\)/);
  });

  it("ReopenTaskButton sets status back to pending and clears completed_at, rather than inventing a new status value", () => {
    const body = source.match(/export function ReopenTaskButton\([\s\S]*?\n\}/)?.[0] ?? "";
    expect(body).toMatch(/status: "pending"/);
    expect(body).toMatch(/completed_at: null/);
  });
});

describe("ClientWorkspaceTabs.tsx -- TasksTab wiring", () => {
  const source = readFileSync(join(clientIdDir, "ClientWorkspaceTabs.tsx"), "utf8");

  it("wires AddClientTaskForm as the Tasks section's action, matching NotesTab's own AddNoteForm pattern", () => {
    expect(source).toMatch(/<Section title="Tasks" action=\{<AddClientTaskForm/);
  });

  it("renders EditTaskForm and DeleteTaskButton per open task", () => {
    const body = source.match(/export function TasksTab\([\s\S]*?\n\}\n/)?.[0] ?? "";
    expect(body).toMatch(/<EditTaskForm task=\{t\}/);
    expect(body).toMatch(/<DeleteTaskButton taskId=\{t\.id\}/);
  });

  it("renders a collapsible completed-tasks section with Reopen, not a permanently-visible or auto-expanded list", () => {
    const body = source.match(/export function TasksTab\([\s\S]*?\n\}\n/)?.[0] ?? "";
    expect(body).toMatch(/showCompleted/);
    expect(body).toMatch(/<ReopenTaskButton taskId=\{t\.id\}/);
  });
});
