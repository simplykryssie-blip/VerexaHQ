// P10-02: /api/documents/upload is the one place UploadZone's "upload a
// document" and DocumentList's "upload a new version" now go through,
// precisely so the real bytes can be inspected before anything is trusted
// as the stored Content-Type or the attachments.mime_type/file_size_bytes
// columns. This proves: a legitimate upload/replacement still succeeds;
// forged MIME/size metadata the browser could have sent is never even
// read, let alone trusted; actual oversized content is rejected; content
// that doesn't match its filename/extension is safely normalized rather
// than rendered as live markup; replacement goes through the exact same
// boundary as a fresh upload; and an unauthenticated request is rejected
// before any storage/DB call happens.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MAX_DOCUMENT_UPLOAD_BYTES } from "@/lib/documents/sniffDocumentMimeType";

const state = vi.hoisted(() => ({
  user: { id: "staff-1" } as { id: string } | null,
  existingAttachment: null as Record<string, unknown> | null,
  uploadError: null as { message: string } | null,
  insertError: null as { message: string } | null,
  insertedRow: null as Record<string, unknown> | null,
  updateCalls: [] as string[],
  uploadCalls: [] as { path: string; contentType?: string; byteLength: number }[],
}));

function fakeSessionClient() {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: state.user } }) },
    storage: {
      from: () => ({
        upload: (path: string, bytes: Uint8Array, opts?: { contentType?: string }) => {
          state.uploadCalls.push({ path, contentType: opts?.contentType, byteLength: bytes.length });
          return Promise.resolve({ error: state.uploadError });
        },
      }),
    },
    from: (table: string) => {
      if (table !== "attachments") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: state.existingAttachment, error: null }),
          }),
        }),
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: () => {
              state.insertedRow = row;
              if (state.insertError) return Promise.resolve({ data: null, error: state.insertError });
              return Promise.resolve({ data: { id: "att-new" }, error: null });
            },
          }),
        }),
        update: (_patch: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => {
            state.updateCalls.push(id);
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => fakeSessionClient() }));

function textBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function pdfBytes(): Uint8Array {
  return textBytes("%PDF-1.7\n%%EOF");
}

function pngBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
}

function makeRequest(fields: Record<string, string | { bytes: Uint8Array; name: string; declaredType?: string }>): Request {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") {
      fd.set(key, value);
    } else {
      const file = new File([value.bytes as unknown as BlobPart], value.name, value.declaredType ? { type: value.declaredType } : undefined);
      fd.set(key, file);
    }
  }
  return new Request("https://app.example.test/api/documents/upload", { method: "POST", body: fd });
}

beforeEach(() => {
  vi.resetModules();
  state.user = { id: "staff-1" };
  state.existingAttachment = null;
  state.uploadError = null;
  state.insertError = null;
  state.insertedRow = null;
  state.updateCalls = [];
  state.uploadCalls = [];
});

