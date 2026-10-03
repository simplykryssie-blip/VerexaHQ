import { describe, expect, it, vi } from "vitest";
import {
  BlockedDestinationError,
  isUnsafeIPv4,
  isUnsafeIPv6,
  safeFetch,
  type LookupAllFn,
  type ResolvedAddress,
} from "@/lib/security/safeFetch";

// VEREXA SSRF-001: regression coverage for the centralized outbound-request
// guard used by the automation "webhook" action. Every case here is fully
// deterministic -- DNS and the actual network connection are both injected
// via safeFetch's lookupAll/issueRequest parameters, so this suite never
// makes a real network call (to internal infrastructure or anywhere else).

function lookupOf(addresses: ResolvedAddress[]): LookupAllFn {
  return async () => addresses;
}

function v4(address: string): ResolvedAddress {
  return { address, family: 4 };
}

function v6(address: string): ResolvedAddress {
  return { address, family: 6 };
}

describe("isUnsafeIPv4", () => {
  it("allows ordinary public addresses", () => {
    expect(isUnsafeIPv4("93.184.216.34")).toBe(false);
    expect(isUnsafeIPv4("8.8.8.8")).toBe(false);
  });

  it("blocks loopback", () => {
    expect(isUnsafeIPv4("127.0.0.1")).toBe(true);
    expect(isUnsafeIPv4("127.255.255.255")).toBe(true);
  });

  it("blocks RFC1918 private ranges", () => {
    expect(isUnsafeIPv4("10.0.0.1")).toBe(true);
    expect(isUnsafeIPv4("172.16.5.5")).toBe(true);
    expect(isUnsafeIPv4("172.31.255.255")).toBe(true);
    expect(isUnsafeIPv4("192.168.1.1")).toBe(true);
    // Just outside the 172.16.0.0/12 range must stay allowed.
    expect(isUnsafeIPv4("172.32.0.1")).toBe(false);
    expect(isUnsafeIPv4("172.15.255.255")).toBe(false);
  });

  it("blocks link-local, including the cloud metadata address", () => {
    expect(isUnsafeIPv4("169.254.169.254")).toBe(true);
    expect(isUnsafeIPv4("169.254.0.1")).toBe(true);
  });

  it("blocks CGNAT, multicast, and reserved/broadcast ranges", () => {
    expect(isUnsafeIPv4("100.64.0.1")).toBe(true);
    expect(isUnsafeIPv4("224.0.0.1")).toBe(true);
    expect(isUnsafeIPv4("255.255.255.255")).toBe(true);
    expect(isUnsafeIPv4("240.0.0.1")).toBe(true);
  });

  it("fails closed on malformed addresses", () => {
    expect(isUnsafeIPv4("not-an-ip")).toBe(true);
    expect(isUnsafeIPv4("1.2.3")).toBe(true);
    expect(isUnsafeIPv4("1.2.3.999")).toBe(true);
  });
});

describe("isUnsafeIPv6", () => {
  it("allows an ordinary public address", () => {
    expect(isUnsafeIPv6("2606:4700:4700::1111")).toBe(false);
  });

  it("blocks loopback and unspecified", () => {
    expect(isUnsafeIPv6("::1")).toBe(true);
    expect(isUnsafeIPv6("::")).toBe(true);
  });

  it("blocks link-local (fe80::/10) and unique-local (fc00::/7)", () => {
    expect(isUnsafeIPv6("fe80::1")).toBe(true);
    expect(isUnsafeIPv6("fc00::1")).toBe(true);
    expect(isUnsafeIPv6("fd12:3456:789a::1")).toBe(true);
  });

  it("blocks multicast (ff00::/8)", () => {
    expect(isUnsafeIPv6("ff02::1")).toBe(true);
  });

  it("blocks IPv4-mapped addresses whose embedded IPv4 is unsafe", () => {
    expect(isUnsafeIPv6("::ffff:127.0.0.1")).toBe(true);
    expect(isUnsafeIPv6("::ffff:169.254.169.254")).toBe(true);
    expect(isUnsafeIPv6("::ffff:8.8.8.8")).toBe(false);
  });

  it("fails closed on malformed addresses", () => {
    expect(isUnsafeIPv6("not-an-ipv6")).toBe(true);
  });
});

