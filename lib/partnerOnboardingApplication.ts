// Phase 6J-1: the shared partner onboarding application contract.
//
// partner_onboardings.application_data stays a plain jsonb column (Phase 6J
// product decision: do not convert it into a relational schema) -- this
// module is the one place that defines what shape a valid value actually
// has, so the future partner-facing form (Phase 6J-2) and any other caller
// validate against the exact same rules instead of duplicating them.
//
// The repository has no existing validation library (no Zod/Yup/Joi
// dependency anywhere) -- this is a plain, dependency-free validator
// matching that existing convention, not a second validation framework.
//
// Credential numbers (PTIN/EFIN/EIN/SSN, bank/account/routing numbers) are
// never part of this contract -- those already have a purpose-built,
// encrypted home in firm_tax_profile (see set_firm_tax_profile). This
// module actively rejects raw input carrying anything that looks like one,
// using the same key-shape heuristic lib/partnerOnboarding.ts's
// maskApplicationData already uses for display, so submission-time
// enforcement and display-time masking agree on what counts as sensitive.

export const PARTNER_ONBOARDING_ENTITY_TYPES = ["sole_proprietorship", "llc", "s_corp", "c_corp", "partnership"] as const;
export type PartnerOnboardingEntityType = (typeof PARTNER_ONBOARDING_ENTITY_TYPES)[number];

export const PARTNER_ONBOARDING_SERVICES_OFFERED = [
  "individual_returns",
  "business_returns",
  "bookkeeping",
  "payroll",
  "tax_resolution",
  "other",
] as const;
export type PartnerOnboardingServiceOffered = (typeof PARTNER_ONBOARDING_SERVICES_OFFERED)[number];

// Display labels for the two fixed-option fields -- kept alongside the
// contract itself (Phase 6J-2) rather than duplicated in a component, so
// the option list and its labels can never drift apart.
export const PARTNER_ONBOARDING_ENTITY_TYPE_LABELS: Record<PartnerOnboardingEntityType, string> = {
  sole_proprietorship: "Sole Proprietorship",
  llc: "LLC",
  s_corp: "S-Corporation",
  c_corp: "C-Corporation",
  partnership: "Partnership",
};

export const PARTNER_ONBOARDING_SERVICE_LABELS: Record<PartnerOnboardingServiceOffered, string> = {
  individual_returns: "Individual Returns",
  business_returns: "Business Returns",
  bookkeeping: "Bookkeeping",
  payroll: "Payroll",
  tax_resolution: "Tax Resolution",
  other: "Other",
};

export type PartnerOnboardingApplicationData = {
  // Business Information
  legal_business_name: string;
  dba?: string | null;
  entity_type: PartnerOnboardingEntityType;
  business_address: string;
  business_phone: string;
  business_email: string;
  website?: string | null;

  // Tax Professional Information -- status only, never the credential
  // number itself (see module comment above).
  applicant_full_name: string;
  has_active_ptin: boolean;
  has_active_efin?: boolean | null;
  years_preparing_taxes: number;
  years_in_business?: number | null;
  prior_tax_software?: string | null;

  // Compliance
  prior_ero_sb_relationship?: boolean | null;
  prior_ero_sb_relationship_details?: string | null;
  irs_suspension_or_sanction: boolean;

  // Services / Production
  services_offered: PartnerOnboardingServiceOffered[];
  expected_annual_return_volume: number;
  individual_business_return_mix?: string | null;
  schedule_c_experience?: boolean | null;

  // Staff
  number_of_preparers: number;
  preparer_names?: string[] | null;

  // Supporting Information
  partnership_goals?: string | null;
  additional_information?: string | null;
};

// Same shape maskApplicationData() already hides on display, plus "ptin" --
// that pattern doesn't cover it (lib/partnerOnboarding.ts predates this
// contract and never needed to catch it), and Phase 6J is explicit that
// PTIN numbers must be rejected here just like SSN/EIN/EFIN. Unanchored
// (no \b), matching how efin/itin/ssn are already unanchored -- a field
// like "ptin_number" must match. This does mean "ptin" alone would also
// match has_active_ptin/has_active_efin by substring, which is exactly why
// those two are checked against ALLOWED_STATUS_KEYS first, below.
const SENSITIVE_KEY_PATTERN =
  /ssn|itin|efin|ptin|\bein\b|tax[_-]?id|password|secret|credential|token|account[_-]?number|routing[_-]?number|card[_-]?number|\bcvv\b|\bpin\b/i;

