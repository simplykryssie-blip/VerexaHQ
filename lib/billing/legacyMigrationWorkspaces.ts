/**
 * Workspace explicitly authorized for the self-service, forced legacy
 * billing setup gate (RequiredCardSetupScreen / app/api/billing/legacy-payment-setup).
 * Deliberately a single named workspace, not a generic "any workspace with
 * no stripe_subscription_id" condition -- other pre-payment-first accounts
 * (e.g. Doucet Financial Group, migrated via the platform-admin-only
 * /api/platform-admin/legacy-billing-migration tool instead) must not be
 * silently forced into an unskippable screen just because they share the
 * same underlying "never completed Stripe Checkout" shape. Add a workspace
 * here only when its owner has explicitly been told to expect this.
 */
export const FORCED_LEGACY_SETUP_WORKSPACE_IDS: readonly string[] = ["b0ab1fe3-06da-48a5-9c1c-5d099af22154"];

export function isForcedLegacySetupWorkspace(workspaceId: string): boolean {
  return FORCED_LEGACY_SETUP_WORKSPACE_IDS.includes(workspaceId);
}
