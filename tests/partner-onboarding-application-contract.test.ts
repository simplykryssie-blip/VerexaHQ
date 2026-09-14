import { describe, it, expect } from "vitest";
import { validatePartnerOnboardingApplication } from "@/lib/partnerOnboardingApplication";

// Phase 6J-1, Test A -- the application data contract is pure TypeScript
// (no database round-trip), so this is a plain unit test rather than a live
// Supabase check. The RPC itself (submit_partner_onboarding_application)
// still accepts any jsonb, exactly as before -- this contract is what the
// future partner-facing form (Phase 6J-2) validates against before ever
// calling it.

const validApplication = {
  legal_business_name: "Doucet Tax Group LLC",
  entity_type: "llc",
  business_address: "123 Main St, Lafayette, LA 70501",
  business_phone: "337-555-0100",
  business_email: "office@doucettax.example",
  applicant_full_name: "Jane Doucet",
  has_active_ptin: true,
  years_preparing_taxes: 8,
  irs_suspension_or_sanction: false,
  services_offered: ["individual_returns", "business_returns"],
  expected_annual_return_volume: 450,
  number_of_preparers: 3,
};

describe("validatePartnerOnboardingApplication", () => {
  it("accepts a complete, valid application", () => {
    const result = validatePartnerOnboardingApplication(validApplication);
    expect(result.ok).toBe(true);
  });

  it("accepts a valid application with every optional field omitted", () => {
    const result = validatePartnerOnboardingApplication(validApplication);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.dba).toBeUndefined();
      expect(result.data.website).toBeUndefined();
    }
  });

  it("accepts a valid application with optional fields populated", () => {
    const result = validatePartnerOnboardingApplication({
      ...validApplication,
      dba: "Doucet Tax",
      website: "doucettax.example",
      has_active_efin: true,
      years_in_business: 6,
      prior_tax_software: "Drake",
      prior_ero_sb_relationship: true,
      prior_ero_sb_relationship_details: "Previously with Acme ERO",
      individual_business_return_mix: "70/30",
      schedule_c_experience: true,
      preparer_names: ["Jane Doucet", "John Smith"],
      partnership_goals: "Grow bank product volume",
      additional_information: "None",
    });
    expect(result.ok).toBe(true);
  });

  it.each(["legal_business_name", "entity_type", "business_address", "business_phone", "business_email", "applicant_full_name", "has_active_ptin", "years_preparing_taxes", "irs_suspension_or_sanction", "services_offered", "expected_annual_return_volume", "number_of_preparers"])(
    "rejects a submission missing required field %s",
    (field) => {
      const { [field]: _omitted, ...rest } = validApplication as Record<string, unknown>;
      const result = validatePartnerOnboardingApplication(rest);
      expect(result.ok).toBe(false);
    }
  );

  it("rejects an invalid business_email", () => {
    const result = validatePartnerOnboardingApplication({ ...validApplication, business_email: "not-an-email" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("business_email"))).toBe(true);
  });

  it("rejects an invalid website URL when supplied", () => {
    const result = validatePartnerOnboardingApplication({ ...validApplication, website: "not a url at all" });
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid entity_type", () => {
    const result = validatePartnerOnboardingApplication({ ...validApplication, entity_type: "shell_corp" });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-numeric years_preparing_taxes", () => {
    const result = validatePartnerOnboardingApplication({ ...validApplication, years_preparing_taxes: "eight" });
    expect(result.ok).toBe(false);
  });

  it("rejects an out-of-range years_preparing_taxes", () => {
    const result = validatePartnerOnboardingApplication({ ...validApplication, years_preparing_taxes: 999 });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-boolean has_active_ptin", () => {
    const result = validatePartnerOnboardingApplication({ ...validApplication, has_active_ptin: "yes" });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty services_offered array", () => {
    const result = validatePartnerOnboardingApplication({ ...validApplication, services_offered: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects an unrecognized services_offered value", () => {
    const result = validatePartnerOnboardingApplication({ ...validApplication, services_offered: ["crypto_advisory"] });
    expect(result.ok).toBe(false);
  });

  it("rejects a negative expected_annual_return_volume", () => {
    const result = validatePartnerOnboardingApplication({ ...validApplication, expected_annual_return_volume: -5 });
    expect(result.ok).toBe(false);
  });

  for (const sensitiveField of ["ptin_number", "efin_number", "ein", "ssn", "bank_account_number", "routing_number", "password"]) {
    it(`rejects a submission carrying a sensitive credential field (${sensitiveField})`, () => {
      const result = validatePartnerOnboardingApplication({ ...validApplication, [sensitiveField]: "123456789" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some((e) => e.includes(sensitiveField))).toBe(true);
    });
  }

  it("does not flag the legitimate has_active_ptin/has_active_efin status fields as sensitive", () => {
    const result = validatePartnerOnboardingApplication({ ...validApplication, has_active_efin: false });
    expect(result.ok).toBe(true);
  });

  it("rejects a non-object input", () => {
    expect(validatePartnerOnboardingApplication("not an object").ok).toBe(false);
    expect(validatePartnerOnboardingApplication(null).ok).toBe(false);
    expect(validatePartnerOnboardingApplication([]).ok).toBe(false);
  });
});
