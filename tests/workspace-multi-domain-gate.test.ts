// Coverage for the multi-domain sending gate: an ERO Office or Service
// Bureau workspace can attach more than one sending domain
// (app/api/email-domain/create/route.ts), every other workspace type
// stays capped at one -- same as before this feature existed.
import { describe, it, expect } from "vitest";
import { canUseMultipleSendingDomains } from "@/lib/workspaceCapabilities";

describe("canUseMultipleSendingDomains", () => {
  it("allows an ero_office workspace", () => {
    expect(canUseMultipleSendingDomains({ workspace_type: "ero_office" })).toBe(true);
  });

  it("allows a service_bureau workspace", () => {
    expect(canUseMultipleSendingDomains({ workspace_type: "service_bureau" })).toBe(true);
  });

  it("does not allow an independent_ptin workspace", () => {
    expect(canUseMultipleSendingDomains({ workspace_type: "independent_ptin" })).toBe(false);
  });

  it("does not allow a multi_office_firm workspace", () => {
    expect(canUseMultipleSendingDomains({ workspace_type: "multi_office_firm" })).toBe(false);
  });

  it("does not allow a platform_admin workspace", () => {
    expect(canUseMultipleSendingDomains({ workspace_type: "platform_admin" })).toBe(false);
  });
});
