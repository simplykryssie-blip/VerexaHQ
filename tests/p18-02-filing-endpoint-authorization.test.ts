// P18-02 / P10-02 / P12-02: both /api/documents/file-signed-engagement-letter
// and /api/documents/file-organizer-response previously accepted a bare,
// caller-supplied id (signatureId / responseId) and performed service-role
// mutations (PDF generation, storage upload, new attachment insert) with no
// check at all that the caller had any legitimate claim to that record --
// any caller who learned or guessed an id for ANY workspace's record could
// trigger the filing pipeline for it. This proves the fix for both:
// file-signed-engagement-letter now requires the same public_token the
// signer's own /e/[token] page required, resolved server-side and checked
// against the signature's own template/workspace; file-organizer-response
// accepts either that same token pattern OR an authenticated session that
// is either the response's own portal client or a member of its workspace.
import { describe, expect, it, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  rateLimitOk: true,
  templateRow: null as Record<string, unknown> | null,
  signatureRow: null as Record<string, unknown> | null,
  orgTemplateRow: null as Record<string, unknown> | null,
  responseRow: null as Record<string, unknown> | null,
  authUser: null as { id: string } | null,
  isPortalOwner: false,
  isStaffMember: false,
  getUserCalls: 0,
}));

function resultFor(table: string): { data: unknown; error: unknown } {
  switch (table) {
    case "engagement_letter_templates":
      return { data: state.templateRow, error: null };
    case "engagement_letter_public_signatures":
      return { data: state.signatureRow, error: null };
    case "organizer_templates":
      return { data: state.orgTemplateRow, error: null };
    case "organizer_responses":
      return { data: state.responseRow, error: null };
    default:
      return { data: null, error: null };
  }
}

function makeBuilder(table: string) {
  const builder: PromiseLike<{ data: unknown; error: unknown }> & Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    is: () => builder,
    insert: () => builder,
    update: () => builder,
    maybeSingle: () => Promise.resolve(resultFor(table)),
    then: (resolve: (v: { data: unknown; error: unknown }) => unknown) => {
      if (table === "organizer_response_answers") return resolve({ data: [], error: null });
      return resolve({ data: null, error: null });
    },
  } as never;
  return builder;
}

function fakeServiceClient() {
  return {
    rpc: vi.fn((name: string) => {
      if (name === "check_rate_limit") return Promise.resolve({ data: state.rateLimitOk, error: null });
      return Promise.resolve({ data: null, error: null });
    }),
    from: (table: string) => ({
      select: () => makeBuilder(table),
      insert: () => makeBuilder(table),
      update: () => makeBuilder(table),
    }),
    storage: {
      from: () => ({
        download: () => Promise.resolve({ data: null, error: null }),
        upload: () => Promise.resolve({ error: null }),
      }),
    },
  };
}

function fakeSessionClient() {
  return {
    auth: {
      getUser: vi.fn(() => {
        state.getUserCalls++;
        return Promise.resolve({ data: { user: state.authUser } });
      }),
    },
    rpc: vi.fn((name: string) => {
      if (name === "is_portal_user_for_entity") return Promise.resolve({ data: state.isPortalOwner, error: null });
      if (name === "is_workspace_member") return Promise.resolve({ data: state.isStaffMember, error: null });
      return Promise.resolve({ data: false, error: null });
    }),
  };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => fakeServiceClient() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => fakeSessionClient() }));

function letterRequest(body: unknown) {
  return new Request("https://app.example.test/api/documents/file-signed-engagement-letter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function organizerRequest(body: unknown) {
  return new Request("https://app.example.test/api/documents/file-organizer-response", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function signatureFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "sig-1",
    workspace_id: "ws-1",
    client_id: "client-1",
    engagement_letter_template_id: "template-1",
    resolved_body_html: "<p>Agreed terms.</p>",
    filed_as_attachment: false,
    signature_type: "typed",
    signature_image_path: null,
    typed_name: "Jane Doe",
    signer_name: "Jane Doe",
    signed_at: "2026-10-01T00:00:00Z",
    engagement_letter_templates: { name: "Engagement Letter", banner_image_url: null },
    ...overrides,
  };
}

function responseFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "resp-1",
    workspace_id: "ws-1",
    client_id: "client-1",
    organizer_template_id: "org-template-1",
    status: "submitted",
    submitted_at: "2026-10-01T00:00:00Z",
    filed_as_attachment: false,
    organizer_templates: { name: "Intake Form" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  state.rateLimitOk = true;
  state.templateRow = null;
  state.signatureRow = null;
  state.orgTemplateRow = null;
  state.responseRow = null;
  state.authUser = null;
  state.isPortalOwner = false;
  state.isStaffMember = false;
  state.getUserCalls = 0;
});

