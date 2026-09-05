// Every cron job in vercel.json and its expected interval, in minutes --
// kept in sync with vercel.json by hand since Vercel has no API this app
// can read its own cron config from at runtime. ensure-next-tax-year runs
// once a year and is deliberately excluded -- a fixed multiplier of a
// yearly interval would always read as "stale."
//
// Shared between app/api/cron/check-stale-cron-jobs (the alerting check)
// and the Systems dashboard's Cron Job Health table (the human-facing
// view of the same staleness math), so the two can never disagree.
export const EXPECTED_INTERVAL_MINUTES: Record<string, number> = {
  "check-overdue-tasks": 360,
  "check-overdue-invoices": 360,
  "cancel-overdue-quotes": 360,
  "check-billing-cycles": 60,
  "check-stale-automation-queues": 15,
  "check-stale-cron-jobs": 15,
  "dispatch-notifications": 5,
  "digest-system-failures": 20,
  "enqueue-reminders": 360,
  "fire-date-reminder-automations": 360,
  "refresh-calendar-tokens": 1440,
  "refresh-zoom-tokens": 1440,
  "revoke-expired-portal-access": 1440,
  "run-pending-automation-steps": 1,
  "send-pending-automation-webhooks": 5,
  "sync-calendar-events": 5,
  "send-pending-engagement-letters": 5,
  "send-pending-portal-invites": 5,
  "verify-pending-website-domains": 15,
  "verify-pending-email-domains": 15,
};

export const STALE_MULTIPLIER = 2;

export function isStale(lastSuccessAt: string | null, intervalMinutes: number) {
  if (!lastSuccessAt) return true;
  return new Date(lastSuccessAt).getTime() < Date.now() - intervalMinutes * STALE_MULTIPLIER * 60 * 1000;
}
