-- Backlog #2: an immutable preservation record for each platform Terms/Privacy
-- acceptance, separate from consent_records (which remains the sole source of
-- truth for whether/when a workspace accepted). One archive row per
-- consent_records acceptance event, capturing the exact content presented at
-- that moment (so it survives later edits to /terms and /privacy) plus a
-- generated combined PDF. Writes only ever happen via the service-role key
-- from server-side code (lib/legal/archive.ts) -- there is deliberately no
-- INSERT/UPDATE/DELETE policy for any client role below, mirroring
-- consent_records' own already-locked-down RLS.
create table public.platform_terms_acceptance_archive (
  id uuid primary key default gen_random_uuid(),
  consent_record_id uuid not null references public.consent_records(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  version text not null,
  accepted_at timestamptz not null,
  terms_content_snapshot text not null,
  privacy_content_snapshot text not null,
  pdf_storage_path text,
  pdf_generated_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'generated', 'failed')),
  generation_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One archive per acceptance event -- also what makes archive creation
  -- idempotent (insert ... on conflict (consent_record_id) do nothing).
  unique (consent_record_id)
);

create index platform_terms_acceptance_archive_workspace_idx on public.platform_terms_acceptance_archive (workspace_id);

alter table public.platform_terms_acceptance_archive enable row level security;

-- Only a platform admin or the workspace's own active owner may ever read an
-- archive row -- narrower than consent_records' own "any workspace member"
-- SELECT policy, since only the owner accepts and this is the locked
-- decision for who may view archives (ordinary staff, connected
-- PTINs/EROs/service bureaus, and clients are all excluded).
create policy platform_terms_acceptance_archive_select on public.platform_terms_acceptance_archive
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.workspace_users wu
      where wu.workspace_id = platform_terms_acceptance_archive.workspace_id
        and wu.user_id = auth.uid()
        and wu.is_owner = true
        and wu.status = 'active'
    )
  );

-- Deliberately no insert/update/delete policy for any role -- with RLS
-- enabled, that means authenticated/anon can never write this table under
-- any circumstance; only the service role (which bypasses RLS) can, and
-- only from lib/legal/archive.ts. This is what makes a generated archive
-- row immutable through every customer-facing or admin-facing UI path.

-- Private bucket for the generated PDFs. No public flag, no insert/update/
-- delete policy for any client role (same shape as the existing
-- identity-documents bucket) -- PDFs are written once, server-side, via the
-- service role, and never touched again through the client SDK.
insert into storage.buckets (id, name, public)
values ('legal-archives', 'legal-archives', false)
on conflict (id) do nothing;

-- Path convention: workspace/{workspace_id}/legal/{version}/{archive_id}.pdf
-- -- foldername()[2] is the workspace id.
create policy legal_archives_storage_select on storage.objects
  for select
  using (
    bucket_id = 'legal-archives'
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.workspace_users wu
        where wu.workspace_id = ((storage.foldername(name))[2])::uuid
          and wu.user_id = auth.uid()
          and wu.is_owner = true
          and wu.status = 'active'
      )
    )
  );
