-- One row per identity-verification attempt (ID photo + selfie) submitted
-- against an irs_authorizations record. A row per attempt, not a single
-- pair of columns on irs_authorizations itself, so a rejected-and-retried
-- client keeps full history -- the IRS requires retaining the
-- documentation actually used to verify identity.
--
-- Inserts happen only through the client-facing SECURITY DEFINER RPC added
-- in a later migration (the client has no portal session to check RLS
-- against), so there is deliberately no insert policy here -- same
-- "writes only through functions" pattern as workspace_tags.
create table public.irs_authorization_identity_checks (
  id uuid primary key default gen_random_uuid(),
  irs_authorization_id uuid not null references public.irs_authorizations(id) on delete cascade,
  id_photo_path text not null,
  selfie_path text not null,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.user_profiles(id) on delete set null,
  reviewed_at timestamptz,
  decision text check (decision in ('approved', 'rejected')),
  rejection_reason text
);

create index irs_authorization_identity_checks_authorization_id_idx
  on public.irs_authorization_identity_checks(irs_authorization_id);

alter table public.irs_authorization_identity_checks enable row level security;

create policy irs_authorization_identity_checks_select on public.irs_authorization_identity_checks
  for select using (
    exists (
      select 1 from public.irs_authorizations a
      where a.id = irs_authorization_id
        and public.has_permission(a.workspace_id, 'irs_authorizations.view')
    )
  );

create policy irs_authorization_identity_checks_update on public.irs_authorization_identity_checks
  for update using (
    exists (
      select 1 from public.irs_authorizations a
      where a.id = irs_authorization_id
        and public.has_permission(a.workspace_id, 'irs_authorizations.review_identity')
    )
  );
