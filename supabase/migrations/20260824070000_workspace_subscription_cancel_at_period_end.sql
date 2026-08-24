-- "Pending cancellation" (a subscription still active but scheduled to
-- stop renewing) had no backing data -- customer.subscription.updated
-- already carries Stripe's cancel_at_period_end flag but nothing captured
-- it. Needed for the platform-admin overview's pending-cancellations count.
alter table public.workspace_subscriptions add column if not exists cancel_at_period_end boolean not null default false;
