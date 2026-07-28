// Shared option lists and labels for the Business/Entity Tax Intake.
// Kept separate from lib/intakeStates.ts and the individual intake's
// options so the two intake types never cross-reference each other's
// wording.

export const ENTITY_CLASSIFICATION_LABELS: Record<string, string> = {
  c_corp: "C Corporation",
  s_corp: "S Corporation",
  partnership: "Partnership",
  mmllc_partnership: "Multi-member LLC (taxed as a partnership)",
  llc_s_corp: "LLC (taxed as an S corporation)",
  llc_c_corp: "LLC (taxed as a C corporation)",
  smllc: "Single-member LLC",
  sole_prop: "Sole proprietorship",
  unsure: "Not yet confirmed",
};

export const RETURN_TYPE_DETAIL_OPTIONS: [string, string][] = [
  ["", "Select…"],
  ["ongoing", "An ongoing, regular return"],
  ["initial", "The business's first return"],
  ["final", "The business's final return (it closed or dissolved)"],
  ["amended", "An amended return for a prior year"],
  ["short_period", "A short tax year (the business's tax year was shorter than 12 months)"],
];

export const AVAILABILITY_OPTIONS: [string, string][] = [
  ["", "Select…"],
  ["available", "Yes, I have this"],
  ["partial", "I have some of this"],
  ["none", "No, I don't have this"],
];

export const BOOKKEEPING_STATUS_OPTIONS: [string, string][] = [
  ["", "Select…"],
  ["complete", "Complete and up to date"],
  ["mostly", "Mostly complete, a few gaps"],
  ["incomplete", "Incomplete — needs cleanup"],
  ["none", "No bookkeeping has been done"],
  ["unsure", "I'm not sure"],
];

export const BASIS_RECORDS_OPTIONS: [string, string][] = [
  ["", "Select…"],
  ["yes", "Yes, I have complete records"],
  ["some", "I have some records"],
  ["no", "No, I don't have these records"],
  ["unsure", "I'm not sure what this means"],
];

export const OWNER_ROLE_OPTIONS: [string, string][] = [
  ["", "Select…"],
  ["owner", "Owner / Member"],
  ["shareholder", "Shareholder"],
  ["partner", "Partner"],
  ["officer", "Officer"],
  ["managing_member", "Managing Member"],
];
