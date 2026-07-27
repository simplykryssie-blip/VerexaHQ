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
// eligibility conclusion -- the client is describing where the dependent
// lived, not being told what it means for their return. Only shown at all
// when "Could another parent or person potentially claim this dependent?"
// is Yes or Unsure.
export const LIVING_SITUATION_OPTIONS: [string, string][] = [
  ["", "Select…"],
  ["lived_only_with_me", "Lived only with me"],
  ["lived_mostly_with_me", "Lived mostly with me"],
  ["split_time", "Split time between homes"],
  ["lived_mostly_other", "Lived mostly with the other parent or guardian"],
  ["lived_only_other", "Lived only with the other parent or guardian"],
  ["other", "Other"],
  ["unsure", "Unsure"],
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
