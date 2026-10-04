// P08-02: run-pending-automation-steps previously discarded every RPC
// result's `error` and unconditionally deleted the automation_pending_steps
// row afterward -- "the only durable 'still waiting' marker" a delayed step
// has. An RPC error (should_advance_wait_until_step, start_next_automation_step,
// or execute_automation_step) meant the row was destroyed even though the
// step never actually advanced, leaving the parent run stuck at
// status='running' forever with nothing left to ever revisit it.
//
// This exercises the REAL route handler (the exported `GET`, wrapped in
// withJobLogging exactly as Vercel invokes it) against a mocked Supabase
// client, not just a source-string assertion -- the assertions are on
// which rows the mocked `.delete()` was actually called with, proving the
// real control flow, not just that the right words appear in the file.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  pendingRows: [] as Array<{
    id: string;
    run_id: string;
    workspace_id: string;
    automation_step_id: string;
    automation_steps: { action_type: string } | null;
    automation_runs: { status: string } | null;
  }>,
  workspaceRows: [] as Array<{ id: string; status: string }>,
  shouldAdvanceResult: { data: true as unknown, error: null as unknown },
  advanceResult: { data: null as unknown, error: null as unknown },
  deletedIds: [] as string[],
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
}));

function resetState() {
  state.pendingRows = [];
  state.workspaceRows = [];
  state.shouldAdvanceResult = { data: true, error: null };
  state.advanceResult = { data: null, error: null };
  state.deletedIds = [];
  state.rpcCalls = [];
}

function thenable<T>(value: T) {
  return {
    then: (resolve: (v: T) => unknown) => resolve(value),
  };
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: (fn: string, args: unknown) => {
      state.rpcCalls.push({ fn, args });
      if (fn === "should_advance_wait_until_step") return Promise.resolve(state.shouldAdvanceResult);
      if (fn === "start_next_automation_step" || fn === "execute_automation_step") return Promise.resolve(state.advanceResult);
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => {
      if (table === "automation_pending_steps") {
        return {
          select: () => ({
            eq: () => ({
              lte: () => ({
                order: () => ({
                  limit: () => thenable({ data: state.pendingRows, error: null }),
                }),
              }),
            }),
          }),
          delete: () => ({
            eq: (_col: string, id: string) => {
              state.deletedIds.push(id);
              return thenable({ data: null, error: null });
            },
          }),
        };
      }
      if (table === "workspaces") {
        return {
          select: () => ({
            in: () => thenable({ data: state.workspaceRows, error: null }),
          }),
        };
      }
      if (table === "automation_runs") {
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                limit: () => thenable({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "cron_job_runs") {
        return { insert: () => thenable({ data: null, error: null }) };
      }
      if (table === "system_failure_log") {
        return { insert: () => thenable({ data: null, error: null }) };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
  }),
}));

async function callRoute() {
  const { GET } = await import("@/app/api/cron/run-pending-automation-steps/route");
  const response = await GET(new Request("https://example.com/api/cron/run-pending-automation-steps", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  }));
  return { response, body: await response.json() };
}

function makeRow(overrides: Partial<(typeof state.pendingRows)[number]> = {}) {
  return {
    id: "pending-1",
    run_id: "run-1",
    workspace_id: "ws-1",
    automation_step_id: "step-1",
    automation_steps: { action_type: "delay" },
    automation_runs: { status: "running" },
    ...overrides,
  };
}

beforeEach(() => {
  resetState();
  process.env.CRON_SECRET = "test-secret";
  state.workspaceRows = [{ id: "ws-1", status: "active" }];
});

describe("run-pending-automation-steps RPC error handling (P08-02)", () => {
  it("does not delete the pending row when should_advance_wait_until_step errors", async () => {
    state.pendingRows = [makeRow()];
    state.shouldAdvanceResult = { data: null, error: { message: "boom" } };

    const { body } = await callRoute();

    expect(state.deletedIds).toEqual([]);
    expect(body.failed).toBe(1);
    expect(body.processed).toBe(0);
  });

  it("does not treat a should_advance_wait_until_step error as false/safe-to-delete", async () => {
    // Specifically guards against `shouldAdvance === false` being used as
    // the sole check -- an errored call's `data` is null, not `false`, but
    // the fix must not fall through to the "advance" branch either.
    state.pendingRows = [makeRow()];
    state.shouldAdvanceResult = { data: null, error: { message: "transient failure" } };

    await callRoute();

    const advanceCalls = state.rpcCalls.filter((c) => c.fn === "execute_automation_step" || c.fn === "start_next_automation_step");
    expect(advanceCalls).toEqual([]);
    expect(state.deletedIds).toEqual([]);
  });

  it("does not delete the pending row when execute_automation_step errors", async () => {
    state.pendingRows = [makeRow({ automation_steps: { action_type: "send_email" } })];
    state.advanceResult = { data: null, error: { message: "unexpected db error" } };

    const { body } = await callRoute();

    expect(state.deletedIds).toEqual([]);
    expect(body.failed).toBe(1);
    expect(body.processed).toBe(0);
  });

  it("does not delete the pending row when start_next_automation_step errors (condition step)", async () => {
    state.pendingRows = [makeRow({ automation_steps: { action_type: "condition" } })];
    state.advanceResult = { data: null, error: { message: "unexpected db error" } };

    const { body } = await callRoute();

    expect(state.rpcCalls.some((c) => c.fn === "start_next_automation_step")).toBe(true);
    expect(state.deletedIds).toEqual([]);
    expect(body.failed).toBe(1);
  });

  it("deletes the pending row when the RPC succeeds, even if the automation's own action legitimately failed", async () => {
    // A successful RPC call that resolves to a business-level failure (the
    // step's own action raised, caught internally, run marked 'failed') is
    // NOT an RPC error -- the attempt genuinely completed and is fully
    // logged, so the pending marker's job is done.
    state.pendingRows = [makeRow({ automation_steps: { action_type: "send_email" } })];
    state.advanceResult = { data: null, error: null };

    const { body } = await callRoute();

    expect(state.deletedIds).toEqual(["pending-1"]);
    expect(body.processed).toBe(1);
    expect(body.failed).toBe(0);
  });

  it("still deletes the pending row immediately when the parent run is no longer running", async () => {
    state.pendingRows = [makeRow({ automation_runs: { status: "cancelled" } })];

    const { body } = await callRoute();

    expect(state.deletedIds).toEqual(["pending-1"]);
    expect(state.rpcCalls).toEqual([]);
    expect(body.processed).toBe(0);
  });

  it("still leaves the row parked (not deleted, no RPC call) when the workspace is not operational", async () => {
    state.pendingRows = [makeRow()];
    state.workspaceRows = [{ id: "ws-1", status: "suspended" }];

    const { body } = await callRoute();

    expect(state.deletedIds).toEqual([]);
    expect(state.rpcCalls).toEqual([]);
    expect(body.blocked).toBe(1);
    expect(body.failed).toBe(0);
  });

  it("still advances and deletes normally when should_advance_wait_until_step legitimately says not yet", async () => {
    state.pendingRows = [makeRow()];
    state.shouldAdvanceResult = { data: false, error: null };

    const { body } = await callRoute();

    expect(state.deletedIds).toEqual([]);
    expect(body.stillWaiting).toBe(1);
    expect(body.failed).toBe(0);
  });
});
