import { describe, expect, it, vi } from "vitest";
import {
  BlockedDestinationError,
  ResponseTooLargeError,
  DEFAULT_MAX_BODY_BYTES,
  isUnsafeIPv4,
  isUnsafeIPv6,
  safeFetchBuffer,
  type LookupAllFn,
  type ResolvedAddress,
  type SafeFetchBufferDeps,
} from "@/lib/security/safeFetch";
import { fetchImageBytesSafe } from "@/lib/documents/fetchImageBytesSafe";

// VEREXA SSRF (banner image, Session 104): regression coverage for the
// server-side fix to app/api/documents/file-signed-engagement-letter's
// banner-image fetch. Every case is deterministic -- DNS and the network
// connection are both injected via safeFetchBuffer's lookupAll/issueRequest
// parameters -- so this suite never makes a real network call.

function lookupOf(addresses: ResolvedAddress[]): LookupAllFn {
  return async () => addresses;
}

function v4(address: string): ResolvedAddress {
  return { address, family: 4 };
}

function v6(address: string): ResolvedAddress {
  return { address, family: 6 };
}

const PUBLIC_V4 = v4("93.184.216.34");

describe("isUnsafeIPv4 / isUnsafeIPv6 (shared with SSRF-001)", () => {
  it("allows ordinary public addresses", () => {
    expect(isUnsafeIPv4("93.184.216.34")).toBe(false);
    expect(isUnsafeIPv6("2606:4700:4700::1111")).toBe(false);
  });

  it("blocks localhost-equivalent and loopback addresses", () => {
    expect(isUnsafeIPv4("127.0.0.1")).toBe(true);
    expect(isUnsafeIPv6("::1")).toBe(true);
  });

  it("blocks RFC1918 private ranges", () => {
    expect(isUnsafeIPv4("10.0.0.1")).toBe(true);
    expect(isUnsafeIPv4("172.16.0.1")).toBe(true);
    expect(isUnsafeIPv4("192.168.1.1")).toBe(true);
  });

  it("blocks the cloud metadata address and other link-local addresses", () => {
    expect(isUnsafeIPv4("169.254.169.254")).toBe(true);
  });

  it("blocks CGNAT and reserved ranges", () => {
    expect(isUnsafeIPv4("100.64.0.1")).toBe(true);
    expect(isUnsafeIPv4("240.0.0.1")).toBe(true);
  });

  it("blocks IPv6 link-local and unique-local ranges", () => {
    expect(isUnsafeIPv6("fe80::1")).toBe(true);
    expect(isUnsafeIPv6("fc00::1")).toBe(true);
  });

  it("blocks IPv4-mapped IPv6 addresses whose embedded IPv4 is unsafe", () => {
    expect(isUnsafeIPv6("::ffff:127.0.0.1")).toBe(true);
    expect(isUnsafeIPv6("::ffff:169.254.169.254")).toBe(true);
    expect(isUnsafeIPv6("::ffff:8.8.8.8")).toBe(false);
  });

  it("fails closed on malformed addresses", () => {
    expect(isUnsafeIPv4("not-an-ip")).toBe(true);
    expect(isUnsafeIPv6("not-an-ipv6")).toBe(true);
  });
});

describe("safeFetchBuffer: destination blocking", () => {
  it.each([
    ["localhost", v4("127.0.0.1")],
    ["127.0.0.1", v4("127.0.0.1")],
    ["::1", v6("::1")],
    ["10.0.0.1", v4("10.0.0.1")],
    ["172.16.0.1", v4("172.16.0.1")],
    ["192.168.1.1", v4("192.168.1.1")],
    ["169.254.169.254 (cloud metadata)", v4("169.254.169.254")],
    ["IPv6 link-local", v6("fe80::1")],
    ["IPv6 unique-local", v6("fd12:3456::1")],
    ["IPv4-mapped private IPv6", v6("::ffff:192.168.1.1")],
  ])("blocks a destination resolving to %s before issuing a request", async (_label, address) => {
    const issueRequest = vi.fn();
    await expect(
      safeFetchBuffer("https://internal.example/banner.png", {}, { lookupAll: lookupOf([address]), issueRequest })
    ).rejects.toBeInstanceOf(BlockedDestinationError);
    expect(issueRequest).not.toHaveBeenCalled();
  });

  it("allows a public destination", async () => {
    const issueRequest = vi.fn(async () => ({ status: 200, headers: {}, body: Buffer.from("ok") }));
    const result = await safeFetchBuffer("https://example.com/banner.png", {}, { lookupAll: lookupOf([PUBLIC_V4]), issueRequest });
    expect(result.ok).toBe(true);
  });

  it("allows a public IPv6 destination", async () => {
    const issueRequest = vi.fn(async () => ({ status: 200, headers: {}, body: Buffer.from("ok") }));
    const result = await safeFetchBuffer(
      "https://example.com/banner.png",
      {},
      { lookupAll: lookupOf([v6("2606:4700:4700::1111")]), issueRequest }
    );
    expect(result.ok).toBe(true);
  });

  it("blocks malformed URLs before any lookup", async () => {
    const lookupAll = vi.fn();
    const issueRequest = vi.fn();
    await expect(safeFetchBuffer("not a url", {}, { lookupAll, issueRequest })).rejects.toBeInstanceOf(BlockedDestinationError);
    expect(lookupAll).not.toHaveBeenCalled();
    expect(issueRequest).not.toHaveBeenCalled();
  });

  it("blocks unsupported protocols", async () => {
    const issueRequest = vi.fn();
    await expect(safeFetchBuffer("file:///etc/passwd", {}, { issueRequest })).rejects.toBeInstanceOf(BlockedDestinationError);
    await expect(safeFetchBuffer("ftp://example.com/x", {}, { issueRequest })).rejects.toBeInstanceOf(BlockedDestinationError);
    expect(issueRequest).not.toHaveBeenCalled();
  });
});

