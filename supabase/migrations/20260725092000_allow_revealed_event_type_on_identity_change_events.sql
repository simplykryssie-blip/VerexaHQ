-- The previous migration in this series pointed get_identity_vault_value
-- at client_identity_change_events for its reveal audit trail (replacing
-- a call to record_secure_data_audit_event that could never succeed
-- against audit_logs' own CHECK constraint). Live regression testing of
-- that change surfaced a fourth constraint mismatch:
-- client_identity_change_events_event_type_check only allows
-- ('created','replaced','verified','rejected','retired') — 'revealed' was
-- never in the set. This is a narrow, additive change: it adds one new
-- legitimate value to an already domain-specific lifecycle-event
-- constraint and does not remove, rename, or reinterpret any of the five
-- existing values, so no existing row or query is affected.

ALTER TABLE public.client_identity_change_events
  DROP CONSTRAINT client_identity_change_events_event_type_check;

ALTER TABLE public.client_identity_change_events
  ADD CONSTRAINT client_identity_change_events_event_type_check
  CHECK (event_type = ANY (ARRAY['created'::text, 'replaced'::text, 'verified'::text, 'rejected'::text, 'retired'::text, 'revealed'::text]));
