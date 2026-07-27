// Normalized option lists for dependent fields. Codes are what's stored;
// labels are what the client sees. "Other" always reveals a free-text
// explanation field rather than storing prose in the coded field.
export const DEPENDENT_RELATIONSHIPS: [string, string][] = [
  ["", "Select…"],
  ["son", "Son"],
  ["daughter", "Daughter"],
  ["stepchild", "Stepchild"],
  ["foster_child", "Foster child"],
  ["adopted_child", "Adopted child"],
  ["brother", "Brother"],
  ["sister", "Sister"],
  ["stepbrother", "Stepbrother"],
  ["stepsister", "Stepsister"],
  ["half_brother", "Half brother"],
  ["half_sister", "Half sister"],
  ["grandchild", "Grandchild"],
  ["parent", "Parent"],
  ["grandparent", "Grandparent"],
  ["niece", "Niece"],
  ["nephew", "Nephew"],
  ["aunt", "Aunt"],
  ["uncle", "Uncle"],
  ["cousin", "Cousin"],
  ["other_relative", "Other relative"],
  ["unrelated_person", "Unrelated person"],
  ["other", "Other"],
];

// Deliberately data-collection only, worded to avoid implying any
// eligibility conclusion -- the client is describing the arrangement,
// not being told what it means for their return.
export const CUSTODY_ARRANGEMENTS: [string, string][] = [
  ["", "Select…"],
  ["taxpayer_full_custody", "Taxpayer had full custody"],
  ["spouse_full_custody", "Spouse had full custody"],
  ["shared_joint_custody", "Shared or joint custody"],
  ["taxpayer_custodial_parent", "Taxpayer was custodial parent"],
  ["taxpayer_noncustodial_parent", "Taxpayer was noncustodial parent"],
  ["informal_arrangement", "Informal custody arrangement"],
  ["court_ordered_arrangement", "Court-ordered custody arrangement"],
  ["foster_placement", "Foster placement"],
  ["no_custody_arrangement", "No custody arrangement applies"],
  ["unsure", "Unsure"],
  ["other", "Other"],
];

export const ABSENCE_REASONS: [string, string][] = [
  ["", "Select…"],
  ["school_college", "School or college"],
  ["military_service", "Military service"],
  ["medical_care", "Medical care"],
  ["work_assignment", "Work assignment"],
  ["vacation", "Vacation"],
  ["custody_arrangement", "Custody arrangement"],
  ["incarceration", "Incarceration"],
  ["temporary_housing", "Temporary housing"],
  ["other", "Other"],
];

export function optionLabel(options: [string, string][], code: string): string {
  return options.find(([c]) => c === code)?.[1] || code;
}

// Custody arrangements that plausibly need the "did the child live with
// you more nights" / Form 8332 / release-of-claim follow-up questions --
// i.e. anything that isn't a clean single-household or not-applicable
// case. Kept as a UI display heuristic only; never used to draw a tax
// conclusion.
export const CUSTODY_NEEDS_FOLLOWUP = new Set([
  "shared_joint_custody",
  "taxpayer_custodial_parent",
  "taxpayer_noncustodial_parent",
  "informal_arrangement",
  "court_ordered_arrangement",
  "other",
]);