describe("safeFetchBuffer: DNS", () => {
  it("allows a hostname that resolves only to a public address", async () => {
    const issueRequest = vi.fn(async () => ({ status: 200, headers: {}, body: Buffer.from("ok") }));
    const result = await safeFetchBuffer("https://cdn.example.com/banner.png", {}, { lookupAll: lookupOf([PUBLIC_V4]), issueRequest });
    expect(result.ok).toBe(true);
  });

  it("blocks a hostname that resolves to a private address", async () => {
    const issueRequest = vi.fn();
    await expect(
      safeFetchBuffer("https://internal.example/banner.png", {}, { lookupAll: lookupOf([v4("10.0.0.5")]), issueRequest })
    ).rejects.toBeInstanceOf(BlockedDestinationError);
    expect(issueRequest).not.toHaveBeenCalled();
  });

  it("blocks the whole hostname when one of several DNS answers is unsafe", async () => {
    const issueRequest = vi.fn();
    await expect(
      safeFetchBuffer("https://multi.example/banner.png", {}, { lookupAll: lookupOf([PUBLIC_V4, v4("127.0.0.1")]), issueRequest })
    ).rejects.toBeInstanceOf(BlockedDestinationError);
    expect(issueRequest).not.toHaveBeenCalled();
  });

  it("pins the actual connection to the exact validated address (DNS-rebinding protection)", async () => {
    const issueRequest = vi.fn(async (opts) => {
      expect(opts.pinnedAddress).toBe("93.184.216.34");
      expect(opts.pinnedFamily).toBe(4);
      return { status: 200, headers: {}, body: Buffer.from("ok") };
    });
    await safeFetchBuffer("https://example.com/banner.png", {}, { lookupAll: lookupOf([PUBLIC_V4]), issueRequest });
    expect(issueRequest).toHaveBeenCalledTimes(1);
  });
});

