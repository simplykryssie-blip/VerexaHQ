-- subscription_plans is an empty, authenticated-readable global catalog
-- table (RLS: authenticated can select where is_active OR is_platform_admin()).
-- workspace_subscriptions.plan_id is NOT NULL, so onboarding cannot assign
-- a trial subscription until at least one real plan row exists. Seeding
-- baseline tiers here — additive data only, no schema change, idempotent
-- via ON CONFLICT on the unique `code` column.
insert into public.subscription_plans (code, name, description, monthly_price, annual_price, trial_days, max_staff, max_clients, max_storage_gb, features, is_active)
values
  ('solo', 'Solo', 'For independent PTIN holders and single-preparer offices.', 39, 390, 30, 1, 150, 5,
    '["Unlimited tax engagements", "Intake organizers", "Document requests & e-signatures", "Client portal", "Email & SMS reminders (once connected)"]'::jsonb, true),
  ('office', 'Office', 'For growing tax offices and ERO offices with a team.', 99, 990, 30, 10, 1000, 50,
    '["Everything in Solo", "Team roles & assignments", "Workflow automation", "Compliance case tracking", "Office-wide reporting"]'::jsonb, true),
  ('bureau', 'Service Bureau', 'For service bureaus and multi-office tax businesses.', 249, 2490, 30, null, null, 250,
    '["Everything in Office", "Unlimited staff & clients", "ERO / service bureau relationships", "Template sharing across offices", "Priority support"]'::jsonb, true)
on conflict (code) do nothing;
