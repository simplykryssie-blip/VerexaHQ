-- Adds 'ssn' as a valid client_profile_field value so an organizer field can
-- be tagged to propose the taxpayer's own SSN back to their client record,
-- the same way 'date_of_birth' already does. Unlike the other
-- client_profile_field values, this routes through propose_client_sensitive_field
-- (added in 20260817161223) rather than propose_client_contact_field --
-- that function always queues a pending change for staff review (never an
-- immediate overwrite, even on a blank field), matching how a client's own
-- reveal-gated SSN should never be silently set from portal input alone.
alter table public.organizer_fields drop constraint organizer_fields_client_profile_field_check;
alter table public.organizer_fields add constraint organizer_fields_client_profile_field_check check (
  client_profile_field is null or client_profile_field = any (array[
    'full_name', 'first_name', 'last_name', 'business_name', 'primary_email',
    'primary_phone', 'mailing_address', 'date_of_birth', 'ssn'
  ])
);
