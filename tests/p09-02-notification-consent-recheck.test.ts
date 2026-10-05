// P09-02: execute_automation_step checks clients.sms_opt_out/email_opt_out
// only once, at the moment a notification is enqueued into
// notification_queue. dispatch-notifications (this cron) is what actually
// calls the provider, and a queued job can sit for a while (scheduled
// sends, retry backoff) before that happens -- a client who opts out in
// the meantime must not still receive the message just because the
// one-time enqueue-time check already passed.
//
// This exercises the real route handler (the exported `GET`, wrapped in
// withJobLogging exactly as Vercel invokes it) against a mocked Supabase
// client, proving the real control flow: the provider is never called for
// an opted-out client, the job is dead-lettered (not retried), a
// staff-facing job (recipient_user_id set, no client) is unaffected, and a
// billing-recovery template still goes out regardless -- mirroring the
// existing workspace-suspension exemption already in this file.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  jobs: [] as Array<Record<string, unknown>>,
  engagementRows: [] as Array<{ id: string; client_id: string | null }>,
  clientOptOutRows: [] as Array<{ id: string; sms_opt_out: boolean; email_opt_out: boolean }>,
  emailTemplateRows: [] as Array<Record<string, unknown>>,
  smsTemplateRows: [] as Array<Record<string, unknown>>,
  workspaceRows: [] as Array<{ id: string; status: string }>,
  updatedJobs: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  emailSent: [] as Array<{ to: string }>,
  smsSent: [] as Array<{ to: string }>,
}));

function resetState() {
  state.jobs = [];
  state.engagementRows = [];
  state.clientOptOutRows = [];
  state.emailTemplateRows = [];
  state.smsTemplateRows = [];
  state.workspaceRows = [{ id: "ws-1", status: "active" }];
  state.updatedJobs = [];
  state.emailSent = [];
  state.smsSent = [];
}

function thenable<T>(value: T) {
  return { then: (resolve: (v: T) => unknown) => resolve(value) };
}

