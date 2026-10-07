// MFA enrollment/UX remediation (Session 2026-10-07): the AAL2 policy
// itself (tests/aal2-api-coverage.test.ts, tests/require-aal2.test.ts,
// tests/aal-middleware.test.ts) is untouched -- this file covers the new
// problem it surfaced: an account with zero MFA factors had no clear path
// to enroll, and every gated action's 403 was a dead end ("This action
// requires two-factor verification" with nothing to click). Mirrors this
// repo's existing convention of asserting source wiring over spinning up a
// live render for every one of these call sites (see
// tests/aal2-api-coverage.test.ts's own header comment).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { aal2RecoveryPath, isAal2RequiredError } from "@/lib/auth/aal2Client";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("lib/auth/aal2Client.ts -- pure logic", () => {
  describe("isAal2RequiredError", () => {
    it("true for the exact shape every hasAal2() route returns", () => {
      expect(isAal2RequiredError({ error: "anything", code: "aal2_required" })).toBe(true);
    });

    it("false for a different error code (a permission denial, a validation error)", () => {
      expect(isAal2RequiredError({ error: "Not authorized", code: "forbidden" })).toBe(false);
      expect(isAal2RequiredError({ error: "domain is required" })).toBe(false);
    });

    it("never matches on the human message text alone -- only the code field", () => {
      expect(
        isAal2RequiredError({ error: "This action requires two-factor verification. Complete your authenticator challenge and try again." })
      ).toBe(false);
    });

    it("false for null/undefined/non-object bodies", () => {
      expect(isAal2RequiredError(null)).toBe(false);
      expect(isAal2RequiredError(undefined)).toBe(false);
      expect(isAal2RequiredError("aal2_required")).toBe(false);
    });
  });

  describe("aal2RecoveryPath", () => {
    it("routes a zero-factor account to /settings/security (the enrollment flow), not /mfa-challenge (a dead end for them)", () => {
      expect(aal2RecoveryPath(false, "/settings/integrations")).toBe("/settings/security?next=%2Fsettings%2Fintegrations");
    });

    it("routes an account with a verified factor to /mfa-challenge (just needs this session's challenge)", () => {
      expect(aal2RecoveryPath(true, "/settings/integrations")).toBe("/mfa-challenge?next=%2Fsettings%2Fintegrations");
    });

    it("falls back to /dashboard for a non-relative or protocol-relative next path -- no open redirect", () => {
      expect(aal2RecoveryPath(false, "https://evil.example/phish")).toBe("/settings/security?next=%2Fdashboard");
      expect(aal2RecoveryPath(false, "//evil.example")).toBe("/settings/security?next=%2Fdashboard");
    });
  });
});

