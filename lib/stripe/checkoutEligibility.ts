// A workspace with a subscription already genuinely paid up has nothing to
// resolve -- everyone else (billing_incomplete, a billing-cycle-cron-
// suspended workspace whose stripe_status hasn't caught up yet, a
// canceled/past_due subscription) needs checkout available again. Checking
// workspace.status too (not just stripe_status) matters because the
// billing-cycle cron suspends workspaces.status directly, ahead of Stripe's
// own webhook updating workspace_subscriptions.stripe_status -- trusting
// stripe_status alone would incorrectly block that workspace from resuming
// checkout during the window before the webhook catches up.
export function needsCheckoutResume(workspaceStatus: string, stripeStatus: string): boolean {
  return !(workspaceStatus === "active" && stripeStatus === "active");
}