// has_active_ptin/has_active_efin are booleans (a status flag), not the
// pattern above -- explicitly allow-list them so the sensitive-key scan
// below doesn't flag the one legitimate field whose name happens to
// contain "ptin"/"efin".
const ALLOWED_STATUS_KEYS = new Set(["has_active_ptin", "has_active_efin"]);

export type ValidationResult =
  | { ok: true; data: PartnerOnboardingApplicationData }
  | { ok: false; errors: string[] };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isValidEmail(v: string): boolean {
  // Deliberately simple -- this is a business contact field, not a
  // deliverability check. Matches the level of rigor already used
  // elsewhere in this codebase (no email-validation library exists here).
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidUrl(v: string): boolean {
  try {
    const url = new URL(v.includes("://") ? v : `https://${v}`);
    return Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function validatePartnerOnboardingApplication(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: ["Application data must be an object."] };
  }
  const raw = input as Record<string, unknown>;

  for (const key of Object.keys(raw)) {
    if (!ALLOWED_STATUS_KEYS.has(key) && SENSITIVE_KEY_PATTERN.test(key)) {
      errors.push(
        `Field "${key}" looks like a credential or account number (SSN/EIN/PTIN/EFIN numbers, passwords, bank/account/routing numbers). ` +
          "Those belong in the firm's Tax Profile, not the onboarding application."
      );
    }
  }

  // Business Information
  if (!isNonEmptyString(raw.legal_business_name)) errors.push("legal_business_name is required.");
  if (raw.dba != null && typeof raw.dba !== "string") errors.push("dba must be a string.");
  if (!isNonEmptyString(raw.entity_type) || !PARTNER_ONBOARDING_ENTITY_TYPES.includes(raw.entity_type as PartnerOnboardingEntityType)) {
    errors.push(`entity_type is required and must be one of: ${PARTNER_ONBOARDING_ENTITY_TYPES.join(", ")}.`);
  }
  if (!isNonEmptyString(raw.business_address)) errors.push("business_address is required.");
  if (!isNonEmptyString(raw.business_phone)) errors.push("business_phone is required.");
  if (!isNonEmptyString(raw.business_email) || !isValidEmail(raw.business_email as string)) errors.push("business_email is required and must be a valid email address.");
  if (raw.website != null) {
    if (typeof raw.website !== "string" || !isValidUrl(raw.website)) errors.push("website must be a valid URL when supplied.");
  }

  // Tax Professional Information
  if (!isNonEmptyString(raw.applicant_full_name)) errors.push("applicant_full_name is required.");
  if (typeof raw.has_active_ptin !== "boolean") errors.push("has_active_ptin is required and must be a boolean.");
  if (raw.has_active_efin != null && typeof raw.has_active_efin !== "boolean") errors.push("has_active_efin must be a boolean when supplied.");
  if (typeof raw.years_preparing_taxes !== "number" || !Number.isFinite(raw.years_preparing_taxes) || raw.years_preparing_taxes < 0 || raw.years_preparing_taxes > 80) {
    errors.push("years_preparing_taxes is required and must be a number between 0 and 80.");
  }
  if (raw.years_in_business != null && (typeof raw.years_in_business !== "number" || !Number.isFinite(raw.years_in_business) || raw.years_in_business < 0 || raw.years_in_business > 100)) {
    errors.push("years_in_business must be a number between 0 and 100 when supplied.");
  }
  if (raw.prior_tax_software != null && typeof raw.prior_tax_software !== "string") errors.push("prior_tax_software must be a string when supplied.");

  // Compliance
  if (raw.prior_ero_sb_relationship != null && typeof raw.prior_ero_sb_relationship !== "boolean") errors.push("prior_ero_sb_relationship must be a boolean when supplied.");
  if (raw.prior_ero_sb_relationship_details != null && typeof raw.prior_ero_sb_relationship_details !== "string") errors.push("prior_ero_sb_relationship_details must be a string when supplied.");
  if (typeof raw.irs_suspension_or_sanction !== "boolean") errors.push("irs_suspension_or_sanction is required and must be a boolean.");

  // Services / Production
  if (!Array.isArray(raw.services_offered) || raw.services_offered.length === 0 || !raw.services_offered.every((s) => PARTNER_ONBOARDING_SERVICES_OFFERED.includes(s as PartnerOnboardingServiceOffered))) {
    errors.push(`services_offered is required and must be a non-empty array drawn from: ${PARTNER_ONBOARDING_SERVICES_OFFERED.join(", ")}.`);
  }
  if (
    typeof raw.expected_annual_return_volume !== "number" ||
    !Number.isFinite(raw.expected_annual_return_volume) ||
    raw.expected_annual_return_volume < 0 ||
    raw.expected_annual_return_volume > 1_000_000
  ) {
    errors.push("expected_annual_return_volume is required and must be a reasonable non-negative number.");
  }
  if (raw.individual_business_return_mix != null && typeof raw.individual_business_return_mix !== "string") errors.push("individual_business_return_mix must be a string when supplied.");
  if (raw.schedule_c_experience != null && typeof raw.schedule_c_experience !== "boolean") errors.push("schedule_c_experience must be a boolean when supplied.");

  // Staff
  if (typeof raw.number_of_preparers !== "number" || !Number.isFinite(raw.number_of_preparers) || raw.number_of_preparers < 0 || raw.number_of_preparers > 10_000) {
    errors.push("number_of_preparers is required and must be a reasonable non-negative number.");
  }
  if (raw.preparer_names != null && (!Array.isArray(raw.preparer_names) || !raw.preparer_names.every((n) => typeof n === "string"))) {
    errors.push("preparer_names must be an array of strings when supplied.");
  }

  // Supporting Information
  if (raw.partnership_goals != null && typeof raw.partnership_goals !== "string") errors.push("partnership_goals must be a string when supplied.");
  if (raw.additional_information != null && typeof raw.additional_information !== "string") errors.push("additional_information must be a string when supplied.");

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: raw as PartnerOnboardingApplicationData };
}

