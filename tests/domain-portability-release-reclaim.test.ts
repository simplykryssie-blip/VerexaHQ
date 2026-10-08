// Customer-owned domain portability: a customer who connects their own
// domain must be able to leave Verexa and reconnect it elsewhere without
// contacting support. This proves the fixed paths:
//  - /api/email-domain/disconnect: no longer gated on an operational
//    workspace (release must work even when suspended), soft-releases via
//    release_workspace_email_domain instead of a hard delete.
//  - /api/email-domain/create: scopes its own-workspace "already has a
//    domain" check to active (non-released) claims, and maps the new
//    cross-tenant unique-index violation to a friendly error while rolling
//    back the Resend-side domain it just created.
//  - /api/websites/[id]/attach-domain DELETE: persists the release
//    server-side via release_website_custom_domain after Vercel succeeds.
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  workspace: { id: "ws-1", status: "active" } as { id: string; status: string } | null,
  canManageSettings: true,
  aal2Ok: true,
  existingDomainRow: null as { id: string; resend_domain_id: string } | null,
  rpcError: null as { message: string } | null,
  rpcCalls: [] as { name: string; args: unknown }[],
  deleteResendCalls: [] as string[],
  deleteResendOk: true,
  createResendResult: { ok: true, data: { id: "rd_new", status: "pending", records: [] } } as
    | { ok: true; data: { id: string; status: string; records: unknown[] } }
    | { ok: false; reason: string },
  existingDomainsForWorkspace: [] as { id: string }[],
  canUseMultipleSendingDomains: false,
  insertError: null as { message: string } | null,
  insertedRow: null as Record<string, unknown> | null,
  website: { id: "site-1", workspace_id: "ws-1", custom_domain: "customer-site.com" } as { id: string; workspace_id: string; custom_domain: string | null },
  removeProjectDomainCalls: 0,
  removeProjectDomainOk: true,
  vercelConfigured: true,
}));

