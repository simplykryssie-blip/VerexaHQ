// VEREXA-AAL-001: source-level regression coverage proving exactly which
// API routes call hasAal2() and which deliberately don't, matching the
// classification from the approved remediation design (Session 50/51).
// Mirrors this repo's existing convention for asserting source wiring
// (e.g. tests/contacts-phase4b-notes-editor.test.ts) rather than spinning
// up a live request for each of ~20 routes.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function callsHasAal2(src: string): boolean {
  // The import brace can carry other names alongside hasAal2 now --
  // AAL2_REQUIRED_RESPONSE_BODY/AAL2_REQUIRED_STATUS (JSON routes) or
  // AAL2_REQUIRED_RESPONSE_BODY/AAL2_REQUIRED_CODE (the two redirect-based
  // Stripe Connect routes) -- see Session 2026-10-07's MFA enrollment/UX
  // remediation. \bhasAal2\b anywhere inside the braces is what matters.
  return /import\s*\{[^}]*\bhasAal2\b[^}]*\}\s*from\s*"@\/lib\/auth\/requireAal2";/.test(src) && /hasAal2\(/.test(src);
}

function returnsAal2RequiredBody(src: string): boolean {
  return /AAL2_REQUIRED_RESPONSE_BODY/.test(src);
}

describe("VEREXA-AAL-001: high-impact API routes enforce hasAal2()", () => {
  const protectedRoutes = [
    "app/api/stripe/refund/route.ts",
    "app/api/stripe/connect/start/route.ts",
    "app/api/stripe/connect/callback/route.ts",
    "app/api/stripe/connect/disconnect/route.ts",
    "app/api/stripe/connect/refresh/route.ts",
    "app/api/billing/add-card/route.ts",
    "app/api/settings/seats/purchase/route.ts",
    "app/api/settings/seats/remove/route.ts",
    "app/api/firm-connections/[id]/accept-billing/route.ts",
    "app/api/firm-connections/[id]/release-billing/route.ts",
    "app/api/firm-connections/[id]/disconnect/route.ts",
    "app/api/platform-admin/accounts/update-email/route.ts",
    "app/api/platform-admin/legacy-billing-migration/route.ts",
    "app/api/platform-admin/legal-archive/[id]/retry/route.ts",
    "app/api/platform-admin/provision-workspace/route.ts",
    "app/api/platform-admin/run-cron-job/route.ts",
    "app/api/invitations/route.ts",
    "app/api/platform-it-invitations/route.ts",
    "app/api/email-domain/create/route.ts",
    "app/api/email-domain/disconnect/route.ts",
    "app/api/email-domain/set-primary/route.ts",
    "app/api/websites/[id]/attach-domain/route.ts",
    "app/api/settings/mfa/unenroll/route.ts",
  ];

  it.each(protectedRoutes)("%s calls hasAal2()", (route) => {
    expect(callsHasAal2(source(route))).toBe(true);
  });

  // Every one of these routes returns a JSON body (not a redirect, unlike
  // stripe/connect/start and .../callback below), so they can all use the
  // single shared AAL2_REQUIRED_RESPONSE_BODY/AAL2_REQUIRED_STATUS constants
  // instead of each inlining the same error object -- see
  // lib/auth/requireAal2.ts and components/mfa/Aal2GateProvider.tsx, which
  // relies on every one of these returning the same `code: "aal2_required"`
  // shape to detect the error without matching on the human message text.
  it.each(protectedRoutes)("%s returns the shared AAL2_REQUIRED_RESPONSE_BODY (carries code: \"aal2_required\")", (route) => {
    expect(returnsAal2RequiredBody(source(route))).toBe(true);
  });

  // The two redirect-based Stripe Connect routes can't return a JSON body
  // (the browser is mid-OAuth-redirect) -- they signal the same condition
  // via an `aal2_required` query param instead, which
  // app/(app)/settings/integrations/page.tsx + ConnectStripeButton.tsx read
  // to render the same "Set Up Two-Factor Authentication" CTA.
  const redirectBasedAal2Routes = ["app/api/stripe/connect/start/route.ts", "app/api/stripe/connect/callback/route.ts"];

  it.each(redirectBasedAal2Routes)("%s signals aal2_required via a query param, not a JSON body", (route) => {
    const src = source(route);
    expect(callsHasAal2(src)).toBe(true);
    expect(src).toMatch(/searchParams\.set\("aal2_required",\s*AAL2_REQUIRED_CODE\)/);
  });

  const deliberatelyUnprotectedRoutes = [
    "app/api/auth/login/route.ts",
    "app/api/auth/sign-out/route.ts",
    "app/api/cron/check-overdue-invoices/route.ts",
    "app/api/stripe/webhook/route.ts",
    "app/api/public/booking/context/route.ts",
    "app/api/portal/book-appointment/route.ts",
    "app/api/email-domain/verify/route.ts",
    "app/api/websites/[id]/verify-domain/route.ts",
    "app/api/workspace/switch/route.ts",
  ];

  it.each(deliberatelyUnprotectedRoutes)("%s does NOT call hasAal2() -- out of AAL-001's classified scope", (route) => {
    expect(callsHasAal2(source(route))).toBe(false);
  });
});

describe("VEREXA-AAL-001: new server-side MFA unenroll route", () => {
  const routeSource = source("app/api/settings/mfa/unenroll/route.ts");

  it("checks hasAal2() before calling the service-role admin deleteFactor API", () => {
    const aalIndex = routeSource.indexOf("hasAal2(");
    const deleteIndex = routeSource.indexOf("deleteFactor(");
    expect(aalIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(-1);
    expect(aalIndex).toBeLessThan(deleteIndex);
  });

  it("scopes the delete to the request's own verified user -- never a client-supplied userId", () => {
    expect(routeSource).toMatch(/deleteFactor\(\{\s*userId:\s*user\.id,\s*id:\s*factorId\s*\}\)/);
    expect(routeSource).not.toMatch(/userId:\s*body/);
  });

  it("MfaSetup.tsx calls the new server-side route instead of the direct client-side unenroll()", () => {
    const mfaSetupSource = source("app/(app)/settings/security/MfaSetup.tsx");
    expect(mfaSetupSource).toMatch(/fetch\("\/api\/settings\/mfa\/unenroll"/);
    expect(mfaSetupSource).not.toMatch(/supabase\.auth\.mfa\.unenroll\(/);
  });
});