// -----------------------------------------------------------------------
// Phase 6J-2: plain-string form state <-> the contract above. Centralized
// here (not in the form component) so the exact shape a partner's browser
// produces is independently testable against validatePartnerOnboardingApplication()
// without rendering any React component -- this repository has no
// component-rendering test setup (no React Testing Library/jsdom), only
// plain function tests and server-page smoke tests.
// -----------------------------------------------------------------------

// Booleans use a tri-state "", "yes", "no" form value so a required
// boolean can be distinguished from "not answered yet", and an optional
// one can be left genuinely unset rather than defaulting to false.
export type PartnerOnboardingApplicationFormState = {
  legal_business_name: string;
  dba: string;
  entity_type: string;
  business_address: string;
  business_phone: string;
  business_email: string;
  website: string;
  applicant_full_name: string;
  has_active_ptin: string;
  has_active_efin: string;
  years_preparing_taxes: string;
  years_in_business: string;
  prior_tax_software: string;
  prior_ero_sb_relationship: string;
  prior_ero_sb_relationship_details: string;
  irs_suspension_or_sanction: string;
  services_offered: PartnerOnboardingServiceOffered[];
  expected_annual_return_volume: string;
  individual_business_return_mix: string;
  schedule_c_experience: string;
  number_of_preparers: string;
  preparer_names: string;
  partnership_goals: string;
  additional_information: string;
};

export function boolToYesNo(v: boolean | null | undefined): string {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "";
}

export function yesNoToBool(v: string): boolean | undefined {
  if (v === "yes") return true;
  if (v === "no") return false;
  return undefined;
}

