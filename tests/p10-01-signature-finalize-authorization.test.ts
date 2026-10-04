// P10-01 / P18-01; P16-01: /api/sign/finalize accepted a bare, caller-
// supplied signatureRequestId and performed service-role mutations (final
// PDF generation, storage upload, new attachment insert) with no check at
// all that the caller was the signer (no token) or an authorized staff
// member of that request's own workspace -- any caller who learned or
// guessed a signatureRequestId for ANY workspace's completed-but-unfiled
// request could trigger those mutations. The token path (the public
// signer's own proof of access, used by PublicSignView.tsx) is untouched;
// only the bare-id path (used by the authenticated SignaturesPanel.tsx)
// now requires a real session with 'signatures.request' permission on the
// request's own workspace before any mutation runs.
import { describe, expect, it, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  rateLimitOk: true,
  signerByToken: {} as Record<string, { signature_request_id: string } | undefined>,
  sigRequestsById: {} as Record<string, Record<string, unknown> | undefined>,
  authUser: null as { id: string } | null,
  hasPermissionResult: { data: false, error: null } as { data: unknown; error: unknown },
  getUserCalls: 0,
  hasPermissionCalls: 0,
}));

function serviceClient() {
  return {
    rpc: vi.fn(() => Promise.resolve({ data: state.rateLimitOk, error: null })),
    from: (table: string) => {
      if (table === "signature_request_signers") {
        return {
          select: () => ({
            eq: (_col: string, token: string) => ({
              maybeSingle: () => Promise.resolve({ data: state.signerByToken[token] ?? null, error: null }),
            }),
          }),
        };
      }
      if (table === "signature_requests") {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              maybeSingle: () => Promise.resolve({ data: state.sigRequestsById[id] ?? null, error: null }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
    },
  };
}

function sessionClient() {
  return {
    auth: {
      getUser: vi.fn(() => {
        state.getUserCalls++;
        return Promise.resolve({ data: { user: state.authUser } });
      }),
    },
    rpc: vi.fn(() => {
      state.hasPermissionCalls++;
      return Promise.resolve(state.hasPermissionResult);
    }),
  };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => serviceClient() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => sessionClient() }));

function makeRequest(body: unknown) {
  return new Request("https://app.example.test/api/sign/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function pendingRequest(workspaceId: string) {
  return { id: "req", workspace_id: workspaceId, attachment_id: "att", status: "pending", final_pdf_attachment_id: null, title: "Doc" };
}

describe("POST /api/sign/finalize -- authorization (P10-01/P18-01/P16-01)", () => {
  beforeEach(() => {
    vi.resetModules();
    state.rateLimitOk = true;
    state.signerByToken = {};
    state.sigRequestsById = {};
    state.authUser = null;
    state.hasPermissionResult = { data: false, error: null };
    state.getUserCalls = 0;
    state.hasPermissionCalls = 0;
  });

  it("requires either token or signatureRequestId (existing behavior preserved)", async () => {
    const { POST } = await import("@/app/api/sign/finalize/route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("rejects a bare signatureRequestId from an unauthenticated caller", async () => {
    state.sigRequestsById["req-1"] = pendingRequest("ws-1");
    state.authUser = null;
    const { POST } = await import("@/app/api/sign/finalize/route");
    const res = await POST(makeRequest({ signatureRequestId: "req-1" }));
    expect(res.status).toBe(401);
  });

  it("rejects a bare signatureRequestId from an authenticated caller who lacks signatures.request permission on that request's workspace (cross-tenant)", async () => {
    state.sigRequestsById["req-2"] = pendingRequest("ws-victim");
    state.authUser = { id: "user-attacker" };
    state.hasPermissionResult = { data: false, error: null };
    const { POST } = await import("@/app/api/sign/finalize/route");
    const res = await POST(makeRequest({ signatureRequestId: "req-2" }));
    expect(res.status).toBe(403);
    expect(state.hasPermissionCalls).toBeGreaterThan(0);
  });

  it("allows a bare signatureRequestId from an authenticated caller who has signatures.request permission on the request's own workspace", async () => {
    state.sigRequestsById["req-3"] = pendingRequest("ws-3");
    state.authUser = { id: "staff-1" };
    state.hasPermissionResult = { data: true, error: null };
    const { POST } = await import("@/app/api/sign/finalize/route");
    const res = await POST(makeRequest({ signatureRequestId: "req-3" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.notYetComplete).toBe(true);
  });

  it("does not require a session at all when a valid signer token is supplied (public signer flow untouched)", async () => {
    state.signerByToken["tok-1"] = { signature_request_id: "req-4" };
    state.sigRequestsById["req-4"] = pendingRequest("ws-4");
    const { POST } = await import("@/app/api/sign/finalize/route");
    const res = await POST(makeRequest({ token: "tok-1" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.notYetComplete).toBe(true);
    expect(state.getUserCalls).toBe(0);
    expect(state.hasPermissionCalls).toBe(0);
  });

  it("stays idempotent for an already-filed request once authorized", async () => {
    state.sigRequestsById["req-5"] = {
      id: "req-5",
      workspace_id: "ws-5",
      attachment_id: "att-5",
      status: "completed",
      final_pdf_attachment_id: "pdf-already",
      title: "Doc",
    };
    state.authUser = { id: "staff-2" };
    state.hasPermissionResult = { data: true, error: null };
    const { POST } = await import("@/app/api/sign/finalize/route");
    const res = await POST(makeRequest({ signatureRequestId: "req-5" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.alreadyFiled).toBe(true);
  });

  it("returns 404 for an unknown signatureRequestId", async () => {
    const { POST } = await import("@/app/api/sign/finalize/route");
    const res = await POST(makeRequest({ signatureRequestId: "does-not-exist" }));
    expect(res.status).toBe(404);
  });

  it("is rate limited (existing behavior preserved)", async () => {
    state.rateLimitOk = false;
    const { POST } = await import("@/app/api/sign/finalize/route");
    const res = await POST(makeRequest({ signatureRequestId: "req-x" }));
    expect(res.status).toBe(429);
  });
});