describe("POST /api/documents/file-signed-engagement-letter -- authorization (P18-02/P10-02/P12-02)", () => {
  it("rejects a bare signatureId with no token at all", async () => {
    state.signatureRow = signatureFixture();
    const { POST } = await import("@/app/api/documents/file-signed-engagement-letter/route");
    const res = await POST(letterRequest({ signatureId: "sig-1" }));
    expect(res.status).toBe(400);
  });

  it("rejects a token that does not resolve to any published public engagement letter template", async () => {
    state.templateRow = null;
    state.signatureRow = signatureFixture();
    const { POST } = await import("@/app/api/documents/file-signed-engagement-letter/route");
    const res = await POST(letterRequest({ signatureId: "sig-1", token: "bogus-token" }));
    expect(res.status).toBe(404);
  });

  it("rejects a real token belonging to a DIFFERENT template than the one the signature was taken against (cross-tenant)", async () => {
    state.templateRow = { id: "template-victim", workspace_id: "ws-victim" };
    state.signatureRow = signatureFixture({ engagement_letter_template_id: "template-1", workspace_id: "ws-1" });
    const { POST } = await import("@/app/api/documents/file-signed-engagement-letter/route");
    const res = await POST(letterRequest({ signatureId: "sig-1", token: "someone-elses-token" }));
    expect(res.status).toBe(404);
  });

  it("rejects a signatureId that does not exist, even with a valid token", async () => {
    state.templateRow = { id: "template-1", workspace_id: "ws-1" };
    state.signatureRow = null;
    const { POST } = await import("@/app/api/documents/file-signed-engagement-letter/route");
    const res = await POST(letterRequest({ signatureId: "does-not-exist", token: "share-token-1" }));
    expect(res.status).toBe(404);
  });

  it("allows filing when the token resolves to the exact template the signature was taken against", async () => {
    state.templateRow = { id: "template-1", workspace_id: "ws-1" };
    state.signatureRow = signatureFixture();
    const { POST } = await import("@/app/api/documents/file-signed-engagement-letter/route");
    const res = await POST(letterRequest({ signatureId: "sig-1", token: "share-token-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

describe("POST /api/documents/file-organizer-response -- authorization (P18-02/P10-02/P12-02)", () => {
  it("rejects an unauthenticated caller with no token at all", async () => {
    state.responseRow = responseFixture();
    state.authUser = null;
    const { POST } = await import("@/app/api/documents/file-organizer-response/route");
    const res = await POST(organizerRequest({ responseId: "resp-1" }));
    expect(res.status).toBe(401);
  });

  it("rejects an authenticated caller who is neither the response's portal owner nor a member of its workspace (cross-tenant)", async () => {
    state.responseRow = responseFixture();
    state.authUser = { id: "attacker" };
    state.isPortalOwner = false;
    state.isStaffMember = false;
    const { POST } = await import("@/app/api/documents/file-organizer-response/route");
    const res = await POST(organizerRequest({ responseId: "resp-1" }));
    expect(res.status).toBe(403);
  });

  it("allows an authenticated portal owner of the response's own client to file it (no token needed)", async () => {
    state.responseRow = responseFixture();
    state.authUser = { id: "client-portal-user" };
    state.isPortalOwner = true;
    state.isStaffMember = false;
    const { POST } = await import("@/app/api/documents/file-organizer-response/route");
    const res = await POST(organizerRequest({ responseId: "resp-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("allows an authenticated staff member of the response's own workspace to file it (no token needed)", async () => {
    state.responseRow = responseFixture();
    state.authUser = { id: "staff-user" };
    state.isPortalOwner = false;
    state.isStaffMember = true;
    const { POST } = await import("@/app/api/documents/file-organizer-response/route");
    const res = await POST(organizerRequest({ responseId: "resp-1" }));
    expect(res.status).toBe(200);
  });

  it("rejects a token that does not resolve to any published public organizer template", async () => {
    state.responseRow = responseFixture();
    state.orgTemplateRow = null;
    const { POST } = await import("@/app/api/documents/file-organizer-response/route");
    const res = await POST(organizerRequest({ responseId: "resp-1", token: "bogus-token" }));
    expect(res.status).toBe(404);
    expect(state.getUserCalls).toBe(0);
  });

  it("rejects a real token belonging to a DIFFERENT organizer template than the one the response was submitted against (cross-tenant)", async () => {
    state.responseRow = responseFixture({ organizer_template_id: "org-template-1", workspace_id: "ws-1" });
    state.orgTemplateRow = { id: "org-template-victim", workspace_id: "ws-victim" };
    const { POST } = await import("@/app/api/documents/file-organizer-response/route");
    const res = await POST(organizerRequest({ responseId: "resp-1", token: "someone-elses-token" }));
    expect(res.status).toBe(404);
  });

  it("allows filing via a valid public intake token, independent of any session", async () => {
    state.responseRow = responseFixture();
    state.orgTemplateRow = { id: "org-template-1", workspace_id: "ws-1" };
    state.authUser = null;
    const { POST } = await import("@/app/api/documents/file-organizer-response/route");
    const res = await POST(organizerRequest({ responseId: "resp-1", token: "public-intake-token" }));
    expect(res.status).toBe(200);
    expect(state.getUserCalls).toBe(0);
  });

  it("rejects a responseId that does not exist", async () => {
    state.responseRow = null;
    const { POST } = await import("@/app/api/documents/file-organizer-response/route");
    const res = await POST(organizerRequest({ responseId: "does-not-exist" }));
    expect(res.status).toBe(404);
  });
});
