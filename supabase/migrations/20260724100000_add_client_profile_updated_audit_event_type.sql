-- save_client_profile_details has never successfully completed a single
-- call: it calls create_workspace_audit_event with event code
-- 'client_profile_updated', but that code was never registered in
-- platform_audit_event_types, so create_workspace_audit_event's own
-- "select ... where event_code = p_event_code and is_active = true"
-- lookup finds nothing and it raises "Audit event type not found or
-- inactive: client_profile_updated" — verified live against production,
-- confirmed the whole call rolls back with no partial write.
--
-- This adds only the missing reference row. It does not touch
-- save_client_profile_details, create_workspace_audit_event, any RLS
-- policy, any trigger, or any table structure — those are unchanged.
-- 'Client' category and the 10/20 sort_order pattern already used by the
-- sibling client_created/client_updated rows are followed here (30).

insert into public.platform_audit_event_types (
  event_code,
  event_name,
  event_category,
  description,
  default_severity,
  is_sensitive,
  retention_years,
  is_active,
  sort_order
)
select
  'client_profile_updated',
  'Client Profile Updated',
  'Client',
  'A client profile containing sensitive personal details was updated.',
  'info',
  true,
  7,
  true,
  30
where not exists (
  select 1 from public.platform_audit_event_types where event_code = 'client_profile_updated'
);