function builder(result: { data: unknown; error?: unknown }) {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    is: () => b,
    maybeSingle: () => Promise.resolve({ data: result.data, error: result.error ?? null }),
    then: (resolve: (v: { data: unknown; error: unknown }) => unknown) => resolve({ data: result.data, error: result.error ?? null }),
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    rpc: (name: string, args: unknown) => {
      state.rpcCalls.push({ name, args });
      if (name === "has_permission") return Promise.resolve({ data: state.canManageSettings, error: null });
      if (name === "release_workspace_email_domain" || name === "release_website_custom_domain") {
        return Promise.resolve({ data: null, error: state.rpcError });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => {
      if (table === "workspace_email_domains") {
        return {
          select: () => builder({ data: state.existingDomainRow }),
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: () => {
                state.insertedRow = row;
                if (state.insertError) return Promise.resolve({ data: null, error: state.insertError });
                return Promise.resolve({ data: { id: "domain-new", ...row }, error: null });
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

vi.mock("@/lib/workspace", () => ({
  getCurrentWorkspace: () => Promise.resolve(state.workspace),
  isWorkspaceStatusOperational: (status: string) => status === "active",
  workspaceOperationalError: () => "This workspace is suspended.",
}));

vi.mock("@/lib/auth/requireAal2", () => ({
  hasAal2: () => Promise.resolve(state.aal2Ok),
  AAL2_REQUIRED_RESPONSE_BODY: { error: "Two-factor verification required.", code: "aal2_required" },
  AAL2_REQUIRED_STATUS: 403,
}));

vi.mock("@/lib/email/domains", () => ({
  deleteResendDomain: (id: string) => {
    state.deleteResendCalls.push(id);
    return Promise.resolve(state.deleteResendOk ? { ok: true, data: { deleted: true } } : { ok: false, reason: "resend error" });
  },
  createResendDomain: () => Promise.resolve(state.createResendResult),
}));

vi.mock("@/lib/workspaceCapabilities", () => ({
  canUseMultipleSendingDomains: () => state.canUseMultipleSendingDomains,
}));

vi.mock("@/lib/websites/auth", () => ({
  authorizedWebsite: () => Promise.resolve({ website: state.website }),
}));

vi.mock("@/lib/vercel/domains", () => ({
  addProjectDomain: () => Promise.resolve({ ok: true, data: { verified: true, verification: [] } }),
  removeProjectDomain: () => {
    state.removeProjectDomainCalls += 1;
    return Promise.resolve(state.removeProjectDomainOk ? { ok: true, data: { removed: true } } : { ok: false, reason: "vercel error" });
  },
}));

vi.mock("@/lib/providerStatus", () => ({
  isVercelDomainAutomationConfigured: () => state.vercelConfigured,
}));

beforeEach(() => {
  vi.resetModules();
  state.workspace = { id: "ws-1", status: "active" };
  state.canManageSettings = true;
  state.aal2Ok = true;
  state.existingDomainRow = { id: "domain-1", resend_domain_id: "rd_1" };
  state.rpcError = null;
  state.rpcCalls = [];
  state.deleteResendCalls = [];
  state.deleteResendOk = true;
  state.createResendResult = { ok: true, data: { id: "rd_new", status: "pending", records: [] } };
  state.existingDomainsForWorkspace = [];
  state.canUseMultipleSendingDomains = false;
  state.insertError = null;
  state.insertedRow = null;
  state.website = { id: "site-1", workspace_id: "ws-1", custom_domain: "customer-site.com" };
  state.removeProjectDomainCalls = 0;
  state.removeProjectDomainOk = true;
  state.vercelConfigured = true;
});

function disconnectRequest(body: unknown = {}) {
  return new Request("https://app.example.test/api/email-domain/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/email-domain/disconnect -- release, not delete (domain portability)", () => {
  it("still succeeds when the workspace is suspended -- release must not require an operational workspace", async () => {
    state.workspace = { id: "ws-1", status: "suspended" };
    const { POST } = await import("@/app/api/email-domain/disconnect/route");
    const res = await POST(disconnectRequest({ domainId: "domain-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("calls deleteResendDomain then release_workspace_email_domain -- never a hard delete", async () => {
    const { POST } = await import("@/app/api/email-domain/disconnect/route");
    await POST(disconnectRequest({ domainId: "domain-1" }));
    expect(state.deleteResendCalls).toEqual(["rd_1"]);
    const releaseCall = state.rpcCalls.find((c) => c.name === "release_workspace_email_domain");
    expect(releaseCall?.args).toEqual({ p_domain_id: "domain-1" });
  });

  it("surfaces a release RPC error (e.g. authorization failure) as a 500, not a silent success", async () => {
    state.rpcError = { message: "insufficient permissions to manage this workspace's integrations" };
    const { POST } = await import("@/app/api/email-domain/disconnect/route");
    const res = await POST(disconnectRequest({ domainId: "domain-1" }));
    expect(res.status).toBe(500);
  });

  it("still requires AAL2 -- suspension bypasses only the operational gate, not two-factor", async () => {
    state.aal2Ok = false;
    const { POST } = await import("@/app/api/email-domain/disconnect/route");
    const res = await POST(disconnectRequest({ domainId: "domain-1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("aal2_required");
    expect(state.deleteResendCalls).toHaveLength(0);
  });

  it("still requires settings.manage permission regardless of workspace status", async () => {
    state.canManageSettings = false;
    const { POST } = await import("@/app/api/email-domain/disconnect/route");
    const res = await POST(disconnectRequest({ domainId: "domain-1" }));
    expect(res.status).toBe(403);
  });
});

function createRequest(domain: string) {
  return new Request("https://app.example.test/api/email-domain/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain }),
  });
}

describe("POST /api/email-domain/create -- scoped to active claims (domain portability)", () => {
  it("allows adding a domain when the workspace's only existing row is already released", async () => {
    state.existingDomainRow = null; // the .is("released_at", null) scoped query finds nothing
    const { POST } = await import("@/app/api/email-domain/create/route");
    const res = await POST(createRequest("newfirm.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("maps a cross-tenant active-claim conflict to a friendly error and rolls back the Resend domain it just created", async () => {
    state.existingDomainRow = null;
    state.insertError = { message: 'duplicate key value violates unique constraint "workspace_email_domains_domain_active_unique"' };
    const { POST } = await import("@/app/api/email-domain/create/route");
    const res = await POST(createRequest("taken.com"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("That domain is already connected to another account.");
    expect(state.deleteResendCalls).toEqual(["rd_new"]);
  });

  it("passes through an unrelated insert error unchanged, without rolling back Resend", async () => {
    state.existingDomainRow = null;
    state.insertError = { message: "some other database error" };
    const { POST } = await import("@/app/api/email-domain/create/route");
    const res = await POST(createRequest("newfirm.com"));
    expect(res.status).toBe(500);
    expect(state.deleteResendCalls).toHaveLength(0);
  });
});

function deleteDomainRequest() {
  return new Request("https://app.example.test/api/websites/site-1/attach-domain", { method: "DELETE" });
}

describe("DELETE /api/websites/[id]/attach-domain -- persists the release server-side (domain portability)", () => {
  it("removes the Vercel project domain and persists the release via release_website_custom_domain", async () => {
    const { DELETE } = await import("@/app/api/websites/[id]/attach-domain/route");
    const res = await DELETE(deleteDomainRequest(), { params: { id: "site-1" } });
    expect(res.status).toBe(200);
    expect(state.removeProjectDomainCalls).toBe(1);
    const releaseCall = state.rpcCalls.find((c) => c.name === "release_website_custom_domain");
    expect(releaseCall?.args).toEqual({ p_website_id: "site-1" });
  });

  it("surfaces a release RPC error as a 500 rather than silently reporting removed:true", async () => {
    state.rpcError = { message: "insufficient permissions to manage this website" };
    const { DELETE } = await import("@/app/api/websites/[id]/attach-domain/route");
    const res = await DELETE(deleteDomainRequest(), { params: { id: "site-1" } });
    expect(res.status).toBe(500);
  });

  it("never calls the release RPC when there's no custom_domain set -- nothing to release", async () => {
    state.website = { id: "site-1", workspace_id: "ws-1", custom_domain: null };
    const { DELETE } = await import("@/app/api/websites/[id]/attach-domain/route");
    const res = await DELETE(deleteDomainRequest(), { params: { id: "site-1" } });
    expect(res.status).toBe(200);
    expect(state.removeProjectDomainCalls).toBe(0);
    expect(state.rpcCalls.find((c) => c.name === "release_website_custom_domain")).toBeUndefined();
  });

  it("still requires AAL2 before touching Vercel or persisting a release", async () => {
    state.aal2Ok = false;
    const { DELETE } = await import("@/app/api/websites/[id]/attach-domain/route");
    const res = await DELETE(deleteDomainRequest(), { params: { id: "site-1" } });
    expect(res.status).toBe(403);
    expect(state.removeProjectDomainCalls).toBe(0);
    expect(state.rpcCalls.find((c) => c.name === "release_website_custom_domain")).toBeUndefined();
  });
});
