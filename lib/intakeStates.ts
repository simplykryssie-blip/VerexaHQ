// Reference data for the "states lived or worked in" multi-select. Values
// are normalized codes (stored in intakes.states_lived_worked); labels are
// what the client sees. "foreign" and "none" are non-state sentinel codes
// the organizer/checklist logic treats specially (never matched against a
// real state, never counted toward the multistate-return flag).
export type StateOption = { code: string; label: string; group: "state" | "territory" | "other" };

export const US_STATES: StateOption[] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["FL", "Florida"], ["GA", "Georgia"],
  ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"],
  ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"],
  ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"],
  ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
].map(([code, label]) => ({ code, label, group: "state" as const }));

export const DC_OPTION: StateOption = { code: "DC", label: "District of Columbia", group: "state" };

export const US_TERRITORIES: StateOption[] = [
  ["PR", "Puerto Rico"], ["GU", "Guam"], ["VI", "U.S. Virgin Islands"], ["AS", "American Samoa"], ["MP", "Northern Mariana Islands"],
].map(([code, label]) => ({ code, label, group: "territory" as const }));

export const OTHER_STATE_OPTIONS: StateOption[] = [
  { code: "FOREIGN", label: "Foreign country", group: "other" },
  { code: "NONE", label: "None / only my home state", group: "other" },
];

export const ALL_STATE_OPTIONS: StateOption[] = [...US_STATES, DC_OPTION, ...US_TERRITORIES, ...OTHER_STATE_OPTIONS];

export function stateLabel(code: string): string {
  return ALL_STATE_OPTIONS.find((s) => s.code === code)?.label || code;
}
