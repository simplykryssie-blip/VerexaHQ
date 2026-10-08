-- Purchase + Payment V1: /api/firm-packages/checkout has always had
-- firm_package_purchases_active_per_connection (a partial unique index on
-- connection_id where status = 'pending') to stop a connection from ending
-- up with two concurrent in-progress purchases. The generic client-direct
-- checkout path added in the "Add generic Purchase + Payment Integration
-- v1" work (/api/products/checkout, client_id buyer) has no equivalent
-- guard at all, so a double-submitted "Buy" click can silently create two
-- pending purchases -- and two separate Stripe Checkout Sessions -- for the
-- same client buying the same product.
--
-- Unlike a connection (which carries at most one package at a time via
-- firm_connections.package_id), a single client can legitimately have
-- concurrent pending purchases for *different* products, so this is keyed
-- on (client_id, package_id) rather than client_id alone.
create unique index if not exists firm_package_purchases_active_per_client
  on public.firm_package_purchases (client_id, package_id)
  where (status = 'pending');
