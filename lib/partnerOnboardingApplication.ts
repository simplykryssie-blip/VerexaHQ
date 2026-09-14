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
