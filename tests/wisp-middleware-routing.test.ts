// WISP Step 5 fix: on a workspace's own custom domain (e.g.
// monarchtaxsuite.com, not an app hostname), middleware.ts used to rewrite
// EVERY /api/* request to the custom-domain page resolver unless its path
// matched CROSS_DOMAIN_SAFE_PATH_PREFIXES -- and /api/wisp/verify wasn't
// listed. The rewrite treats the first path segment as a page slug
// ("api", for this path), which doesn't exist, so it 404s with an HTML
// page. The WISP frontend's post() helper tries to JSON.parse that HTML,
// fails, and falls back to its generic "Email service did not respond
// successfully." message -- exactly the symptom reported, on every single
// send/verify/capture call, regardless of Resend/Supabase configuration.
// This proves /api/wisp/ is now treated the same as the existing /api/o/
// and /api/e/ cross-domain-safe prefixes: a request to it on a non-app
// hostname falls through to the real route instead of being rewritten.
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("middleware -- /api/wisp/ is reachable on a workspace's custom domain", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("does NOT rewrite a POST to /api/wisp/verify on a custom domain to the page-slug resolver", async () => {
    const updateSessionStub = vi.fn(() => new Response("updateSession reached", { status: 200 }));
    vi.doMock("@/lib/supabase/middleware", () => ({ updateSession: updateSessionStub }));

    const { NextRequest } = await import("next/server");
    const { middleware } = await import("@/middleware");

    const request = new NextRequest("https://monarchtaxsuite.com/api/wisp/verify", {
      method: "POST",
      headers: { host: "monarchtaxsuite.com" },
    });

    const response = await middleware(request);

    // The old behavior rewrote to /site/custom-domain/api (first path
    // segment treated as a page slug) and never reached updateSession at
    // all -- this is the exact regression being guarded against.
    expect(updateSessionStub).toHaveBeenCalledTimes(1);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();

    vi.doUnmock("@/lib/supabase/middleware");
  });

  it("still rewrites an unrelated /api/* path on a custom domain to the page-slug resolver (prefix is scoped, not a blanket /api/ bypass)", async () => {
    const updateSessionStub = vi.fn(() => new Response("updateSession reached", { status: 200 }));
    vi.doMock("@/lib/supabase/middleware", () => ({ updateSession: updateSessionStub }));

    const { NextRequest } = await import("next/server");
    const { middleware } = await import("@/middleware");

    const request = new NextRequest("https://monarchtaxsuite.com/api/some-other-staff-route", {
      method: "POST",
      headers: { host: "monarchtaxsuite.com" },
    });

    const response = await middleware(request);

    expect(updateSessionStub).not.toHaveBeenCalled();
    expect(response.headers.get("x-middleware-rewrite")).toContain("/site/custom-domain/api");

    vi.doUnmock("@/lib/supabase/middleware");
  });

  it("still reaches the real route for /api/wisp/verify on the app's own hostname (unaffected by the custom-domain rewrite at all)", async () => {
    const updateSessionStub = vi.fn(() => new Response("updateSession reached", { status: 200 }));
    vi.doMock("@/lib/supabase/middleware", () => ({ updateSession: updateSessionStub }));

    const { NextRequest } = await import("next/server");
    const { middleware } = await import("@/middleware");

    const request = new NextRequest("https://app.verexahq.com/api/wisp/verify", {
      method: "POST",
      headers: { host: "app.verexahq.com" },
    });
    process.env.NEXT_PUBLIC_APP_URL = "https://app.verexahq.com";

    const response = await middleware(request);

    expect(updateSessionStub).toHaveBeenCalledTimes(1);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();

    vi.doUnmock("@/lib/supabase/middleware");
  });
});
