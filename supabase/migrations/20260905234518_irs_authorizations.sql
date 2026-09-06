-- IRS Form 8821 authorization tracking. Modeled on the same shape as
-- signature_requests/engagements: a workspace-scoped record with a
-- staff-only RLS surface, plus a bearer access_token (like
-- signature_request_signers.access_token) that a later migration's
-- SECURITY DEFINER RPCs use to let the client complete identity
-- verification and signing without a portal login. Nothing about IRS
-- transcript retrieval lives here -- this only tracks getting the 8821
-- itself signed; the statuses past "signed" are staff-driven because
-- Verexa has no API visibility into IRS-side processing yet.
create type public.irs_authorization_status as enum (
  'draft',
  'awaiting_identity_verification',
  'identity_verification_rejected',
  'identity_verified',
  'awaiting_signature',
  'signed',
  'submitted',
  'irs_processing',
  'authorized',
  'transcript_eligible',
  'denied',
  'revoked'
);

create table public.irs_authorizations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  engagement_id uuid references public.engagements(id) on delete set null,
  taxpayer_type text not null check (taxpayer_type in ('individual', 'business')),
  -- Designee (the authorized staff member) is snapshotted, not live-joined --
  -- same reasoning as signature_request_signers.typed_name: the document
  -- text and this record should reflect who was actually named at the time,
  -- even if that staff member's profile changes later.
  designee_user_id uuid references public.user_profiles(id) on delete set null,
  designee_name text not null,
  designee_caf_number text,
  -- Array of {tax_info_type, tax_form_number, years_or_periods, specific_matters}
  -- rows -- the real 8821 supports several lines in its tax-matters table.
  tax_matters jsonb not null default '[]'::jsonb,
  status public.irs_authorization_status not null default 'draft',
  access_token uuid not null default gen_random_uuid(),
  attachment_id uuid references public.attachments(id) on delete set null,
  signature_request_id uuid references public.signature_requests(id) on delete set null,
  submitted_at timestamptz,
  authorized_at timestamptz,
  staff_note text,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (access_token)
);

create index irs_authorizations_workspace_id_idx on public.irs_authorizations(workspace_id);
create index irs_authorizations_client_id_idx on public.irs_authorizations(client_id);

alter table public.irs_authorizations enable row level security;

-- Staff-only RLS -- the client-facing flow (added in a later migration)
-- goes entirely through SECURITY DEFINER RPCs keyed by access_token, the
-- same pattern signature_requests/signature_request_signers already use,
-- rather than a client-scoped policy here.
create policy irs_authorizations_select on public.irs_authorizations
  for select using (public.has_permission(workspace_id, 'irs_authorizations.view'));

create policy irs_authorizations_insert on public.irs_authorizations
  for insert with check (public.has_permission(workspace_id, 'irs_authorizations.manage'));

create policy irs_authorizations_update on public.irs_authorizations
  for update using (public.has_permission(workspace_id, 'irs_authorizations.manage'));
