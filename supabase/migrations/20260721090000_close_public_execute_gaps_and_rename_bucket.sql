-- The Canonical Backend Contract claimed anonymous execution was revoked
-- from client-contract-read RPCs, worker/financial RPCs, and that encryption
-- functions remain server-side. Verified live that several still carried a
-- PUBLIC (or explicit anon) execute grant, which Postgres treats as
-- available to every role including anon, contradicting the contract. This
-- closes those gaps without touching any grant the app actually needs
-- (authenticated keeps access to the 5 client-contract RPCs it calls).

revoke execute on function public.get_client_billing_activity_contract(uuid, uuid) from public;
revoke execute on function public.get_client_files_requests_contract(uuid, uuid) from public;
revoke execute on function public.get_client_profile_contract(uuid, uuid) from public;
revoke execute on function public.get_client_work_contract(uuid, uuid) from public;
revoke execute on function public.list_workspace_clients_v2(uuid, text, text[], uuid, text, text, integer, integer) from public;
grant execute on function public.get_client_billing_activity_contract(uuid, uuid) to authenticated;
grant execute on function public.get_client_files_requests_contract(uuid, uuid) to authenticated;
grant execute on function public.get_client_profile_contract(uuid, uuid) to authenticated;
grant execute on function public.get_client_work_contract(uuid, uuid) to authenticated;
grant execute on function public.list_workspace_clients_v2(uuid, text, text[], uuid, text, text, integer, integer) to authenticated;

revoke execute on function public.apply_invoice_late_fees() from public;
revoke execute on function public.backfill_legacy_engagement_links() from public;
revoke execute on function public.enqueue_automation_actions(uuid) from public;
revoke execute on function public.generate_due_recurring_engagements(integer) from public;
revoke execute on function public.process_database_automation_actions(integer) from public;
revoke execute on function public.run_backend_maintenance() from public;
revoke execute on function public.sync_successful_refund() from public;
revoke execute on function public.validate_invoice_payment() from public;
revoke execute on function public.validate_payment_refund() from public;

revoke execute on function public.encrypt_sensitive_text(text, text) from public, anon, authenticated;
revoke execute on function public.decrypt_sensitive_text(bytea, text) from public, anon, authenticated;

-- firmflow-client-documents had 0 objects and 0 documents rows referencing
-- it (verified live before running this). Renamed in place via UPDATE on
-- the bucket's primary key rather than insert+delete, since Supabase blocks
-- direct DELETE on storage tables (protect_delete trigger) but not UPDATE,
-- and there were no dependent rows to violate a FK either way.
update storage.buckets
set id = 'verexahq-client-documents', name = 'verexahq-client-documents'
where id = 'firmflow-client-documents';

drop policy if exists verexa_delete_client_files_managers_only on storage.objects;
drop policy if exists verexa_insert_authorized_client_files on storage.objects;
drop policy if exists verexa_read_authorized_client_files on storage.objects;
drop policy if exists verexa_update_client_files_staff_only on storage.objects;

create policy verexa_delete_client_files_managers_only on storage.objects
  for delete
  using (bucket_id = 'verexahq-client-documents' and storage_client_path_is_valid(name) and can_manage_workspace(storage_path_workspace_id(name)));

create policy verexa_insert_authorized_client_files on storage.objects
  for insert
  with check (bucket_id = 'verexahq-client-documents' and storage_current_user_can_insert_client_path(name));

create policy verexa_read_authorized_client_files on storage.objects
  for select
  using (bucket_id = 'verexahq-client-documents' and storage_current_user_can_read_client_path(name));

create policy verexa_update_client_files_staff_only on storage.objects
  for update
  using (bucket_id = 'verexahq-client-documents' and storage_client_path_is_valid(name) and can_staff_write(storage_path_workspace_id(name)))
  with check (bucket_id = 'verexahq-client-documents' and storage_client_path_is_valid(name) and can_staff_write(storage_path_workspace_id(name)));

alter table public.documents alter column storage_bucket set default 'verexahq-client-documents';
