-- The new platform-terms acceptance gate (accept_platform_terms RPC) inserts
-- consent_type = 'platform_terms' into consent_records, but the table's
-- check constraint only allowed the pre-existing client-facing consent
-- types, so every owner hit "violates check constraint
-- consent_records_consent_type_check" on Accept and could never get past
-- the gate. Add platform_terms to the allowed list.
alter table public.consent_records
  drop constraint consent_records_consent_type_check;

alter table public.consent_records
  add constraint consent_records_consent_type_check
  check (consent_type = any (array[
    'terms_of_service'::text,
    'privacy_policy'::text,
    'e_signature_consent'::text,
    'portal_invitation'::text,
    'communication_preferences'::text,
    'platform_terms'::text
  ]));