describe("lib/auth/requireAal2.ts -- shared response shape", () => {
  const src = source("lib/auth/requireAal2.ts");

  it("exports AAL2_REQUIRED_RESPONSE_BODY carrying code: aal2_required", () => {
    expect(src).toMatch(/export const AAL2_REQUIRED_RESPONSE_BODY\s*=\s*\{/);
    expect(src).toMatch(/code:\s*AAL2_REQUIRED_CODE/);
    expect(src).toMatch(/export const AAL2_REQUIRED_CODE\s*=\s*"aal2_required"/);
  });

  it("keeps the exact original human error message -- every existing caller's error string stays unchanged", () => {
    expect(src).toContain("This action requires two-factor verification. Complete your authenticator challenge and try again.");
  });
});

describe("components/mfa/Aal2GateProvider.tsx -- the shared fallback UI", () => {
  const src = source("components/mfa/Aal2GateProvider.tsx");

  it("exposes useAal2Gate() and only triggers on the aal2_required shape, not any 403", () => {
    expect(src).toContain("export function useAal2Gate");
    expect(src).toContain("isAal2RequiredError(json)");
  });

  it("never shows a dead-end message -- always offers a CTA to the right recovery page", () => {
    expect(src).toMatch(/Set Up Two-Factor Authentication|Verify Two-Factor Authentication/);
    expect(src).toContain("aal2RecoveryPath(hasFactor");
  });

  it("is wired into app/(app)/layout.tsx so every page under it can use the hook", () => {
    const layoutSrc = source("app/(app)/layout.tsx");
    expect(layoutSrc).toContain("Aal2GateProvider");
  });
});

describe("components/MfaSetupBanner.tsx -- persistent, non-blocking", () => {
  const src = source("components/MfaSetupBanner.tsx");

  it("renders nothing once a verified factor exists -- never blocks normal CRM use", () => {
    expect(src).toMatch(/if \(hasVerifiedMfaFactor \|\| dismissed/);
  });

  it("can be dismissed for the session (non-blocking), persisted via sessionStorage not a permanent record", () => {
    expect(src).toMatch(/sessionStorage\.(get|set)Item/);
  });

  it("links straight to /settings/security, the real enrollment flow", () => {
    expect(src).toMatch(/href="\/settings\/security"/);
  });

  it("is wired into app/(app)/layout.tsx, driven by a server-computed hasVerifiedMfaFactor", () => {
    const layoutSrc = source("app/(app)/layout.tsx");
    expect(layoutSrc).toContain("<MfaSetupBanner hasVerifiedMfaFactor={hasVerifiedMfaFactor} />");
    expect(layoutSrc).toContain("supabase.auth.mfa.listFactors()");
  });
});

describe("app/(app)/settings/security/MfaSetup.tsx -- enrollment itself stays ungated, supports ?next=", () => {
  const src = source("app/(app)/settings/security/MfaSetup.tsx");

  it("enroll()/confirmEnroll() never call hasAal2 or require AAL2 before enrolling -- the bootstrap problem this whole remediation is about", () => {
    expect(src).not.toContain("hasAal2(");
    expect(src).not.toContain("requireAal2");
  });

  it("redirects back to the originating action via ?next= after a successful verify, same convention as /mfa-challenge", () => {
    expect(src).toContain('searchParams.get("next")');
    expect(src).toMatch(/next\.startsWith\("\/"\)/);
    expect(src).toMatch(/!next\.startsWith\("\/\/"\)/);
  });

  it("still routes factor removal through the server-side AAL2-gated route, not a direct client unenroll()", () => {
    expect(src).toMatch(/fetch\("\/api\/settings\/mfa\/unenroll"/);
    expect(src).not.toMatch(/supabase\.auth\.mfa\.unenroll\(/);
  });
});

describe("app/(app)/dashboard/page.tsx -- onboarding 'security' step reflects the real MFA signal", () => {
  const src = source("app/(app)/dashboard/page.tsx");

  it("checks the user's own verified MFA factor, not workspace_security_policies row existence", () => {
    expect(src).toContain("supabase.auth.mfa.listFactors()");
    expect(src).toContain("hasVerifiedMfaFactor");
    expect(src).not.toMatch(/securityPolicyCount/);
  });

  it("the step's complete flag is driven by hasVerifiedMfaFactor", () => {
    expect(src).toMatch(/key:\s*"security"[\s\S]{0,300}complete:\s*hasVerifiedMfaFactor/);
  });
});

describe("components/websites/WebsiteSettings.tsx -- fixed the always-/mfa-challenge dead end", () => {
  const src = source("components/websites/WebsiteSettings.tsx");

  it("no longer hardcodes a redirect straight to /mfa-challenge -- routes through aal2RecoveryPath, which checks factor existence first", () => {
    expect(src).not.toMatch(/router\.push\("\/mfa-challenge\?next="/);
    expect(src).toContain("aal2RecoveryPath(hasFactor, returnPath)");
  });

  it("detects the aal2_required condition via the machine-readable code, not the human error string", () => {
    expect(src).toContain("isAal2RequiredError(result)");
    expect(src).not.toMatch(/result\.error === "This action requires two-factor verification/);
  });
});

describe("components/settings/ConnectStripeButton.tsx -- redirect-based Stripe Connect flow", () => {
  const src = source("components/settings/ConnectStripeButton.tsx");

  it("renders a Set Up Two-Factor Authentication CTA when aal2Required, not just a bare error", () => {
    expect(src).toContain("aal2Required");
    expect(src).toMatch(/Set Up Two-Factor Authentication/);
  });

  it("the disconnect/refresh fetch calls route 403s through the shared gate too", () => {
    expect(src).toContain("useAal2Gate");
    expect((src.match(/handleAal2Response\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
