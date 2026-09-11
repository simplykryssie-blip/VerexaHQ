// Fixture data for the three conditions that produced a real production
// crash on /clients (Cannot read properties of undefined (reading '0'),
// 2026-09-02 -- see tests/clients-page.test.ts): a client whose related
// records are legitimately all empty, a client whose optional fields are
// null, and a workspace with zero clients at all.

export const WORKSPACE_FIXTURE = {
  id: "workspace-1",
  name: "Test Firm LLC",
  slug: "test-firm",
  workspace_type: "independent_ptin",
  is_owner: true,
  is_platform_home: false,
};

// A client that's never had a single related record created -- no
// contacts, no addresses, no emails/phones beyond the primary fields, no
// engagements, no documents, no notes, nothing. Every one-to-many relation
// getClientWorkspaceData fetches resolves to an empty array (the fake
// client's default for anything not explicitly configured), and the list
// page must render a single row for it with no crash.
export const CLIENT_NO_RELATED_RECORDS = {
  id: "client-no-related-records",
  workspace_id: WORKSPACE_FIXTURE.id,
  client_type: "individual",
  first_name: "Alex",
  last_name: "Rivera",
  business_name: null,
  primary_email: "alex.rivera@example.com",
  primary_phone: "555-0100",
  lifecycle_status: "lead",
  tags: [],
  ssn_last4: null,
  ein_last4: null,
  itin_last4: null,
  date_of_birth: null,
  client_number: null,
  has_portal_access: false,
  merged_into_client_id: null,
  relationship_manager_id: null,
  default_reviewer_id: null,
  default_compliance_officer_id: null,
  relationship_manager: null,
  default_reviewer: null,
  default_compliance_officer: null,
  created_at: "2026-08-01T00:00:00.000Z",
};

// A client record where every genuinely optional column is null/undefined
// rather than merely "no rows in a related table" -- no business name (an
// individual), no tags array (null, not []), no primary contact info, no
// client_number, no date_of_birth. This is the shape a very bare-bones
// manually-created client can have.
export const CLIENT_MISSING_OPTIONAL_FIELDS = {
  id: "client-missing-optional-fields",
  workspace_id: WORKSPACE_FIXTURE.id,
  client_type: "individual",
  first_name: null,
  last_name: null,
  business_name: null,
  primary_email: null,
  primary_phone: null,
  lifecycle_status: "lead",
  tags: null,
  ssn_last4: null,
  ein_last4: null,
  itin_last4: null,
  date_of_birth: null,
  client_number: null,
  has_portal_access: false,
  merged_into_client_id: null,
  relationship_manager_id: null,
  default_reviewer_id: null,
  default_compliance_officer_id: null,
  relationship_manager: null,
  default_reviewer: null,
  default_compliance_officer: null,
  created_at: "2026-08-01T00:00:00.000Z",
};

// A business client with a fuller (but still edge-case) related-record set:
// one contact, one address, no emails/phones beyond primary, and an
// engagement whose joined services/tax-detail relations are null -- the
// shape that exercises the `services?.name` / tax-detail array-or-object
// handling in ClientWorkspaceTabs.
export const CLIENT_WITH_PARTIAL_RELATIONS = {
  id: "client-partial-relations",
  workspace_id: WORKSPACE_FIXTURE.id,
  client_type: "business",
  first_name: null,
  last_name: null,
  business_name: "Rivera Consulting LLC",
  primary_email: "billing@riveraconsulting.example",
  primary_phone: null,
  lifecycle_status: "active",
  tags: ["priority"],
  ssn_last4: null,
  ein_last4: "1234",
  itin_last4: null,
  date_of_birth: null,
  client_number: "CL-0042",
  has_portal_access: true,
  merged_into_client_id: null,
  relationship_manager_id: null,
  default_reviewer_id: null,
  default_compliance_officer_id: null,
  relationship_manager: null,
  default_reviewer: null,
  default_compliance_officer: null,
  created_at: "2026-07-15T00:00:00.000Z",
};
