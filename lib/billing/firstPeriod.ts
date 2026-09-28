/**
 * True only for a subscription's own stub period -- the one ending at a
 * future billing_cycle_anchor set by createDelayedStartSubscription
 * (lib/stripe/client.ts) for a legacy customer migration with a
 * contractually fixed first-charge date. first_period_end is set once, at
 * subscription creation, and never touched again; once Stripe's anchor-date
 * invoice fires and current_period_end advances past it, this returns
 * false for that same row from then on -- a subscription only ever has one
 * first period, never a recurring one. Used by check-billing-cycles to
 * skip its normal 7/3/1 pre-cycle CHARGE attempts for that one period only.
 */
export function isFirstPeriod(sub: { first_period_end: string | null; current_period_end: string | null }): boolean {
  return !!sub.first_period_end && sub.first_period_end === sub.current_period_end;
}