export function partnerOnboardingApplicationDataToFormState(data: Record<string, unknown> | null): PartnerOnboardingApplicationFormState {
  const d = data ?? {};
  return {
    legal_business_name: typeof d.legal_business_name === "string" ? d.legal_business_name : "",
    dba: typeof d.dba === "string" ? d.dba : "",
    entity_type: typeof d.entity_type === "string" ? d.entity_type : "",
    business_address: typeof d.business_address === "string" ? d.business_address : "",
    business_phone: typeof d.business_phone === "string" ? d.business_phone : "",
    business_email: typeof d.business_email === "string" ? d.business_email : "",
    website: typeof d.website === "string" ? d.website : "",
    applicant_full_name: typeof d.applicant_full_name === "string" ? d.applicant_full_name : "",
    has_active_ptin: boolToYesNo(d.has_active_ptin as boolean | undefined),
    has_active_efin: boolToYesNo(d.has_active_efin as boolean | undefined),
    years_preparing_taxes: typeof d.years_preparing_taxes === "number" ? String(d.years_preparing_taxes) : "",
    years_in_business: typeof d.years_in_business === "number" ? String(d.years_in_business) : "",
    prior_tax_software: typeof d.prior_tax_software === "string" ? d.prior_tax_software : "",
    prior_ero_sb_relationship: boolToYesNo(d.prior_ero_sb_relationship as boolean | undefined),
    prior_ero_sb_relationship_details: typeof d.prior_ero_sb_relationship_details === "string" ? d.prior_ero_sb_relationship_details : "",
    irs_suspension_or_sanction: boolToYesNo(d.irs_suspension_or_sanction as boolean | undefined),
    services_offered: Array.isArray(d.services_offered) ? (d.services_offered as PartnerOnboardingServiceOffered[]) : [],
    expected_annual_return_volume: typeof d.expected_annual_return_volume === "number" ? String(d.expected_annual_return_volume) : "",
    individual_business_return_mix: typeof d.individual_business_return_mix === "string" ? d.individual_business_return_mix : "",
    schedule_c_experience: boolToYesNo(d.schedule_c_experience as boolean | undefined),
    number_of_preparers: typeof d.number_of_preparers === "number" ? String(d.number_of_preparers) : "",
    preparer_names: Array.isArray(d.preparer_names) ? (d.preparer_names as string[]).join("\n") : "",
    partnership_goals: typeof d.partnership_goals === "string" ? d.partnership_goals : "",
    additional_information: typeof d.additional_information === "string" ? d.additional_information : "",
  };
}

// Builds the exact jsonb object submit_partner_onboarding_application()
// expects -- omitting empty optional fields entirely rather than sending
// null/"", matching how validatePartnerOnboardingApplication() treats a
// missing key and a null the same way. Never constructs a key outside the
// PartnerOnboardingApplicationData shape above, so a credential-number
// field is structurally impossible to produce from form state.
export function partnerOnboardingFormStateToApplicationData(f: PartnerOnboardingApplicationFormState): Record<string, unknown> {
  const data: Record<string, unknown> = {
    legal_business_name: f.legal_business_name.trim(),
    entity_type: f.entity_type,
    business_address: f.business_address.trim(),
    business_phone: f.business_phone.trim(),
    business_email: f.business_email.trim(),
    applicant_full_name: f.applicant_full_name.trim(),
    services_offered: f.services_offered,
  };
  const ptin = yesNoToBool(f.has_active_ptin);
  if (ptin !== undefined) data.has_active_ptin = ptin;
  const efin = yesNoToBool(f.has_active_efin);
  if (efin !== undefined) data.has_active_efin = efin;
  if (f.years_preparing_taxes.trim() !== "") data.years_preparing_taxes = Number(f.years_preparing_taxes);
  if (f.years_in_business.trim() !== "") data.years_in_business = Number(f.years_in_business);
  if (f.prior_tax_software.trim() !== "") data.prior_tax_software = f.prior_tax_software.trim();
  const priorRelationship = yesNoToBool(f.prior_ero_sb_relationship);
  if (priorRelationship !== undefined) data.prior_ero_sb_relationship = priorRelationship;
  if (priorRelationship && f.prior_ero_sb_relationship_details.trim() !== "") {
    data.prior_ero_sb_relationship_details = f.prior_ero_sb_relationship_details.trim();
  }
  const suspension = yesNoToBool(f.irs_suspension_or_sanction);
  if (suspension !== undefined) data.irs_suspension_or_sanction = suspension;
  if (f.expected_annual_return_volume.trim() !== "") data.expected_annual_return_volume = Number(f.expected_annual_return_volume);
  if (f.individual_business_return_mix.trim() !== "") data.individual_business_return_mix = f.individual_business_return_mix.trim();
  const scheduleC = yesNoToBool(f.schedule_c_experience);
  if (scheduleC !== undefined) data.schedule_c_experience = scheduleC;
  if (f.number_of_preparers.trim() !== "") data.number_of_preparers = Number(f.number_of_preparers);
  const preparerNames = f.preparer_names
    .split("\n")
    .map((n) => n.trim())
    .filter(Boolean);
  if (preparerNames.length > 0) data.preparer_names = preparerNames;
  if (f.website.trim() !== "") data.website = f.website.trim();
  if (f.dba.trim() !== "") data.dba = f.dba.trim();
  if (f.partnership_goals.trim() !== "") data.partnership_goals = f.partnership_goals.trim();
  if (f.additional_information.trim() !== "") data.additional_information = f.additional_information.trim();
  return data;
}
