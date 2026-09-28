// Regression coverage for the MKB stuck-pending bug: syncResendDomainStatus
// used to trigger Resend's /verify (which resets status to "pending" while
// it re-checks) and then read back after one fixed 4s sleep -- if the real
// check took longer, the read captured the transient reset instead of the
// settled result, and the recurring cron repeated this same cycle on every
// run rather than ever safely correcting a false "pending". The fix: the
// cron now does a plain read (readResendDomainStatus, no /verify trigger --
// Resend re-checks pending domains on its own), and the manual "Check
// verification" button (syncResendDomainStatus) polls for a settled result
// instead of trusting a single read immediately after triggering /verify.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/providerStatus", () => ({ isEmailConfigured: () => true }));

import { readResendDomainStatus, syncResendDomainStatus } from "@/lib/email/domains";

function domainPayload(status: string) {
  return {
    id: "domain-1",
    name: "example.com",
    status,
    records: [{ record: "DKIM", name: "resend._domainkey", type: "TXT", ttl: "Auto", status, value: "v=..." }],
  };
}

describe("readResendDomainStatus", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does a single plain GET, mapping Resend's response directly, with no /verify side effect", async () => {
    const payload = domainPayload("verified");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal("fetch", fetchMock);

    const result = await readResendDomainStatus("domain-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.resend.com/domains/domain-1");
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("method");
    expect(result).toEqual({ ok: true, data: { domain: "example.com", status: "verified", dns_records: payload.records } });
  });

  it("reports a still-pending domain as pending without ever calling /verify", async () => {
    const payload = domainPayload("pending");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal("fetch", fetchMock);

    const result = await readResendDomainStatus("domain-1");

    expect(result.ok && result.data.status).toBe("pending");
    expect(fetchMock.mock.calls.every((call) => !String(call[0]).includes("/verify"))).toBe(true);
  });
});

describe("syncResendDomainStatus", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    // The poll delays aren't the behavior under test -- collapse them to
    // immediate so the test doesn't spend real wall-clock time on them.
    vi.stubGlobal("setTimeout", ((fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("keeps polling past a transient post-/verify pending reset instead of trusting the first read-back", async () => {
    let getCalls = 0;
    const verifiedPayload = domainPayload("verified");
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/verify")) {
        return { ok: true, json: async () => ({ id: "domain-1", status: "pending" }) };
      }
      getCalls += 1;
      const payload = getCalls < 3 ? domainPayload("pending") : verifiedPayload;
      return { ok: true, json: async () => payload };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncResendDomainStatus("domain-1");

    expect(result).toEqual({ ok: true, data: { domain: "example.com", status: "verified", dns_records: verifiedPayload.records } });
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("/verify")).length).toBe(1);
    expect(getCalls).toBe(3);
  });

  it("gives up after exhausting its poll budget and returns the last-seen status rather than looping forever", async () => {
    const pendingPayload = domainPayload("pending");
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/verify")) return { ok: true, json: async () => ({ id: "domain-1", status: "pending" }) };
      return { ok: true, json: async () => pendingPayload };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncResendDomainStatus("domain-1");

    expect(result).toEqual({ ok: true, data: { domain: "example.com", status: "pending", dns_records: pendingPayload.records } });
  });
});
