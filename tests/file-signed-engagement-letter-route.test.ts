import { describe, expect, it, vi, beforeEach } from "vitest";

// VEREXA SSRF (banner image, Session 104): route-level proof that a
// malicious engagement_letter_templates.banner_image_url cannot cause
// app/api/documents/file-signed-engagement-letter to make an outbound
// connection to an internal/metadata destination. The network layer itself
// (node:http/node:https .request) is wrapped -- not mocked away -- so a
// real connection attempt would still be observable; the assertion is that
// the wrapped request function is never called, not just that some
// higher-level wrapper "would have" blocked it. (vitest can't spy on a
// live ESM named export directly -- "Module namespace is not
// configurable" -- so the count is tracked via vi.mock instead.)
//
// No real request is made to any internal infrastructure or cloud
// metadata service in this test.

const state = vi.hoisted(() => ({
  signatureRow: null as Record<string, unknown> | null,
  templateRow: null as Record<string, unknown> | null,
  rpcResult: { data: true, error: null } as { data: unknown; error: unknown },
  uploadError: null as { message: string } | null,
  insertError: null as { message: string } | null,
  httpRequestCalls: 0,
  httpsRequestCalls: 0,
}));

vi.mock("node:http", async () => {
  const actual = await vi.importActual<typeof import("node:http")>("node:http");
  return {
    ...actual,
    default: actual,
    request: (...args: Parameters<typeof actual.request>) => {
      state.httpRequestCalls++;
      return actual.request(...args);
    },
  };
});

vi.mock("node:https", async () => {
  const actual = await vi.importActual<typeof import("node:https")>("node:https");
  return {
    ...actual,
    default: actual,
    request: (...args: Parameters<typeof actual.request>) => {
      state.httpsRequestCalls++;
      return actual.request(...args);
    },
  };
});

function makeBuilder(mode: { kind: "select" | "insert" | "update"; table: string }) {
  const builder: PromiseLike<{ data: unknown; error: unknown }> & Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    insert: () => builder,
    update: () => builder,
    maybeSingle: () => {
      if (mode.table === "engagement_letter_public_signatures") return Promise.resolve({ data: state.signatureRow, error: null });
      if (mode.table === "engagement_letter_templates") return Promise.resolve({ data: state.templateRow, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: { data: unknown; error: unknown }) => unknown) => {
      if (mode.kind === "insert") return resolve({ data: null, error: state.insertError });
      if (mode.kind === "update") return resolve({ data: null, error: null });
      return resolve({ data: null, error: null });
    },
  } as never;
  return builder;
}

function fakeSupabase() {
  return {
    rpc: vi.fn(() => Promise.resolve(state.rpcResult)),
    from: (table: string) => ({
      select: () => makeBuilder({ kind: "select", table }),
      insert: () => makeBuilder({ kind: "insert", table }),
      update: () => makeBuilder({ kind: "update", table }),
    }),
    storage: {
      from: (_bucket: string) => ({
        download: vi.fn(() => Promise.resolve({ data: null, error: null })),
        upload: vi.fn(() => Promise.resolve({ error: state.uploadError })),
      }),
    },
  };
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => fakeSupabase(),
}));

function request(body: unknown) {
  return new Request("https://app.example.test/api/documents/file-signed-engagement-letter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/documents/file-signed-engagement-letter -- SSRF protection", () => {
  beforeEach(() => {
    vi.resetModules();
    state.uploadError = null;
    state.insertError = null;
    state.rpcResult = { data: true, error: null };
    state.httpRequestCalls = 0;
    state.httpsRequestCalls = 0;
    state.templateRow = { id: "template-1", workspace_id: "ws-1" };
  });

  it("never opens a connection for a poisoned banner_image_url pointing at cloud metadata, and still files the document", async () => {
    state.signatureRow = {
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
      engagement_letter_templates: { name: "Engagement Letter", banner_image_url: "http://169.254.169.254/latest/meta-data/iam/security-credentials/" },
    };

    const { POST } = await import("@/app/api/documents/file-signed-engagement-letter/route");
    const res = await POST(request({ signatureId: "sig-1", token: "share-token-1" }));

    expect(state.httpRequestCalls).toBe(0);
    expect(state.httpsRequestCalls).toBe(0);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("never opens a connection for a poisoned banner_image_url pointing at a private/loopback address", async () => {
    state.signatureRow = {
      id: "sig-2",
      workspace_id: "ws-1",
      client_id: "client-1",
      engagement_letter_template_id: "template-1",
      resolved_body_html: "<p>Agreed terms.</p>",
      filed_as_attachment: false,
      signature_type: "typed",
      signature_image_path: null,
      typed_name: "John Roe",
      signer_name: "John Roe",
      signed_at: "2026-10-01T00:00:00Z",
      engagement_letter_templates: { name: "Engagement Letter", banner_image_url: "http://127.0.0.1:8080/admin" },
    };

    const { POST } = await import("@/app/api/documents/file-signed-engagement-letter/route");
    const res = await POST(request({ signatureId: "sig-2", token: "share-token-1" }));

    expect(state.httpRequestCalls).toBe(0);
    expect(state.httpsRequestCalls).toBe(0);
    expect(res.status).toBe(200);
  });

  it("does not attempt any banner fetch at all when the template has no banner configured", async () => {
    state.signatureRow = {
      id: "sig-3",
      workspace_id: "ws-1",
      client_id: "client-1",
      engagement_letter_template_id: "template-1",
      resolved_body_html: "<p>Agreed terms.</p>",
      filed_as_attachment: false,
      signature_type: "typed",
      signature_image_path: null,
      typed_name: "No Banner",
      signer_name: "No Banner",
      signed_at: "2026-10-01T00:00:00Z",
      engagement_letter_templates: { name: "Engagement Letter", banner_image_url: null },
    };

    const { POST } = await import("@/app/api/documents/file-signed-engagement-letter/route");
    const res = await POST(request({ signatureId: "sig-3", token: "share-token-1" }));

    expect(state.httpRequestCalls).toBe(0);
    expect(state.httpsRequestCalls).toBe(0);
    expect(res.status).toBe(200);
  });
});
