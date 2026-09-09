-- Private bucket for client-submitted ID photos and selfies. Uploads
-- happen server-side via a token-scoped API route (a client completing
-- identity verification has no portal login to gate an insert policy
-- against) -- same reasoning as the "signatures" bucket. Deliberately a
-- separate bucket from "signatures"/"client-documents": this is
-- government-ID imagery, not a signature or a client-visible document, and
-- deserves its own narrower read policy.
insert into storage.buckets (id, name, public)
values ('identity-documents', 'identity-documents', false)
on conflict (id) do nothing;

create policy identity_documents_storage_select on storage.objects for select
using (bucket_id = 'identity-documents' and public.has_permission(((storage.foldername(name))[1])::uuid, 'irs_authorizations.view'));