describe("POST /api/documents/upload -- MIME/size trust boundary (P10-02)", () => {
  it("rejects an unauthenticated request before touching storage or the database", async () => {
    state.user = null;
    const { POST } = await import("@/app/api/documents/upload/route");
    const res = await POST(
      makeRequest({
        file: { bytes: pdfBytes(), name: "doc.pdf", declaredType: "application/pdf" },
        workspaceId: "ws-1",
        entityType: "client",
        entityId: "client-1",
        visibility: "internal",
      })
    );
    expect(res.status).toBe(401);
    expect(state.uploadCalls).toHaveLength(0);
  });

  it("a legitimate PDF upload succeeds and stores the server-verified type, not any client-declared value", async () => {
    const { POST } = await import("@/app/api/documents/upload/route");
    const res = await POST(
      makeRequest({
        file: { bytes: pdfBytes(), name: "report.pdf", declaredType: "application/pdf" },
        workspaceId: "ws-1",
        entityType: "client",
        entityId: "client-1",
        visibility: "internal",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.attachment.mimeType).toBe("application/pdf");
    expect(state.uploadCalls[0].contentType).toBe("application/pdf");
    expect(state.insertedRow?.mime_type).toBe("application/pdf");
    expect(state.insertedRow?.file_size_bytes).toBe(pdfBytes().length);
  });

  it("a file whose browser-declared type is forged does not influence the stored type at all -- only the real bytes do", async () => {
    const { POST } = await import("@/app/api/documents/upload/route");
    // Real bytes are a PNG; the browser's File.type claims it's HTML. The
    // route never reads a declared-type field from the form at all, so
    // there's nothing here for a forged value to override.
    const res = await POST(
      makeRequest({
        file: { bytes: pngBytes(), name: "photo.png", declaredType: "text/html" },
        workspaceId: "ws-1",
        entityType: "client",
        entityId: "client-1",
        visibility: "internal",
      })
    );
    expect(res.status).toBe(200);
    expect(state.insertedRow?.mime_type).toBe("image/png");
  });

  it("a file whose real bytes are HTML is stored as application/octet-stream, never text/html, however it's named", async () => {
    const { POST } = await import("@/app/api/documents/upload/route");
    const maliciousHtml = textBytes("<html><body><script>alert(document.cookie)</script></body></html>");
    const res = await POST(
      makeRequest({
        file: { bytes: maliciousHtml, name: "totally-a-photo.png", declaredType: "image/png" },
        workspaceId: "ws-1",
        entityType: "client",
        entityId: "client-1",
        visibility: "internal",
      })
    );
    expect(res.status).toBe(200);
    expect(state.insertedRow?.mime_type).toBe("application/octet-stream");
    expect(state.uploadCalls[0].contentType).toBe("application/octet-stream");
  });

  it("stores the actual byte length, ignoring any forged File.size the browser could have reported", async () => {
    const { POST } = await import("@/app/api/documents/upload/route");
    const bytes = pdfBytes();
    const res = await POST(
      makeRequest({
        file: { bytes, name: "report.pdf", declaredType: "application/pdf" },
        workspaceId: "ws-1",
        entityType: "client",
        entityId: "client-1",
        visibility: "internal",
        // A File's reported .size always matches its real byte length in
        // every runtime -- there is no form field for a caller to forge a
        // different size through, which is itself the point: the route
        // never reads one.
      })
    );
    expect(res.status).toBe(200);
    expect(state.insertedRow?.file_size_bytes).toBe(bytes.length);
    expect(state.uploadCalls[0].byteLength).toBe(bytes.length);
  });

  it("rejects an empty file", async () => {
    const { POST } = await import("@/app/api/documents/upload/route");
    const res = await POST(
      makeRequest({
        file: { bytes: new Uint8Array(0), name: "empty.pdf" },
        workspaceId: "ws-1",
        entityType: "client",
        entityId: "client-1",
        visibility: "internal",
      })
    );
    expect(res.status).toBe(400);
    expect(state.uploadCalls).toHaveLength(0);
  });

  it("rejects a file that actually exceeds the maximum upload size, regardless of what the browser would have reported", async () => {
    const { POST } = await import("@/app/api/documents/upload/route");
    const oversized = new Uint8Array(MAX_DOCUMENT_UPLOAD_BYTES + 1);
    const res = await POST(
      makeRequest({
        file: { bytes: oversized, name: "huge.pdf" },
        workspaceId: "ws-1",
        entityType: "client",
        entityId: "client-1",
        visibility: "internal",
      })
    );
    expect(res.status).toBe(400);
    expect(state.uploadCalls).toHaveLength(0);
  }, 15000);

  it("surfaces an RLS-denied storage upload as an error instead of retrying with elevated access (cross-tenant/unauthorized stays rejected)", async () => {
    state.uploadError = { message: "new row violates row-level security policy" };
    const { POST } = await import("@/app/api/documents/upload/route");
    const res = await POST(
      makeRequest({
        file: { bytes: pdfBytes(), name: "report.pdf" },
        workspaceId: "ws-victim",
        entityType: "client",
        entityId: "client-victim",
        visibility: "internal",
      })
    );
    expect(res.status).toBe(400);
    expect(state.insertedRow).toBeNull();
  });

  it("a replacement upload re-reads folder/category/version from the existing row and follows the same byte-sniffing boundary as a fresh upload", async () => {
    state.existingAttachment = { id: "att-1", workspace_id: "ws-1", entity_type: "client", entity_id: "client-1", folder_id: "folder-9", category: "Tax Return", version: 2 };
    const { POST } = await import("@/app/api/documents/upload/route");
    const res = await POST(
      makeRequest({
        file: { bytes: pdfBytes(), name: "report-v2.pdf", declaredType: "application/pdf" },
        workspaceId: "ws-1",
        entityType: "client",
        entityId: "client-1",
        replacesAttachmentId: "att-1",
      })
    );
    expect(res.status).toBe(200);
    expect(state.insertedRow).toMatchObject({ folder_id: "folder-9", category: "Tax Return", version: 3, replaces_attachment_id: "att-1", mime_type: "application/pdf" });
    expect(state.insertedRow).not.toHaveProperty("visibility");
    expect(state.updateCalls).toEqual(["att-1"]);
  });

  it("a replacement whose real bytes are HTML is normalized the same way a fresh upload would be", async () => {
    state.existingAttachment = { id: "att-2", workspace_id: "ws-1", entity_type: "client", entity_id: "client-1", folder_id: null, category: null, version: 1 };
    const { POST } = await import("@/app/api/documents/upload/route");
    const maliciousHtml = textBytes("<html><body><script>alert(1)</script></body></html>");
    const res = await POST(
      makeRequest({
        file: { bytes: maliciousHtml, name: "report.pdf", declaredType: "application/pdf" },
        workspaceId: "ws-1",
        entityType: "client",
        entityId: "client-1",
        replacesAttachmentId: "att-2",
      })
    );
    expect(res.status).toBe(200);
    expect(state.insertedRow?.mime_type).toBe("application/octet-stream");
  });

  it("returns 404 for a replacement of a non-existent/inaccessible attachment instead of falling back to a fresh upload", async () => {
    state.existingAttachment = null;
    const { POST } = await import("@/app/api/documents/upload/route");
    const res = await POST(
      makeRequest({
        file: { bytes: pdfBytes(), name: "report.pdf" },
        workspaceId: "ws-1",
        entityType: "client",
        entityId: "client-1",
        replacesAttachmentId: "does-not-exist",
      })
    );
    expect(res.status).toBe(404);
    expect(state.uploadCalls).toHaveLength(0);
  });
});
