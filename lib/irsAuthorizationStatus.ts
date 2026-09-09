// Mirrors the enum + ordering baked into supabase/migrations/20260915000000_irs_authorizations.sql
// and the forward-only rank check in set_irs_authorization_status -- keep both in sync if either changes.
export type IrsAuthorizationStatus =
  | "draft"
  | "awaiting_identity_verification"
  | "identity_verification_rejected"
  | "identity_verified"
  | "awaiting_signature"
  | "signed"
  | "submitted"
  | "irs_processing"
  | "authorized"
  | "transcript_eligible"
  | "denied"
  | "revoked";

export const IRS_AUTHORIZATION_STATUS_LABELS: Record<IrsAuthorizationStatus, string> = {
  draft: "Draft",
  awaiting_identity_verification: "Awaiting Identity Verification",
  identity_verification_rejected: "Identity Verification Rejected",
  identity_verified: "Identity Verified",
  awaiting_signature: "Awaiting Signature",
  signed: "Signed",
  submitted: "Submitted to IRS",
  irs_processing: "IRS Processing",
  authorized: "Authorized",
  transcript_eligible: "Transcript Eligible",
  denied: "Denied",
  revoked: "Revoked",
};

export const IRS_AUTHORIZATION_STATUS_TONE: Record<IrsAuthorizationStatus, "success" | "warning" | "danger" | "neutral" | "accent"> = {
  draft: "neutral",
  awaiting_identity_verification: "warning",
  identity_verification_rejected: "danger",
  identity_verified: "accent",
  awaiting_signature: "warning",
  signed: "accent",
  submitted: "accent",
  irs_processing: "warning",
  authorized: "success",
  transcript_eligible: "success",
  denied: "danger",
  revoked: "danger",
};

// Same array set_irs_authorization_status ranks against for its forward-only check.
const STATUS_ORDER: IrsAuthorizationStatus[] = [
  "draft",
  "awaiting_identity_verification",
  "identity_verification_rejected",
  "identity_verified",
  "awaiting_signature",
  "signed",
  "submitted",
  "irs_processing",
  "authorized",
  "transcript_eligible",
];

// The only statuses set_irs_authorization_status will accept as a manual target.
const MANUAL_FORWARD_STATUSES: IrsAuthorizationStatus[] = ["submitted", "irs_processing", "authorized", "transcript_eligible"];
const TERMINAL_STATUSES: IrsAuthorizationStatus[] = ["denied", "revoked"];

/** What set_irs_authorization_status will actually accept from the given current status --
 * used to render only valid manual-advance buttons instead of letting the RPC reject one. */
export function getManualAdvanceOptions(current: IrsAuthorizationStatus): IrsAuthorizationStatus[] {
  if (TERMINAL_STATUSES.includes(current)) return [];
  const currentRank = STATUS_ORDER.indexOf(current);
  const forward = MANUAL_FORWARD_STATUSES.filter((s) => STATUS_ORDER.indexOf(s) > currentRank);
  return [...forward, ...TERMINAL_STATUSES];
}
