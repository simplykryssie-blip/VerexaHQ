// P09-05: /api/email/send and /api/sms/send (the staff-initiated "direct
// send" UI) called the provider directly and returned the result to the
// browser, but never wrote an email_log/sms_log row. Resend's and
// Twilio's delivery-status webhooks correlate purely by provider_reference
// against those tables (see app/api/resend/webhook, app/api/twilio/webhook)
// -- with no row to match, a bounce/delivery/failure event for a direct
// send was silently dropped. These tests prove the fix: a log row is
// written with the real provider_reference on both success and failure,
// and only when there's a workspace to attribute it to.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  workspace: { id: "ws-1", status: "active" } as { id: string; status: string } | null,
  sendEmailResult: { sent: true, id: "resend-msg-1" } as { sent: boolean; id?: string; error?: string; reason?: string },
  sendSmsResult: { sent: true, id: "twilio-sid-1" } as { sent: boolean; id?: string; error?: string; reason?: string },
  inserts: [] as { table: string; row: Record<string, unknown> }[],
}));

vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: vi.fn(() => Promise.resolve(true)) }));
vi.mock("@/lib/providerHealth", () => ({ recordProviderCheck: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/email/resend", () => ({
  sendEmailViaResend: vi.fn(() => Promise.resolve(state.sendEmailResult)),
  SYSTEM_SENDERS: { noreply: "noreply@verexahq.com" },
}));
vi.mock("@/lib/sms/twilio", () => ({ sendSmsViaTwilio: vi.fn(() => Promise.resolve(state.sendSmsResult)) }));
vi.mock("@/lib/workspace", () => ({
  getCurrentWorkspace: vi.fn(() => Promise.resolve(state.workspace)),
  isWorkspaceStatusOperational: vi.fn((status: string) => status === "active"),
  workspaceOperationalError: vi.fn(() => "Workspace is not operational"),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: state.user } }) },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { display_name: "Staff Member" } }) }) }),
      insert: (row: Record<string, unknown>) => {
        state.inserts.push({ table, row });
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }),
}));

function request(body: unknown) {
  return new Request("https://app.example.test/api/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.user = { id: "user-1" };
  state.workspace = { id: "ws-1", status: "active" };
  state.sendEmailResult = { sent: true, id: "resend-msg-1" };
  state.sendSmsResult = { sent: true, id: "twilio-sid-1" };
  state.inserts = [];
  vi.resetModules();
});

describe("/api/email/send: email_log correlation (P09-05)", () => {
  it("logs a successful send with the real provider_reference", async () => {
    const { POST } = await import("@/app/api/email/send/route");
    await POST(request({ to: "client@example.test", subject: "Hi", html: "<p>Hi</p>" }));

    const logged = state.inserts.find((i) => i.table === "email_log");
    expect(logged).toBeDefined();
    expect(logged?.row).toMatchObject({
      workspace_id: "ws-1",
      recipient_email: "client@example.test",
      status: "sent",
      provider_reference: "resend-msg-1",
    });
  });

  it("logs a failed send with the failure reason, so the UI/ops can see it without a webhook ever arriving", async () => {
    state.sendEmailResult = { sent: false, error: "Resend responded with 422" };
    const { POST } = await import("@/app/api/email/send/route");
    await POST(request({ to: "client@example.test", subject: "Hi", html: "<p>Hi</p>" }));

    const logged = state.inserts.find((i) => i.table === "email_log");
    expect(logged?.row).toMatchObject({ status: "failed", failed_reason: "Resend responded with 422", provider_reference: null });
  });

  it("does not attempt to log when there is no current workspace to attribute it to", async () => {
    state.workspace = null;
    const { POST } = await import("@/app/api/email/send/route");
    await POST(request({ to: "client@example.test", subject: "Hi", html: "<p>Hi</p>" }));

    expect(state.inserts.find((i) => i.table === "email_log")).toBeUndefined();
  });

  it("does not log a non-attempt (provider not configured for this environment)", async () => {
    state.sendEmailResult = { sent: false, reason: "Email provider is not configured for this environment." };
    const { POST } = await import("@/app/api/email/send/route");
    await POST(request({ to: "client@example.test", subject: "Hi", html: "<p>Hi</p>" }));

    expect(state.inserts.find((i) => i.table === "email_log")).toBeUndefined();
  });
});

describe("/api/sms/send: sms_log correlation (P09-05)", () => {
  it("logs a successful send with the real provider_reference", async () => {
    const { POST } = await import("@/app/api/sms/send/route");
    await POST(request({ to: "+15551234567", body: "Hi there" }));

    const logged = state.inserts.find((i) => i.table === "sms_log");
    expect(logged?.row).toMatchObject({
      workspace_id: "ws-1",
      recipient_phone: "+15551234567",
      body: "Hi there",
      status: "sent",
      provider_reference: "twilio-sid-1",
    });
  });

  it("logs a failed send with the failure reason", async () => {
    state.sendSmsResult = { sent: false, error: "Twilio responded with 400" };
    const { POST } = await import("@/app/api/sms/send/route");
    await POST(request({ to: "+15551234567", body: "Hi there" }));

    const logged = state.inserts.find((i) => i.table === "sms_log");
    expect(logged?.row).toMatchObject({ status: "failed", failed_reason: "Twilio responded with 400", provider_reference: null });
  });

  it("does not attempt to log when there is no current workspace", async () => {
    state.workspace = null;
    const { POST } = await import("@/app/api/sms/send/route");
    await POST(request({ to: "+15551234567", body: "Hi there" }));

    expect(state.inserts.find((i) => i.table === "sms_log")).toBeUndefined();
  });
});
