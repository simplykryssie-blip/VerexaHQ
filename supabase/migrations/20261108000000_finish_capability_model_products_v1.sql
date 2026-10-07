-- Finish Capability Model + Products V1.
--
-- The capability model (workspace_tier_rank / workspace_has_capability /
-- feature_flags.min_workspace_tier / workspace_feature_flags overrides) was
-- introduced in 20261007025746 but had zero call sites anywhere -- the two
-- Product write gates added right after it (20261007032640) used a raw
-- workspace_tier_rank(...) >= 2 literal and the pre-existing
-- is_service_bureau_workspace() tier check instead of the capability model
-- they were built alongside. This finishes that wiring: both branches now
-- go through workspace_has_capability(), the single reusable "is this
-- workspace allowed to do X" entry point, with real tier-eligibility +
-- override semantics (workspace_feature_flags) instead of a hardcoded tier
-- number.
--
-- Also restores is_workspace_operational() on these same three policies.
-- 20261007032640 replaced the ENTIRE with_check/using expression (ALTER
-- POLICY replaces the whole clause, not just the branch being changed) and
-- dropped the is_workspace_operational() condition that the Phase 4A
-- suspension-enforcement work had added -- a real regression: a suspended
-- workspace could write firm_packages rows again. Every other Phase 4A
-- suspension gate on this table set (firm_connections, invoices) is
-- unaffected and untouched here.

-- New capability: an ERO (or above) selling its own digital product
-- directly to clients. Distinct from third_party_product_distribution
-- (Service Bureau reselling third-party software/banking to connected
-- firms) -- a different capability at a different tier, not a synonym.
insert into public.feature_flags (key, name, description, module, is_core, default_enabled, min_workspace_tier)
values (
  'digital_product_sales',
  'Digital Product Sales',
  'Create and sell a digital product (e.g. a guide, template, or course) directly to clients',
  'commerce',
  false,
  true,
  'ero_office'
)
on conflict (key) do nothing;

alter policy firm_packages_write on public.firm_packages
  with check (
    is_workspace_admin(workspace_id)
    and is_workspace_operational(workspace_id)
    and (
      (product_type = 'package' and public.workspace_has_capability(workspace_id, 'third_party_product_distribution'))
      or (product_type = 'digital_product' and public.workspace_has_capability(workspace_id, 'digital_product_sales'))
    )
  );

alter policy firm_packages_update on public.firm_packages
  using (
    is_workspace_admin(workspace_id)
    and is_workspace_operational(workspace_id)
    and (
      (product_type = 'package' and public.workspace_has_capability(workspace_id, 'third_party_product_distribution'))
      or (product_type = 'digital_product' and public.workspace_has_capability(workspace_id, 'digital_product_sales'))
    )
  )
  with check (
    is_workspace_admin(workspace_id)
    and is_workspace_operational(workspace_id)
    and (
      (product_type = 'package' and public.workspace_has_capability(workspace_id, 'third_party_product_distribution'))
      or (product_type = 'digital_product' and public.workspace_has_capability(workspace_id, 'digital_product_sales'))
    )
  );

alter policy firm_packages_delete on public.firm_packages
  using (
    is_workspace_admin(workspace_id)
    and is_workspace_operational(workspace_id)
    and (
      (product_type = 'package' and public.workspace_has_capability(workspace_id, 'third_party_product_distribution'))
      or (product_type = 'digital_product' and public.workspace_has_capability(workspace_id, 'digital_product_sales'))
    )
  );
