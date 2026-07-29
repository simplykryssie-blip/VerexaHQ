-- Additive: extend v_workspace_subscription_summary with the fields
-- Settings -> Subscription needs to show authoritative, provider-confirmed
-- billing state (trial start, cancellation flag, card display fields,
-- provider status, whether a billing account exists). Still exposes no raw
-- Stripe secret keys or full card numbers -- only IDs already treated as
-- workspace-scoped display data elsewhere and brand/last4/funding, which
-- are non-sensitive by design.
--
-- The view is dropped and recreated (rather than CREATE OR REPLACE) because
-- Postgres does not allow reordering/renaming columns in place; it has no
-- dependent views/functions in this schema.
drop view if exists public.v_workspace_subscription_summary;

create view public.v_workspace_subscription_summary as
select
  w.id as workspace_id,
  w.business_name,
  ws.subscription_status,
  ws.provider_status,
  ws.billing_cycle,
  ws.trial_ends_at,
  ws.stripe_trial_start,
  ws.current_period_start,
  ws.current_period_end,
  ws.cancel_at_period_end,
  ws.canceled_at,
  ws.payment_method_on_file,
  ws.payment_method_required,
  ws.card_brand,
  ws.card_last4,
  ws.card_funding_type,
  ws.activation_block_reason,
  ws.external_customer_id is not null as has_billing_account,
  sp.plan_code,
  sp.plan_name,
  sp.monthly_price,
  sp.yearly_price,
  sp.max_clients,
  sp.max_team_members,
  sp.max_storage_mb,
  sp.includes_client_portal,
  sp.includes_team_members,
  sp.includes_advanced_reports,
  count(distinct c.id) as current_clients,
  count(distinct wm.id) filter (where wm.member_status = 'Active'::text) as current_team_members,
  workspace_can_add_client(w.id) as can_add_client,
  workspace_can_add_team_member(w.id) as can_add_team_member
from workspaces w
  left join workspace_subscriptions ws on ws.workspace_id = w.id
  left join subscription_plans sp on sp.id = ws.plan_id
  left join clients c on c.workspace_id = w.id
  left join workspace_members wm on wm.workspace_id = w.id
group by w.id, w.business_name, ws.subscription_status, ws.provider_status, ws.billing_cycle,
  ws.trial_ends_at, ws.stripe_trial_start, ws.current_period_start, ws.current_period_end,
  ws.cancel_at_period_end, ws.canceled_at, ws.payment_method_on_file, ws.payment_method_required,
  ws.card_brand, ws.card_last4, ws.card_funding_type, ws.activation_block_reason,
  ws.external_customer_id, sp.plan_code, sp.plan_name, sp.monthly_price, sp.yearly_price,
  sp.max_clients, sp.max_team_members, sp.max_storage_mb, sp.includes_client_portal,
  sp.includes_team_members, sp.includes_advanced_reports;

grant select on public.v_workspace_subscription_summary to authenticated, service_role;
