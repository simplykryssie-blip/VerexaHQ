// Which firm_connections.relationship_type values a given workspace_type
// can have as its own children -- shared by every page that lists or looks
// up a workspace's connected partners (Firms list/detail, ERO Dashboard's
// partner-payout rollup), so the mapping only lives in one place.
export const CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE: Record<string, string[]> = {
  ero_office: ["ero_ptin"],
  service_bureau: ["service_bureau_ero", "service_bureau_ptin"],
  multi_office_firm: ["ero_ptin"],
};

export const CONNECTED_CHILD_TIER_LABEL: Record<string, string> = {
  ero_ptin: "PTIN",
  service_bureau_ero: "ERO",
  service_bureau_ptin: "PTIN",
};
