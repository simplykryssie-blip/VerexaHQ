-- Establishes a live, active ero_ptin connection between the two demo
-- workspaces so the ERO demo has real oversight data to show immediately
-- (connected-PTIN list, Tax Office cross-account rollup, branding/billing
-- toggles) without needing a live two-tab invite/redeem click-through
-- first. The actual generate-invite flow stays available to demo live
-- and separately -- this only seeds one connection as already-accepted,
-- matching what redeem_firm_connection_invite itself would produce.
insert into public.firm_connections (
  parent_workspace_id, child_workspace_id, relationship_type, status,
  invited_by, responded_by, responded_at, billing_responsibility,
  shares_communications_identity, allows_branding_override
) values (
  'b53cc047-e1dd-4a6e-92f4-88b3c37f48af', -- Demo - ERO Office
  'b41f7ee8-e811-4d4d-8156-5ebf43014462', -- Summit Tax & Financial Services (PTIN demo)
  'ero_ptin', 'active',
  '94161e3f-ce7e-4626-8d0d-abef5350cf7c', '94161e3f-ce7e-4626-8d0d-abef5350cf7c', now(),
  'ptin_self', true, false
);
