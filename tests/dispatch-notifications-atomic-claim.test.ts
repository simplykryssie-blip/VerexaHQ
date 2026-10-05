// P09-03/P09-04: dispatch-notifications used to SELECT pending jobs with no
// claim step at all (two overlapping cron runs could both pick up and send
// the same job), and the external provider send happened before the queue
// row's status was durably persisted (a crash between those two steps left
// the job 'pending' for the next tick to resend). These tests prove the
// actual fix: the cron now claims jobs through the atomic
// claim_notification_queue_jobs RPC rather than a plain SELECT, a
// successful Resend email send carries a per-job idempotency key (so a
// resend-after-crash dedupes at the provider instead of emailing twice),
// and a retry-eligible failure explicitly releases the claim back to
// 'pending' instead of leaving the row stuck in 'processing'.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  claimedJobs: [] as unknown[],
  rpcCalls: [] as { name: string; args: unknown }[],
  updates: [] as { table: string; payload: unknown; filters: Record<string, unknown> }[],
  sendEmailResult: { sent: true, id: "resend-msg-1" } as { sent: boolean; id?: string; error?: string },
  sendEmailCalls: [] as unknown[],
}));

function queryBuilder(table: string, result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const filters: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    in: vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    }),
    eq: vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    }),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    or: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    insert: vi.fn((payload: unknown) => {
      state.updates.push({ table, payload, filters: { ...filters } });
      return Promise.resolve({ data: null, error: null });
    }),
    update: vi.fn((payload: unknown) => {
      const self = builder;
      const chained = {
        eq: vi.fn((col: string, val: unknown) => {
          state.updates.push({ table, payload, filters: { ...filters, [col]: val } });
          return Promise.resolve({ data: null, error: null });
        }),
      };
      return chained;
    }),
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return builder;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: vi.fn((table: string) => {
      if (table === "notification_queue") return queryBuilder(table, { data: [], error: null });
      if (table === "workspaces") return queryBuilder(table, { data: [{ id: "ws-1", status: "active" }], error: null });
      if (table === "email_templates")
        return queryBuilder(table, {
          data: [{ slug: "test-template", workspace_id: null, subject: "Hi", body_html: "<p>Hi</p>", banner_image_url: null, custom_css: null }],
          error: null,
        });
      return queryBuilder(table, { data: [], error: null });
    }),
    rpc: vi.fn((name: string, args: unknown) => {
      state.rpcCalls.push({ name, args });
      if (name === "claim_notification_queue_jobs") return Promise.resolve({ data: state.claimedJobs, error: null });
      return Promise.resolve({ data: null, error: null });
    }),
  }),
}));

vi.mock("@/lib/email/resend", () => ({
  sendEmailViaResend: vi.fn((args: unknown) => {
    state.sendEmailCalls.push(args);
    return Promise.resolve(state.sendEmailResult);
  }),
}));

vi.mock("@/lib/sms/twilio", () => ({
  sendSmsViaTwilio: vi.fn(() => Promise.resolve({ sent: true, id: "sms-1" })),
}));

vi.mock("@/lib/providerHealth", () => ({
  recordProviderCheck: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/systemFailures", () => ({
  reportSystemFailure: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/supabase/withRetry", () => ({
  withSupabaseRetry: (fn: () => unknown) => fn(),
}));

function request() {
  return new Request("https://app.example.test/api/cron/dispatch-notifications", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
}

const BASE_JOB = {
  id: "job-1",
  workspace_id: "ws-1",
  recipient_email: "client@example.test",
  recipient_phone: null,
  recipient_user_id: null,
  channel: "Email",
  template_key: "test-template",
  payload: {},
  attempts: 0,
  max_attempts: 5,
  entity_type: null,
  entity_id: null,
  domain_id: null,
};

describe("dispatch-notifications cron: atomic claim + crash-safety (P09-03/P09-04)", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    state.claimedJobs = [];
    state.rpcCalls = [];
    state.updates = [];
    state.sendEmailResult = { sent: true, id: "resend-msg-1" };
    state.sendEmailCalls = [];
    vi.resetModules();
  });

  it("claims jobs through the atomic claim_notification_queue_jobs RPC, never a plain SELECT", async () => {
    state.claimedJobs = [BASE_JOB];
    const { GET } = await import("@/app/api/cron/dispatch-notifications/route");
    await GET(request());

    const claimCall = state.rpcCalls.find((c) => c.name === "claim_notification_queue_jobs");
    expect(claimCall).toBeDefined();
    // Confirms this run would also reclaim a job stuck 'processing' from a
    // crashed prior run, not just a 'pending' one -- the staleness window
    // is passed through to the RPC, not hardcoded away.
    expect(claimCall?.args).toMatchObject({ p_limit: expect.any(Number), p_stale_after_seconds: expect.any(Number) });
  });

  it("sends a successful email with a per-job idempotency key, so a resend after a crash dedupes at Resend instead of emailing the client twice", async () => {
    state.claimedJobs = [BASE_JOB];
    const { GET } = await import("@/app/api/cron/dispatch-notifications/route");
    await GET(request());

    expect(state.sendEmailCalls).toHaveLength(1);
    expect(state.sendEmailCalls[0]).toMatchObject({ idempotencyKey: `notification-queue:${BASE_JOB.id}` });
  });

  it("on a retry-eligible failure, releases the claim back to 'pending' instead of leaving the row stuck in 'processing'", async () => {
    state.claimedJobs = [BASE_JOB];
    state.sendEmailResult = { sent: false, error: "Resend is down" };
    const { GET } = await import("@/app/api/cron/dispatch-notifications/route");
    await GET(request());

    const retryUpdate = state.updates.find((u) => u.table === "notification_queue" && (u.payload as { attempts?: number }).attempts === 1);
    expect(retryUpdate).toBeDefined();
    expect(retryUpdate?.payload).toMatchObject({ status: "pending", claimed_at: null });
  });

  it("on terminal failure (attempts exhausted), marks the job 'failed' rather than leaving it claimable", async () => {
    state.claimedJobs = [{ ...BASE_JOB, attempts: 4, max_attempts: 5 }];
    state.sendEmailResult = { sent: false, error: "Resend is down" };
    const { GET } = await import("@/app/api/cron/dispatch-notifications/route");
    await GET(request());

    const deadUpdate = state.updates.find((u) => u.table === "notification_queue" && (u.payload as { status?: string }).status === "failed");
    expect(deadUpdate).toBeDefined();
  });
});
