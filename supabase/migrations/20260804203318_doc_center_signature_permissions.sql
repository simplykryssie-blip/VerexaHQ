
insert into public.permissions (key, category, description)
values
  ('signatures.view', 'documents', 'View signature requests and their status'),
  ('signatures.request', 'documents', 'Create signature requests and record/decline signatures')
on conflict (key) do nothing;

-- Grant the same roles that already have documents.request, matching how
-- staff who can request documents can also request signatures.
insert into public.role_permissions (role_id, permission_id)
select rp.role_id, p2.id
from public.role_permissions rp
join public.permissions p1 on p1.id = rp.permission_id and p1.key = 'documents.request'
join public.permissions p2 on p2.key in ('signatures.view', 'signatures.request')
on conflict do nothing;
