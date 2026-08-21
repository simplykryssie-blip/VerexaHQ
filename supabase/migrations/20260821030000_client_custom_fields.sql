-- Generic per-client custom field storage (name -> value). Added for the
-- GHL custom-fields import, but deliberately not GHL-specific -- this is a
-- reusable slot for any future "custom field" UI, not a one-off import
-- column.
alter table public.clients add column if not exists custom_fields jsonb not null default '{}'::jsonb;