// A no-op builder for tables this test doesn't assert on (email_log,
// sms_log, messages, message_threads): every chain method returns the
// same builder, and every terminal resolves to an empty-but-valid result,
// however many .eq()/.order()/.limit() calls the real route chains.
function genericBuilder(): Record<string, unknown> {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    insert: () => builder,
    update: () => builder,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: { id: "row-1" }, error: null }),
    then: (resolve: (v: { data: null; error: null }) => unknown) => resolve({ data: null, error: null }),
  };
  return builder;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: (name: string) => {
      // P09-03: the cron claims jobs atomically via this RPC instead of a
      // plain SELECT -- see claim_notification_queue_jobs. Every other RPC
      // this route calls (record_provider_check, via recordProviderCheck)
      // is mocked at the module level above, so nothing else reaches here.
      if (name === "claim_notification_queue_jobs") return Promise.resolve({ data: state.jobs, error: null });
      throw new Error(`unexpected rpc in test: ${name}`);
    },
    from: (table: string) => {
      if (table === "notification_queue") {
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => {
              state.updatedJobs.push({ id, patch });
              return thenable({ data: null, error: null });
            },
          }),
        };
      }
      if (table === "engagements") {
        return { select: () => ({ in: () => thenable({ data: state.engagementRows, error: null }) }) };
      }
      if (table === "client_portal_users") {
        return {
          select: () => ({
            in: () => ({
              eq: () => ({
                order: () => thenable({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "clients") {
        return { select: () => ({ in: () => thenable({ data: state.clientOptOutRows, error: null }) }) };
      }
      if (table === "email_templates") {
        return {
          select: () => ({
            in: () => ({
              eq: () => ({
                or: () => thenable({ data: state.emailTemplateRows, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "sms_templates") {
        return {
          select: () => ({
            in: () => ({
              eq: () => ({
                or: () => thenable({ data: state.smsTemplateRows, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "workspaces") {
        return { select: () => ({ in: () => thenable({ data: state.workspaceRows, error: null }) }) };
      }
      if (table === "draft_saves") {
        return { select: () => ({ eq: () => ({ lte: () => thenable({ data: [], error: null }) }) }) };
      }
      if (table === "email_log" || table === "sms_log" || table === "messages" || table === "message_threads") {
        return genericBuilder();
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

vi.mock("@/lib/email/resend", () => ({
  sendEmailViaResend: (args: { to: string }) => {
    state.emailSent.push({ to: args.to });
    return Promise.resolve({ sent: true, id: "email-1" });
  },
}));

vi.mock("@/lib/sms/twilio", () => ({
  sendSmsViaTwilio: (args: { to: string }) => {
    state.smsSent.push({ to: args.to });
    return Promise.resolve({ sent: true, id: "sms-1" });
  },
}));

vi.mock("@/lib/providerHealth", () => ({
  recordProviderCheck: vi.fn(() => Promise.resolve()),
}));

function makeEmailJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "job-1",
    workspace_id: "ws-1",
    recipient_email: "client@example.test",
    recipient_phone: null,
    recipient_user_id: null,
    channel: "Email",
    template_key: "appointment-reminder",
    payload: {},
    attempts: 0,
    max_attempts: 3,
    entity_type: "client",
    entity_id: "client-1",
    ...overrides,
  };
}

function makeSmsJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "job-2",
    workspace_id: "ws-1",
    recipient_email: null,
    recipient_phone: "+15551234567",
    recipient_user_id: null,
    channel: "SMS",
    template_key: "appointment-reminder",
    payload: {},
    attempts: 0,
    max_attempts: 3,
    entity_type: "client",
    entity_id: "client-1",
    ...overrides,
  };
}

async function callRoute() {
  const { GET } = await import("@/app/api/cron/dispatch-notifications/route");
  const response = await GET(
    new Request("https://example.com/api/cron/dispatch-notifications", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
  );
  return { response, body: await response.json() };
}

beforeEach(() => {
  vi.resetModules();
  resetState();
  process.env.CRON_SECRET = "test-secret";
  state.emailTemplateRows = [{ slug: "appointment-reminder", workspace_id: null, subject: "Reminder", body_html: "<p>Hi</p>", banner_image_url: null, custom_css: null }];
  state.smsTemplateRows = [{ slug: "appointment-reminder", workspace_id: null, body: "Reminder text" }];
});

describe("dispatch-notifications -- consent recheck before send (P09-02)", () => {
  it("never calls the email provider for a client who opted out of email after the job was enqueued", async () => {
    state.jobs = [makeEmailJob()];
    state.clientOptOutRows = [{ id: "client-1", sms_opt_out: false, email_opt_out: true }];

    const { body } = await callRoute();

    expect(state.emailSent).toHaveLength(0);
    expect(body.failed).toBe(0);
    expect(body.sent).toBe(0);
    expect(state.updatedJobs).toEqual([{ id: "job-1", patch: { status: "failed", error: "client has opted out of this channel since the job was enqueued" } }]);
  });

  it("never calls the SMS provider for a client who opted out of SMS after the job was enqueued", async () => {
    state.jobs = [makeSmsJob()];
    state.clientOptOutRows = [{ id: "client-1", sms_opt_out: true, email_opt_out: false }];

    const { body } = await callRoute();

    expect(state.smsSent).toHaveLength(0);
    expect(body.sent).toBe(0);
    expect(state.updatedJobs[0].patch.error).toMatch(/opted out/i);
  });

  it("dead-letters the opted-out job rather than scheduling a retry", async () => {
    state.jobs = [makeEmailJob()];
    state.clientOptOutRows = [{ id: "client-1", sms_opt_out: false, email_opt_out: true }];

    await callRoute();

    expect(state.updatedJobs).toHaveLength(1);
    expect(state.updatedJobs[0].patch).not.toHaveProperty("scheduled_at");
    expect(state.updatedJobs[0].patch).not.toHaveProperty("attempts");
  });

  it("still sends when the client has not opted out", async () => {
    state.jobs = [makeEmailJob()];
    state.clientOptOutRows = [{ id: "client-1", sms_opt_out: false, email_opt_out: false }];

    const { body } = await callRoute();

    expect(state.emailSent).toHaveLength(1);
    expect(body.sent).toBe(1);
  });

  it("still sends when the client is opted out of the OTHER channel (email opt-out doesn't block SMS)", async () => {
    state.jobs = [makeSmsJob()];
    state.clientOptOutRows = [{ id: "client-1", sms_opt_out: false, email_opt_out: true }];

    const { body } = await callRoute();

    expect(state.smsSent).toHaveLength(1);
    expect(body.sent).toBe(1);
  });

  it("does not apply the client opt-out check to a staff-facing job with no client (recipient_user_id set)", async () => {
    state.jobs = [makeEmailJob({ recipient_user_id: "staff-1", entity_type: null, entity_id: null })];
    state.clientOptOutRows = [];

    const { body } = await callRoute();

    expect(state.emailSent).toHaveLength(1);
    expect(body.sent).toBe(1);
  });

  it("still sends a billing-recovery notice even to a client who has opted out, mirroring the existing suspension exemption", async () => {
    state.jobs = [makeEmailJob({ template_key: "billing-payment-failed" })];
    state.clientOptOutRows = [{ id: "client-1", sms_opt_out: false, email_opt_out: true }];
    state.emailTemplateRows = [{ slug: "billing-payment-failed", workspace_id: null, subject: "Payment failed", body_html: "<p>Pay</p>", banner_image_url: null, custom_css: null }];

    const { body } = await callRoute();

    expect(state.emailSent).toHaveLength(1);
    expect(body.sent).toBe(1);
  });
});