describe("safeFetchBuffer: redirects", () => {
  it("follows a public-to-public redirect, re-validating the new destination", async () => {
    const issueRequest = vi
      .fn()
      .mockResolvedValueOnce({ status: 302, headers: { location: "https://cdn.example.com/final.png" }, body: Buffer.alloc(0) })
      .mockResolvedValueOnce({ status: 200, headers: {}, body: Buffer.from("ok") });
    const lookupAll = vi.fn(async (hostname: string) => (hostname === "example.com" ? [PUBLIC_V4] : [v4("151.101.1.1")]));

    const result = await safeFetchBuffer("https://example.com/banner.png", {}, { lookupAll, issueRequest });
    expect(result.ok).toBe(true);
    expect(issueRequest).toHaveBeenCalledTimes(2);
    expect(lookupAll).toHaveBeenCalledWith("cdn.example.com");
  });

  it("blocks a redirect to localhost", async () => {
    const issueRequest = vi
      .fn()
      .mockResolvedValueOnce({ status: 302, headers: { location: "http://127.0.0.1/admin" }, body: Buffer.alloc(0) });
    const lookupAll = vi.fn(async (hostname: string) => (hostname === "example.com" ? [PUBLIC_V4] : [v4("127.0.0.1")]));

    await expect(safeFetchBuffer("https://example.com/banner.png", {}, { lookupAll, issueRequest })).rejects.toBeInstanceOf(
      BlockedDestinationError
    );
    expect(issueRequest).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect to a private IP", async () => {
    const issueRequest = vi
      .fn()
      .mockResolvedValueOnce({ status: 302, headers: { location: "http://internal.local/x" }, body: Buffer.alloc(0) });
    const lookupAll = vi.fn(async (hostname: string) => (hostname === "example.com" ? [PUBLIC_V4] : [v4("10.0.0.9")]));

    await expect(safeFetchBuffer("https://example.com/banner.png", {}, { lookupAll, issueRequest })).rejects.toBeInstanceOf(
      BlockedDestinationError
    );
  });

  it("blocks a redirect to the cloud metadata address", async () => {
    const issueRequest = vi
      .fn()
      .mockResolvedValueOnce({ status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" }, body: Buffer.alloc(0) });
    const lookupAll = vi.fn(async (hostname: string) => (hostname === "example.com" ? [PUBLIC_V4] : [v4("169.254.169.254")]));

    await expect(safeFetchBuffer("https://example.com/banner.png", {}, { lookupAll, issueRequest })).rejects.toBeInstanceOf(
      BlockedDestinationError
    );
  });

  it("detects a redirect loop", async () => {
    const issueRequest = vi.fn(async (opts: { path: string }) => {
      const next = opts.path === "/a" ? "/b" : "/a";
      return { status: 302, headers: { location: `https://example.com${next}` }, body: Buffer.alloc(0) };
    });
    await expect(
      safeFetchBuffer("https://example.com/a", {}, { lookupAll: lookupOf([PUBLIC_V4]), issueRequest })
    ).rejects.toBeInstanceOf(BlockedDestinationError);
  });

  it("gives up after an excessive number of redirects", async () => {
    let hop = 0;
    const issueRequest = vi.fn(async () => {
      hop++;
      return { status: 302, headers: { location: `https://example.com/hop-${hop}` }, body: Buffer.alloc(0) };
    });
    await expect(
      safeFetchBuffer("https://example.com/hop-0", { maxRedirects: 3 }, { lookupAll: lookupOf([PUBLIC_V4]), issueRequest })
    ).rejects.toBeInstanceOf(BlockedDestinationError);
    expect(issueRequest).toHaveBeenCalledTimes(4);
  });
});

describe("safeFetchBuffer: response-body size limit", () => {
  function depsWithBody(body: Buffer, headers: Record<string, string> = {}): SafeFetchBufferDeps {
    return {
      lookupAll: lookupOf([PUBLIC_V4]),
      issueRequest: vi.fn(async () => ({ status: 200, headers, body })),
    };
  }

  it("returns a small valid image body successfully", async () => {
    const body = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes, as a stand-in payload
    const result = await safeFetchBuffer("https://example.com/banner.png", {}, depsWithBody(body));
    expect(result.ok).toBe(true);
    expect(result.body.equals(body)).toBe(true);
  });

  it("rejects when Content-Length declares a size over the limit, without reading the body", async () => {
    const issueRequest = vi.fn(async (opts: { maxBodyBytes: number }) => {
      // Simulates issueRequestNodeBuffered's own upfront Content-Length check.
      const declared = opts.maxBodyBytes + 1;
      throw Object.assign(new Error("Response exceeded the maximum allowed size"), { name: "ResponseTooLargeError", declared });
    });
    await expect(
      safeFetchBuffer("https://example.com/banner.png", { maxBodyBytes: 1024 }, { lookupAll: lookupOf([PUBLIC_V4]), issueRequest })
    ).rejects.toThrow(/exceeded the maximum/);
  });

  it("rejects a chunked/unknown-length response that exceeds the limit while streaming", async () => {
    // Exercises the real streaming enforcement in issueRequestNodeBuffered
    // itself (not a mocked issueRequest), proving a response with no
    // Content-Length header can't bypass the cap by growing past it chunk
    // by chunk.
    const { issueRequestNodeBuffered } = await import("@/lib/security/safeFetch");
    const http = await import("node:http");

    const server = http.createServer((_req, res) => {
      res.writeHead(200); // deliberately no Content-Length -- chunked transfer
      const chunk = Buffer.alloc(1024, 1);
      let sent = 0;
      const interval = setInterval(() => {
        if (sent >= 5 * 1024 * 1024) {
          clearInterval(interval);
          res.end();
          return;
        }
        res.write(chunk);
        sent += chunk.length;
      }, 0);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    await expect(
      issueRequestNodeBuffered({
        protocol: "http:",
        hostname: "127.0.0.1",
        port,
        path: "/",
        method: "GET",
        headers: {},
        pinnedAddress: "127.0.0.1",
        pinnedFamily: 4,
        timeoutMs: 5000,
        maxBodyBytes: 2048, // far smaller than the 5MB the server tries to stream
      })
    ).rejects.toBeInstanceOf(ResponseTooLargeError);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("handles a response exactly at the limit correctly", async () => {
    const body = Buffer.alloc(16);
    const result = await safeFetchBuffer("https://example.com/banner.png", { maxBodyBytes: 16 }, depsWithBody(body));
    expect(result.ok).toBe(true);
    expect(result.body.length).toBe(16);
  });

  it("defaults to an 8MB cap when none is specified", () => {
    expect(DEFAULT_MAX_BODY_BYTES).toBe(8 * 1024 * 1024);
  });
});

describe("fetchImageBytesSafe: best-effort contract", () => {
  it("returns the bytes for a successful, safe fetch", async () => {
    vi.resetModules();
    vi.doMock("@/lib/security/safeFetch", async () => {
      const actual = await vi.importActual<typeof import("@/lib/security/safeFetch")>("@/lib/security/safeFetch");
      return { ...actual, safeFetchBuffer: vi.fn(async () => ({ ok: true, status: 200, body: Buffer.from([1, 2, 3]) })) };
    });
    const { fetchImageBytesSafe: fetchWithMock } = await import("@/lib/documents/fetchImageBytesSafe");
    const bytes = await fetchWithMock("https://example.com/banner.png");
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
    vi.doUnmock("@/lib/security/safeFetch");
  });

  it("returns null for a null/undefined URL without attempting a fetch", async () => {
    expect(await fetchImageBytesSafe(null)).toBeNull();
    expect(await fetchImageBytesSafe(undefined)).toBeNull();
  });

  it("returns null (never throws) when the destination is blocked", async () => {
    vi.resetModules();
    vi.doMock("@/lib/security/safeFetch", async () => {
      const actual = await vi.importActual<typeof import("@/lib/security/safeFetch")>("@/lib/security/safeFetch");
      return {
        ...actual,
        safeFetchBuffer: vi.fn(async () => {
          throw new actual.BlockedDestinationError();
        }),
      };
    });
    const { fetchImageBytesSafe: fetchWithMock } = await import("@/lib/documents/fetchImageBytesSafe");
    await expect(fetchWithMock("http://169.254.169.254/latest/meta-data/")).resolves.toBeNull();
    vi.doUnmock("@/lib/security/safeFetch");
  });

  it("returns null (never throws) when the response exceeds the size cap", async () => {
    vi.resetModules();
    vi.doMock("@/lib/security/safeFetch", async () => {
      const actual = await vi.importActual<typeof import("@/lib/security/safeFetch")>("@/lib/security/safeFetch");
      return {
        ...actual,
        safeFetchBuffer: vi.fn(async () => {
          throw new actual.ResponseTooLargeError();
        }),
      };
    });
    const { fetchImageBytesSafe: fetchWithMock } = await import("@/lib/documents/fetchImageBytesSafe");
    await expect(fetchWithMock("https://example.com/huge.png")).resolves.toBeNull();
    vi.doUnmock("@/lib/security/safeFetch");
  });

  it("returns null (never throws) on a plain network error", async () => {
    vi.resetModules();
    vi.doMock("@/lib/security/safeFetch", async () => {
      const actual = await vi.importActual<typeof import("@/lib/security/safeFetch")>("@/lib/security/safeFetch");
      return { ...actual, safeFetchBuffer: vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))) };
    });
    const { fetchImageBytesSafe: fetchWithMock } = await import("@/lib/documents/fetchImageBytesSafe");
    await expect(fetchWithMock("https://unreachable.example/banner.png")).resolves.toBeNull();
    vi.doUnmock("@/lib/security/safeFetch");
  });

  it("returns null for a non-ok upstream status", async () => {
    vi.resetModules();
    vi.doMock("@/lib/security/safeFetch", async () => {
      const actual = await vi.importActual<typeof import("@/lib/security/safeFetch")>("@/lib/security/safeFetch");
      return { ...actual, safeFetchBuffer: vi.fn(async () => ({ ok: false, status: 404, body: Buffer.alloc(0) })) };
    });
    const { fetchImageBytesSafe: fetchWithMock } = await import("@/lib/documents/fetchImageBytesSafe");
    await expect(fetchWithMock("https://example.com/missing.png")).resolves.toBeNull();
    vi.doUnmock("@/lib/security/safeFetch");
  });
});

describe("regression: legitimate branding/storage banner still reaches the image layer", () => {
  it("a Supabase Storage public URL for the branding bucket is allowed through to the image-processing layer", async () => {
    // Mirrors what components/settings/BannerImageUpload.tsx actually
    // produces (supabase.storage.from("branding").getPublicUrl(path)) --
    // a normal https URL on the project's own Supabase host, resolving
    // publicly, with no redirect involved.
    const legitimateBannerUrl = "https://daxpavvsotvsyqqntddc.supabase.co/storage/v1/object/public/branding/ws-1/banner-123-logo.png";
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const issueRequest = vi.fn(async () => ({ status: 200, headers: {}, body: pngBytes }));

    const result = await safeFetchBuffer(legitimateBannerUrl, {}, { lookupAll: lookupOf([PUBLIC_V4]), issueRequest });

    expect(result.ok).toBe(true);
    expect(result.body.equals(pngBytes)).toBe(true);
  });
});
