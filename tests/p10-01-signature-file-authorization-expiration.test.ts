// P10-01 / P18-01; P16-01: the signature file-serving route minted a
// working 300-second signed URL for any access_token with a matching
// signer row, with no check of signature_requests.status (cancelled) or
// signature_request_signers.expires_at -- even though record_signature_by_token
// and decline_signature_by_token (migration signature_request_expiry_and_revoke)
// already enforce exactly that boundary, because this route reads the
// tables directly with the service-role client instead of going through
// those RPCs. PublicSignView.tsx fetches this route unconditionally on
// mount, before its own "revoked"/"expired" UI gates ever render, so a
// signer with a cancelled or expired link could still retrieve a working
// document URL from the server even though the UI told them otherwise.
import { describe, expect, it, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  signerRow: null as Record<string, unknown> | null,
  rateLimitOk: true,
  signedUrlResult: { data: { signedUrl: "https://signed.example.test/doc.pdf" }, error: null } as {
    data: { signedUrl: string } | null;
    error: { message: string } | null;
  },
}));

function fakeSupabase() {
  return {
    rpc: vi.fn(() => Promise.resolve({ data: state.rateLimitOk, error: null })),
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: state.signerRow, error: null }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: vi.fn(() => Promise.resolve(state.signedUrlResult)),
      }),
    },
  };
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => fakeSupabase(),
}));

function makeRequest(token: string) {
  return new Request(`https://app.example.test/api/sign/${token}/file`, { method: "GET" });
}

function activeAttachment() {
  return { storage_path: "ws-1/doc.pdf", file_name: "doc.pdf", mime_type: "application/pdf" };
}

describe("GET /api/sign/[token]/file -- cancellation & expiration (P10-01/P18-01/P16-01)", () => {
  beforeEach(() => {
    vi.resetModules();
    state.signerRow = null;
    state.rateLimitOk = true;
    state.signedUrlResult = { data: { signedUrl: "https://signed.example.test/doc.pdf" }, error: null };
  });

  it("mints a signed URL for a still-pending link with no expiry set", async () => {
    state.signerRow = {
      id: "signer-1",
      expires_at: null,
      signature_request: { status: "pending", attachment: activeAttachment() },
    };
    const { GET } = await import("@/app/api/sign/[token]/file/route");
    const res = await GET(makeRequest("tok-active"), { params: { token: "tok-active" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://signed.example.test/doc.pdf");
  });

  it("still mints a signed URL when expires_at is set but in the future", async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60).toISOString();
    state.signerRow = {
      id: "signer-2",
      expires_at: future,
      signature_request: { status: "pending", attachment: activeAttachment() },
    };
    const { GET } = await import("@/app/api/sign/[token]/file/route");
    const res = await GET(makeRequest("tok-future"), { params: { token: "tok-future" } });
    expect(res.status).toBe(200);
  });

  it("rejects a token whose signature request has been revoked/cancelled, without minting a URL", async () => {
    state.signerRow = {
      id: "signer-3",
      expires_at: null,
      signature_request: { status: "cancelled", attachment: activeAttachment() },
    };
    const { GET } = await import("@/app/api/sign/[token]/file/route");
    const res = await GET(makeRequest("tok-revoked"), { params: { token: "tok-revoked" } });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/revoked/i);
    expect(body.url).toBeUndefined();
  });

  it("rejects a token whose expires_at has already passed, without minting a URL", async () => {
    state.signerRow = {
      id: "signer-4",
      expires_at: "2020-01-01T00:00:00Z",
      signature_request: { status: "pending", attachment: activeAttachment() },
    };
    const { GET } = await import("@/app/api/sign/[token]/file/route");
    const res = await GET(makeRequest("tok-expired"), { params: { token: "tok-expired" } });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/expired/i);
    expect(body.url).toBeUndefined();
  });

  it("returns 404 for a token with no matching signer (existing behavior preserved)", async () => {
    state.signerRow = null;
    const { GET } = await import("@/app/api/sign/[token]/file/route");
    const res = await GET(makeRequest("tok-missing"), { params: { token: "tok-missing" } });
    expect(res.status).toBe(404);
  });

  it("is rate limited (existing behavior preserved)", async () => {
    state.rateLimitOk = false;
    const { GET } = await import("@/app/api/sign/[token]/file/route");
    const res = await GET(makeRequest("tok-any"), { params: { token: "tok-any" } });
    expect(res.status).toBe(429);
  });
});
