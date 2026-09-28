/**
 * The dunning cron's own workspace_billing_charge_attempts lookup (does an
 * attempt already exist for this workspace/period_end?) is a plain
 * read-then-write, not atomic -- two overlapping invocations of the hourly
 * check-billing-cycles cron could both pass that check before either
 * records an attempt, each then charging the card for the same cycle.
 * Keyed on the subscription's own current_period_end (the exact raw value
 * workspace_billing_charge_attempts.period_end is matched against, not the
 * Chicago-formatted display string used for notification dedupe keys
 * elsewhere in that file), so it stays byte-identical across every retry
 * within one billing cycle and changes the moment Stripe advances the
 * subscription to its next period. Passed into chargeOffSession's existing
 * Idempotency-Key support, this makes Stripe itself a second, atomic
 * backstop behind the DB check -- the same pattern the auto-topup cron
 * already uses (see app/api/cron/auto-topup-usage/route.ts).
 */
export function dunningIdempotencyKey(workspaceId: string, currentPeriodEnd: string): string {
  return `dunning:${workspaceId}:${currentPeriodEnd}`;
}