describe("safeFetch", () => {
  const okIssue = vi.fn(async () => ({ status: 200, headers: {} }));

  it("allows a request to a public address and pins the connection to the resolved IP", async () => {
    const issueRequest = vi.fn(async (opts) => {
      expect(opts.pinnedAddress).toBe("93.184.216.34");
      return { status: 200, headers: {} };
    });
    const result = await safeFetch("https://example.com/webhook", {}, { lookupAll: lookupOf([v4("93.184.216.34")]), issueRequest });
    expect(result).toEqual({ ok: true, status: 200 });
    expect(issueRequest).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["loopback", v4("127.0.0.1")],
    ["RFC1918 private", v4("10.1.2.3")],
    ["link-local", v4("169.254.1.1")],
    ["cloud metadata address", v4("169.254.169.254")],
    ["multicast", v4("224.0.0.1")],
    ["IPv6 loopback", v6("::1")],
    ["IPv6 unique-local", v6("fd00::1")],
    ["IPv6 link-local", v6("fe80::1")],
  ])("blocks a destination that resolves to %s", async (_label, address) => {
    const issueRequest = vi.fn();
    await expect(safeFetch("https://internal.example/x", {}, { lookupAll: lookupOf([address]), issueRequest })).rejects.toBeInstanceOf(
      BlockedDestinationError
    );
    expect(issueRequest).not.toHaveBeenCalled();
  });

  it("rejects malformed URLs", async () => {
    const issueRequest = vi.fn();
    await expect(safeFetch("not a url", {}, { issueRequest })).rejects.toBeInstanceOf(BlockedDestinationError);
    expect(issueRequest).not.toHaveBeenCalled();
  });

  it("rejects unsupported schemes", async () => {
    const issueRequest = vi.fn();
    await expect(safeFetch("ftp://example.com/x", {}, { issueRequest })).rejects.toBeInstanceOf(BlockedDestinationError);
    await expect(safeFetch("file:///etc/passwd", {}, { issueRequest })).rejects.toBeInstanceOf(BlockedDestinationError);
    expect(issueRequest).not.toHaveBeenCalled();
  });

  it("rejects URLs with embedded credentials", async () => {
    const issueRequest = vi.fn();
    await expect(
      safeFetch("https://user:pass@example.com/x", {}, { lookupAll: lookupOf([v4("93.184.216.34")]), issueRequest })
    ).rejects.toBeInstanceOf(BlockedDestinationError);
    expect(issueRequest).not.toHaveBeenCalled();
  });

  it("blocks the whole hostname when DNS returns multiple answers and even one is unsafe", async () => {
    const issueRequest = vi.fn();
    await expect(
      safeFetch("https://multi.example/x", {}, { lookupAll: lookupOf([v4("93.184.216.34"), v4("127.0.0.1")]), issueRequest })
    ).rejects.toBeInstanceOf(BlockedDestinationError);
    expect(issueRequest).not.toHaveBeenCalled();
  });

  it("follows a public-to-public redirect, re-validating the new destination", async () => {
    const issueRequest = vi
      .fn()
      .mockResolvedValueOnce({ status: 302, headers: { location: "https://example-cdn.com/final" } })
      .mockResolvedValueOnce({ status: 200, headers: {} });
    const lookupAll = vi.fn(async (hostname: string) => (hostname === "example.com" ? [v4("93.184.216.34")] : [v4("151.101.1.1")]));

    const result = await safeFetch("https://example.com/webhook", {}, { lookupAll, issueRequest });
    expect(result).toEqual({ ok: true, status: 200 });
    expect(issueRequest).toHaveBeenCalledTimes(2);
    expect(lookupAll).toHaveBeenCalledWith("example-cdn.com");
  });

  it("blocks a redirect from a public address to a private address", async () => {
    const issueRequest = vi
      .fn()
      .mockResolvedValueOnce({ status: 302, headers: { location: "http://internal.local/admin" } });
    const lookupAll = vi.fn(async (hostname: string) => (hostname === "example.com" ? [v4("93.184.216.34")] : [v4("10.0.0.5")]));

    await expect(safeFetch("https://example.com/webhook", {}, { lookupAll, issueRequest })).rejects.toBeInstanceOf(BlockedDestinationError);
    expect(issueRequest).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect to localhost", async () => {
    const issueRequest = vi.fn().mockResolvedValueOnce({ status: 302, headers: { location: "http://127.0.0.1/admin" } });
    const lookupAll = vi.fn(async (hostname: string) => (hostname === "example.com" ? [v4("93.184.216.34")] : [v4("127.0.0.1")]));

    await expect(safeFetch("https://example.com/webhook", {}, { lookupAll, issueRequest })).rejects.toBeInstanceOf(BlockedDestinationError);
    expect(issueRequest).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect to the cloud metadata address", async () => {
    const issueRequest = vi
      .fn()
      .mockResolvedValueOnce({ status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
    const lookupAll = vi.fn(async (hostname: string) => (hostname === "example.com" ? [v4("93.184.216.34")] : [v4("169.254.169.254")]));

    await expect(safeFetch("https://example.com/webhook", {}, { lookupAll, issueRequest })).rejects.toBeInstanceOf(BlockedDestinationError);
    expect(issueRequest).toHaveBeenCalledTimes(1);
  });

  it("detects a redirect loop", async () => {
    const issueRequest = vi.fn(async (opts: { path: string }) => {
      const next = opts.path === "/a" ? "/b" : "/a";
      return { status: 302, headers: { location: `https://example.com${next}` } };
    });
    await expect(
      safeFetch("https://example.com/a", {}, { lookupAll: lookupOf([v4("93.184.216.34")]), issueRequest })
    ).rejects.toBeInstanceOf(BlockedDestinationError);
  });

  it("gives up after an excessive number of redirects", async () => {
    let hop = 0;
    const issueRequest = vi.fn(async () => {
      hop++;
      return { status: 302, headers: { location: `https://example.com/hop-${hop}` } };
    });
    await expect(
      safeFetch("https://example.com/hop-0", { maxRedirects: 3 }, { lookupAll: lookupOf([v4("93.184.216.34")]), issueRequest })
    ).rejects.toBeInstanceOf(BlockedDestinationError);
    // Initial request + 3 allowed redirect hops = 4 calls before giving up on the 4th redirect.
    expect(issueRequest).toHaveBeenCalledTimes(4);
  });

  it("never reaches the network layer for an unsafe destination", async () => {
    const issueRequest = vi.fn();
    await expect(
      safeFetch("https://internal.example/x", {}, { lookupAll: lookupOf([v4("10.0.0.1")]), issueRequest })
    ).rejects.toBeInstanceOf(BlockedDestinationError);
    expect(issueRequest).not.toHaveBeenCalled();
  });

  it("does not leak internal DNS/IP details in the thrown error", async () => {
    try {
      await safeFetch("https://internal.example/x", {}, { lookupAll: lookupOf([v4("10.0.0.1")]) });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BlockedDestinationError);
      const message = (error as Error).message;
      expect(message).not.toContain("10.0.0.1");
      expect(message).not.toContain("internal.example");
    }
  });

  it("surfaces a non-2xx upstream status as ok: false without throwing", async () => {
    const issueRequest = vi.fn(async () => ({ status: 500, headers: {} }));
    const result = await safeFetch("https://example.com/webhook", {}, { lookupAll: lookupOf([v4("93.184.216.34")]), issueRequest });
    expect(result).toEqual({ ok: false, status: 500 });
  });

  void okIssue;
});
