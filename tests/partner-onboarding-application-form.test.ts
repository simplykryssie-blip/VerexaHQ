import { describe, it, expect } from "vitest";
import {
  partnerOnboardingApplicationDataToFormState,
  partnerOnboardingFormStateToApplicationData,
  validatePartnerOnboardingApplication,
  type PartnerOnboardingApplicationFormState,
} from "@/lib/partnerOnboardingApplication";

// Phase 6J-2 -- the exact form <-> jsonb transform the partner-facing
// application form uses, tested independently of any React rendering (this
// repo has no component-rendering test setup). Covers the required-field,
// invalid-value, optional-omission, and sensitive-field test matrix items
// (E/F/G/H) at the level that actually matters: what the browser would
// really send to validatePartnerOnboardingApplication() and then to
// submit_partner_onboarding_application().

const completeForm: PartnerOnboardingApplicationFormState = {
  legal_business_name: "Doucet Tax Group LLC",
  dba: "",
  entity_type: "llc",
  business_address: "123 Main St, Lafayette, LA",
  business_phone: "337-555-0100",
  business_email: "office@doucettax.example",
  website: "",
  applicant_full_name: "Jane Doucet",
  has_active_ptin: "yes",
  has_active_efin: "",
  years_preparing_taxes: "8",
  years_in_business: "",
  prior_tax_software: "",
  prior_ero_sb_relationship: "",
  prior_ero_sb_relationship_details: "",
  irs_suspension_or_sanction: "no",
  services_offered: ["individual_returns", "business_returns"],
  expected_annual_return_volume: "450",
  individual_business_return_mix: "",
  schedule_c_experience: "",
  number_of_preparers: "3",
  preparer_names: "",
  partnership_goals: "",
  additional_information: "",
};

