import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";

// VEREXA ZOOM-DAST-001: regression coverage for the three narrow header
// fixes applied in response to the Zoom DAST baseline run (ZAP alerts
// "Missing Anti-clickjacking Header", "X-Content-Type-Options Header
// Missing", and "Server Leaks Information via X-Powered-By HTTP Response
// Header Field"). Deliberately does not test CSP -- that remediation is
// intentionally not implemented yet.
describe("global security response headers", () => {
  it("disables the X-Powered-By header", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("applies X-Frame-Options: DENY and X-Content-Type-Options: nosniff to every route", async () => {
    expect(nextConfig.headers).toBeDefined();
    const rules = await nextConfig.headers!();
    const globalRule = rules.find((rule) => rule.source === "/:path*");

    expect(globalRule).toBeDefined();
    expect(globalRule?.headers).toEqual(
      expect.arrayContaining([
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ])
    );
  });
});
