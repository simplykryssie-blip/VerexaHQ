-- Revoking from `anon` directly wasn't enough: pg_proc.proacl showed a
-- leading `=X/postgres` entry (PUBLIC grant) on these three functions,
-- which anon inherits regardless of a per-role revoke. create_client and
-- reveal_client_ssn -- the functions these were modeled on -- have no such
-- PUBLIC entry, confirming this was the actual gap.

revoke execute on function public.create_client_relationship(uuid, uuid, text, text, uuid, date, text) from public;
revoke execute on function public.reveal_client_relationship_ssn(uuid) from public;
revoke execute on function public.flip_lead_on_organizer_submission() from public;
revoke execute on function public.sync_sent_at() from public, anon, authenticated;