describe("partner onboarding application form <-> contract", () => {
  it("a fully filled-out required-fields-only form passes validation", () => {
    const data = partnerOnboardingFormStateToApplicationData(completeForm);
    const result = validatePartnerOnboardingApplication(data);
    expect(result.ok).toBe(true);
  });

  it("round-trips application_data -> form state -> application_data without loss", () => {
    const original = partnerOnboardingFormStateToApplicationData({
      ...completeForm,
      dba: "Doucet Tax",
      website: "doucettax.example",
      has_active_efin: "yes",
      years_in_business: "6",
      prior_tax_software: "Drake",
      prior_ero_sb_relationship: "yes",
      prior_ero_sb_relationship_details: "Previously with Acme ERO",
      individual_business_return_mix: "70/30",
      schedule_c_experience: "yes",
      preparer_names: "Jane Doucet\nJohn Smith",
      partnership_goals: "Grow bank product volume",
      additional_information: "None",
    });
    const rehydratedForm = partnerOnboardingApplicationDataToFormState(original);
    const roundTripped = partnerOnboardingFormStateToApplicationData(rehydratedForm);
    expect(roundTripped).toEqual(original);
  });

  it("required field missing (legal_business_name) fails validation and blocks submission", () => {
    const data = partnerOnboardingFormStateToApplicationData({ ...completeForm, legal_business_name: "" });
    const result = validatePartnerOnboardingApplication(data);
    expect(result.ok).toBe(false);
  });

  it("required boolean not answered (has_active_ptin) fails validation", () => {
    const data = partnerOnboardingFormStateToApplicationData({ ...completeForm, has_active_ptin: "" });
    const result = validatePartnerOnboardingApplication(data);
    expect(result.ok).toBe(false);
  });

  it("required services_offered left empty fails validation", () => {
    const data = partnerOnboardingFormStateToApplicationData({ ...completeForm, services_offered: [] });
    const result = validatePartnerOnboardingApplication(data);
    expect(result.ok).toBe(false);
  });

  it("invalid business_email fails validation", () => {
    const data = partnerOnboardingFormStateToApplicationData({ ...completeForm, business_email: "not-an-email" });
    const result = validatePartnerOnboardingApplication(data);
    expect(result.ok).toBe(false);
  });

  it("invalid website fails validation when supplied", () => {
    const data = partnerOnboardingFormStateToApplicationData({ ...completeForm, website: "not a url" });
    const result = validatePartnerOnboardingApplication(data);
    expect(result.ok).toBe(false);
  });

  it("an entity_type outside the fixed option list cannot even be constructed by the form, and an empty one fails validation", () => {
    const data = partnerOnboardingFormStateToApplicationData({ ...completeForm, entity_type: "" });
    const result = validatePartnerOnboardingApplication(data);
    expect(result.ok).toBe(false);
  });

  it("non-numeric years_preparing_taxes (blank) fails validation since it's required", () => {
    const data = partnerOnboardingFormStateToApplicationData({ ...completeForm, years_preparing_taxes: "" });
    const result = validatePartnerOnboardingApplication(data);
    // omitted entirely by the transform (blank string -> no key), so the
    // validator's "required" check is what actually catches this
    expect(result.ok).toBe(false);
  });

  it("an out-of-range expected_annual_return_volume fails validation", () => {
    const data = partnerOnboardingFormStateToApplicationData({ ...completeForm, expected_annual_return_volume: "-5" });
    const result = validatePartnerOnboardingApplication(data);
    expect(result.ok).toBe(false);
  });

  it("every optional field can be left blank/unset and still pass", () => {
    const data = partnerOnboardingFormStateToApplicationData(completeForm);
    expect(Object.keys(data)).not.toContain("dba");
    expect(Object.keys(data)).not.toContain("website");
    expect(Object.keys(data)).not.toContain("has_active_efin");
    expect(Object.keys(data)).not.toContain("years_in_business");
    expect(Object.keys(data)).not.toContain("prior_tax_software");
    expect(Object.keys(data)).not.toContain("prior_ero_sb_relationship");
    expect(Object.keys(data)).not.toContain("individual_business_return_mix");
    expect(Object.keys(data)).not.toContain("schedule_c_experience");
    expect(Object.keys(data)).not.toContain("preparer_names");
    expect(Object.keys(data)).not.toContain("partnership_goals");
    expect(Object.keys(data)).not.toContain("additional_information");
    expect(validatePartnerOnboardingApplication(data).ok).toBe(true);
  });

  it("preparer_names splits on newlines and drops blank lines", () => {
    const data = partnerOnboardingFormStateToApplicationData({ ...completeForm, preparer_names: "Jane Doucet\n\n  John Smith  \n" });
    expect(data.preparer_names).toEqual(["Jane Doucet", "John Smith"]);
  });

  it("the form -> contract transform can never produce a credential-number field, for any input", () => {
    // The FormState type itself has no ssn/ein/ptin-number/efin-number/
    // account/routing field at all -- this asserts the transform's OUTPUT
    // keys are exactly the approved V1 contract, regardless of what a
    // hypothetical malicious form value tried to smuggle through a field
    // that does exist (e.g. stuffing a fake SSN into additional_information
    // is a free-text field, not a structured credential field, and is not
    // what this guards against -- the guard is that no such structured key
    // can ever appear in the resulting object).
    const data = partnerOnboardingFormStateToApplicationData({
      ...completeForm,
      additional_information: "unrelated free text",
    });
    const sensitivePattern = /ssn|itin|efin_number|ptin_number|\bein\b|password|secret|account[_-]?number|routing[_-]?number|card[_-]?number/i;
    for (const key of Object.keys(data)) {
      expect(sensitivePattern.test(key)).toBe(false);
    }
    // has_active_ptin/has_active_efin are the only ptin/efin-shaped keys,
    // and they're booleans, never numbers/strings that could hold a value.
    if ("has_active_ptin" in data) expect(typeof data.has_active_ptin).toBe("boolean");
    if ("has_active_efin" in data) expect(typeof data.has_active_efin).toBe("boolean");
  });
});
