// Server-defined consent versions and language -- never trust client-
// submitted version strings or authorization text for a legal/billing
// record. The exact wording below still needs legal review before this
// goes to real paying customers; see the Phase 2 completion report.
export const TERMS_VERSION = "2026-07-29";
export const PRIVACY_VERSION = "2026-07-29";
export const EARLY_ACCESS_BILLING_AUTHORIZATION_VERSION = "2026-07-29";

export function billingAuthorizationText(continuationPrice: string, trialEndDisplay: string): string {
  return `I authorize VerexaHQ to securely save my payment method and automatically charge ${continuationPrice} when my 30-day trial ends on ${trialEndDisplay}, unless I cancel before the trial expiration date.`;
}
