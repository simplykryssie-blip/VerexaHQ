import { describe, expect, it, vi } from "vitest";
import { ensureTagConfirmed, ensureTagsConfirmed, collectClientTagValues } from "@/lib/ensureTag";
import type { SupabaseClient } from "@supabase/supabase-js";

// A tag creation flow is only ever exercised through this module now --
// window.confirm()/window.alert() render outside the page and can be
// silently suppressed by the browser after repeated use in one tab, which
// looked to the caller exactly like a normal decline (see components/Confirm.tsx).
// These tests exercise the resulting contract: confirm/notifyError are called
// with the right names, and a decline vs. an RPC failure are distinguishable.

function fakeSupabase(opts: { existingNames?: string[]; rpcError?: string }): SupabaseClient {
  const existing = new Set(opts.existingNames ?? []);
  return {
    from(table: string) {
      if (table !== "workspace_tags") throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return this;
        },
        eq(_col: string, value: string) {
          (this as { _name?: string })._name = value;
          return this;
        },
        in(_col: string, values: string[]) {
          (this as { _names?: string[] })._names = values;
          return this;
        },
        async maybeSingle() {
          const name = (this as { _name?: string })._name;
          return { data: name && existing.has(name) ? { id: "x" } : null };
        },
        then(resolve: (v: unknown) => void) {
          const names = (this as { _names?: string[] })._names ?? [];
          resolve({ data: names.filter((n) => existing.has(n)).map((n) => ({ name: n })) });
        },
      };
    },
    rpc(fn: string) {
      if (fn !== "create_workspace_tag") throw new Error(`unexpected rpc ${fn}`);
      return Promise.resolve(opts.rpcError ? { error: { message: opts.rpcError } } : { error: null });
    },
  } as unknown as SupabaseClient;
}

describe("ensureTagConfirmed", () => {
  it("skips confirmation entirely for a tag that already exists", async () => {
    const confirm = vi.fn();
    const notifyError = vi.fn();
    const ok = await ensureTagConfirmed(fakeSupabase({ existingNames: ["vip"] }), "ws1", "vip", confirm, notifyError);
    expect(ok).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("asks before creating a brand new tag, and creates it on confirm", async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const notifyError = vi.fn();
    const ok = await ensureTagConfirmed(fakeSupabase({}), "ws1", "new-tag", confirm, notifyError);
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("new-tag") }));
    expect(ok).toBe(true);
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("returns false without any error when the user declines", async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const notifyError = vi.fn();
    const ok = await ensureTagConfirmed(fakeSupabase({}), "ws1", "new-tag", confirm, notifyError);
    expect(ok).toBe(false);
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("surfaces an RPC failure through notifyError, distinct from a decline", async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const notifyError = vi.fn();
    const ok = await ensureTagConfirmed(fakeSupabase({ rpcError: "permission denied" }), "ws1", "new-tag", confirm, notifyError);
    expect(ok).toBe(false);
    expect(notifyError).toHaveBeenCalledWith("permission denied");
  });
});

describe("ensureTagsConfirmed", () => {
  it("is a no-op for an empty list", async () => {
    const confirm = vi.fn();
    const ok = await ensureTagsConfirmed(fakeSupabase({}), "ws1", [], confirm, vi.fn());
    expect(ok).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("only confirms the tags that don't already exist", async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const ok = await ensureTagsConfirmed(fakeSupabase({ existingNames: ["vip"] }), "ws1", ["vip", "new-tag"], confirm, vi.fn());
    expect(ok).toBe(true);
    expect(confirm.mock.calls[0][0].title).toContain("new-tag");
    expect(confirm.mock.calls[0][0].title).not.toContain("vip");
  });
});

describe("collectClientTagValues", () => {
  it("dedupes client.tags condition values and ignores other fields", () => {
    const values = collectClientTagValues([
      { field: "client.tags", value: "vip" },
      { field: "client.tags", value: "vip" },
      { field: "client.tags", value: "urgent" },
      { field: "client.status", value: "active" },
    ]);
    expect(values.sort()).toEqual(["urgent", "vip"]);
  });
});
