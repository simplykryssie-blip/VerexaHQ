-- An ERO must be able to sell digital products (per the platform Product
-- model), but firm_packages' write/update/delete policies were hard-gated
-- to Service-Bureau-only admins. Widen them with an OR branch scoped to
-- product_type = 'digital_product' at ERO tier or above; package rows
-- remain exactly as Service-Bureau-exclusive as before this migration.
alter policy firm_packages_write on public.firm_packages
  with check (
    is_workspace_admin(workspace_id)
    and (
      is_service_bureau_workspace(workspace_id)
      or (
        product_type = 'digital_product'
        and workspace_tier_rank((select w.workspace_type from public.workspaces w where w.id = firm_packages.workspace_id)) >= 2
      )
    )
  );

alter policy firm_packages_update on public.firm_packages
  using (
    is_workspace_admin(workspace_id)
    and (
      is_service_bureau_workspace(workspace_id)
      or (
        product_type = 'digital_product'
        and workspace_tier_rank((select w.workspace_type from public.workspaces w where w.id = firm_packages.workspace_id)) >= 2
      )
    )
  )
  with check (
    is_workspace_admin(workspace_id)
    and (
      is_service_bureau_workspace(workspace_id)
      or (
        product_type = 'digital_product'
        and workspace_tier_rank((select w.workspace_type from public.workspaces w where w.id = firm_packages.workspace_id)) >= 2
      )
    )
  );

alter policy firm_packages_delete on public.firm_packages
  using (
    is_workspace_admin(workspace_id)
    and (
      is_service_bureau_workspace(workspace_id)
      or (
        product_type = 'digital_product'
        and workspace_tier_rank((select w.workspace_type from public.workspaces w where w.id = firm_packages.workspace_id)) >= 2
      )
    )
  );
