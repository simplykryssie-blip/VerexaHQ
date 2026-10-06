// Regression coverage for the "Connect Domain" false-negative bug: a
// domain already attached (and verified) on our own Vercel project still
// surfaced Vercel's raw "Cannot add X since it's already in use by one of
// your projects" error instead of being treated as success, because
// addProjectDomain's idempotency check only matched Vercel's
// domain_already_exists code -- the code Vercel actually returns for this
// case is domain_taken (confirmed live for taxavenuepro.com, which was
// already attached and verified on the project).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/providerStatus", () => ({ isVercelDomainAutomationConfigured: () => true }));

import { addProjectDomain } from "@/lib/vercel/domains";

function attachedDomainPayload(domain: string) {
  return { name: domain, apexName: domain, verified: true, verification: [] };
}

describe("addProjectDomain", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_API_TOKEN", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("passes through a successful attach", async () => {
    const payload = attachedDomainPayload("example.com");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal("fetch", fetchMock);

    const result = await addProjectDomain("example.com");

    expect(result).toEqual({ ok: true, data: payload });
  });

  it("treats a domain_taken error as success when the domain is already on this project", async () => {
    const payload = attachedDomainPayload("taxavenuepro.com");
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/domains?")) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: { code: "domain_taken", message: "Cannot add taxavenuepro.com since it's already in use by one of your projects." } }),
        };
      }
      // GET /v9/projects/:id/domains/:domain -- confirms it's already ours.
      return { ok: true, json: async () => payload };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await addProjectDomain("taxavenuepro.com");

    expect(result).toEqual({ ok: true, data: payload });
  });

  it("still treats domain_already_exists as idempotent success (existing behavior)", async () => {
    const payload = attachedDomainPayload("example.com");
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/domains?")) {
        return { ok: false, status: 409, json: async () => ({ error: { code: "domain_already_exists", message: "Domain already exists." } }) };
      }
      return { ok: true, json: async () => payload };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await addProjectDomain("example.com");

    expect(result).toEqual({ ok: true, data: payload });
  });

  it("checks the project's existing domains first and never calls POST when already attached", async () => {
    const payload = attachedDomainPayload("monarchtaxsuite.com");
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/domains?")) {
        throw new Error("POST /domains should not be called when the domain is already attached to this project");
      }
      return { ok: true, json: async () => payload };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await addProjectDomain("monarchtaxsuite.com");

    expect(result).toEqual({ ok: true, data: payload });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a real error when the domain is genuinely owned by someone else", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/domains?")) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: { code: "domain_taken", message: "Cannot add stolen.com since it's already in use by another account." } }),
        };
      }
      // GET /v9/projects/:id/domains/:domain -- not attached to this project (404).
      return { ok: false, status: 404, json: async () => ({ error: { code: "not_found" } }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await addProjectDomain("stolen.com");

    expect(result.ok).toBe(false);
  });
});
