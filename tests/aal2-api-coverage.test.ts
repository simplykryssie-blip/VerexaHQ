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
  return /import\s*\{\s*hasAal2\s*\}\s*from\s*"@\/lib\/auth\/requireAal2";/.test(src) && /hasAal2\(/.test(src);
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
