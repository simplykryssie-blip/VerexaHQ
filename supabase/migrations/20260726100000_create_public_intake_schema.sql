-- Public tax intake — Phase 2 (PR A) data model.
--
-- Inspected the live schema before adding anything new (information_schema,
-- pg_get_constraintdef, pg_get_functiondef — not local migration files):
--   - marketing_leads / lead_sources already implement the "Lead" concept
--     (first/last/business_name/email/phone/lead_status/source_id/
--     converted_client_id) — reused as-is via intakes.lead_id, no new lead
--     table.
--   - clients.lifecycle_status ('lead'/'onboarding'/'active'/'inactive'/
--     'archived') + clients.archived_at already implement almost exactly
--     the Lead -> Prospective -> Active -> Former lifecycle this phase
--     needs — reused as-is, no new client-status column.
--   - portal_invitations' token pattern (create_portal_invitation /
--     accept_portal_invitation, read via pg_get_functiondef) is the proven
--     model this project already uses for secure passwordless links:
--     gen_random_bytes(32) hex-encoded, only encode(digest(token,'sha256'),
--     'hex') ever stored, raw token returned once and never persisted.
--     intake_return_tokens mirrors that exactly. portal_invitations itself
--     can't be reused directly — its client_id is NOT NULL, which conflicts
--     with the explicit requirement that starting an intake must never
--     create a client.
--   - tax_organizer_templates/sections/questions/answers is an existing
--     dynamic-questionnaire engine, but tax_organizer_assignments.client_id
--     is NOT NULL (also requires an existing client) and the whole engine
--     stores every answer as opaque jsonb — the intake spec explicitly
--     asks for normalized, searchable/filterable columns for the facts
--     that matter (filing status, income sources, dependents, etc.), with
--     jsonb reserved for the long tail. Not reused for the same
--     no-client-yet reason, and a fixed, code-defined 8-section flow
--     doesn't need a staff-configurable template engine.
--   - documents/client_checklist_items require service_id/engagement_id
--     context that doesn't exist pre-conversion — intake_document_requests
--     and intake_documents are new, intake-scoped equivalents; documents
--     they eventually turn into real service documents at conversion time
--     (a later phase), not this one.
--   - storage.buckets: only 'verexahq-client-documents' exists (confirmed
--     live) — intake uploads use that same bucket, under an
--     intake/{workspace_id}/{intake_id}/ path prefix, never a new bucket.
--
-- Security model: none of these tables grant anon/authenticated any direct
-- SELECT/INSERT/UPDATE/DELETE. Public (anonymous) access only ever goes
-- through SECURITY DEFINER RPCs (added in the next migration) that
-- independently re-validate a token/verification-code on every call and
-- narrowly scope what they touch to that one intake. Staff access is
-- workspace-scoped SELECT/limited-UPDATE via RLS using the existing
-- can_staff_write()/is_workspace_member() helpers, consistent with every
-- other workspace-owned table in this schema.

-- =====================================================================
-- intakes — the core record.
-- =====================================================================
create table if not exists public.intakes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  service_type text not null default 'tax_preparation',
  tax_year integer,
  return_type text check (return_type in ('individual', 'business')),
  is_returning_client boolean,

  status text not null default 'intake_started' check (status in (
    'intake_started', 'intake_in_progress', 'verification_pending', 'intake_submitted',
    'intake_review_needed', 'additional_information_needed', 'consultation_required',
    'consultation_scheduled', 'quote_pending', 'declined', 'archived', 'withdrawn'
  )),
  current_section integer not null default 1,

  -- Section 1 identity fields — always plain text, never the taxpayer's
  -- verified-ownership proof by themselves (see intake_verification_
  -- challenges.verified_at, which is the only thing that ever flips
  -- contact_email_verified/contact_phone_verified below).
  contact_first_name text,
  contact_last_name text,
  contact_email text,
  contact_email_normalized text,
  contact_phone text,
  contact_phone_normalized text,
  contact_email_verified boolean not null default false,
  contact_phone_verified boolean not null default false,

  lead_id uuid references public.marketing_leads(id),
  lead_source_id uuid references public.lead_sources(id),

  -- Matching outcome. matched_client_id is only ever set by an exact
  -- verified-contact match or an explicit staff action — never by name
  -- similarity alone (see intake_possible_matches for the review path).
  matched_client_id uuid references public.clients(id),
  matched_contact_id uuid references public.contacts(id),
  has_possible_matches boolean not null default false,

  -- Normalized facts needed for search/filter/matching/reporting (Section
  -- 2-6 answers). The long tail of less-structured detail lives in
  -- `answers` jsonb below, not here — this is deliberately not
  -- exhaustive, just the fields the spec calls out as needing to be
  -- queryable rather than buried in JSON.
  filing_status_expected text,
  has_spouse boolean,
  dependents_count integer,
  states_lived_worked text[] not null default '{}',
  has_prior_year_return boolean,
  has_irs_state_notice boolean,
  has_unfiled_years boolean,
  income_sources text[] not null default '{}',
  business_count integer not null default 0,
  rental_count integer not null default 0,
  has_cryptocurrency boolean not null default false,
  has_foreign_income boolean not null default false,
  bookkeeping_cleanup_needed boolean not null default false,
  payment_preference text check (payment_preference in ('upfront', 'refund', 'unsure', 'discuss')),
  recommended_package text check (recommended_package in ('standard_upfront', 'refund_payment', 'custom_review')),

  -- Server-derived (never taxpayer-set directly) staff review signals,
  -- computed from the normalized facts above on every save.
  review_flags text[] not null default '{}',
  complexity_classification text check (complexity_classification in ('Basic', 'Standard', 'Complex', 'Special Review')),
  consultation_recommended boolean not null default false,

  -- The long tail: life-change checkboxes, deduction/credit specifics,
  -- household detail beyond what's normalized above, communication/
  -- marketing consent choices, etc. Deliberately not "all state" — see
  -- the normalized columns above for anything that needs to be searched,
  -- filtered, or matched on.
  answers jsonb not null default '{}'::jsonb,

  -- Section 8 acknowledgment — an intake acknowledgment, explicitly NOT a
  -- legal engagement-letter or e-file signature (that's Phase 4, and may
  -- use a different, dedicated table/provider entirely).
  ack_typed_name text,
  ack_accuracy boolean not null default false,
  ack_communication_consent boolean not null default false,
  ack_marketing_consent boolean not null default false,
  ack_electronic_record boolean not null default false,
  ack_ip_address text,
  ack_user_agent text,
  submitted_version integer,

  assigned_to uuid references auth.users(id),
  reviewed_by uuid,
  reviewed_at timestamptz,
  decline_reason text,
  archive_reason text,

  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists intakes_workspace_status_idx on public.intakes (workspace_id, status);
create index if not exists intakes_lead_id_idx on public.intakes (lead_id);
create index if not exists intakes_email_normalized_idx on public.intakes (workspace_id, contact_email_normalized);
create index if not exists intakes_phone_normalized_idx on public.intakes (workspace_id, contact_phone_normalized);
create index if not exists intakes_matched_client_idx on public.intakes (matched_client_id);

-- =====================================================================
-- intake_versions — draft + submitted snapshots. "Lock and version the
-- submitted answers" + "preserve draft and submitted version history".
-- =====================================================================
create table if not exists public.intake_versions (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intakes(id) on delete cascade,
  version_number integer not null,
  version_type text not null check (version_type in ('draft', 'submitted')),
  answers_snapshot jsonb not null,
  normalized_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (intake_id, version_number)
);

-- =====================================================================
-- intake_return_tokens — secure passwordless resume link. Mirrors
-- portal_invitations exactly: only a sha256 hash is ever stored.
-- =====================================================================
create table if not exists public.intake_return_tokens (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intakes(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  use_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists intake_return_tokens_intake_idx on public.intake_return_tokens (intake_id);

-- =====================================================================
-- intake_verification_challenges — email/SMS OTP. Only a sha256 hash of
-- the 6-digit code is ever stored; attempt/cooldown limits are enforced
-- inside the RPCs, not just documented as a UI convention.
-- =====================================================================
create table if not exists public.intake_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intakes(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  destination_normalized text not null,
  code_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'expired', 'invalidated')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  resend_count integer not null default 0,
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists intake_verification_challenges_intake_idx on public.intake_verification_challenges (intake_id, channel);

-- =====================================================================
-- intake_document_requests — the personalized checklist generated from
-- the taxpayer's own answers.
-- =====================================================================
create table if not exists public.intake_document_requests (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intakes(id) on delete cascade,
  item_key text not null,
  item_title text not null,
  item_reason text,
  is_required boolean not null default true,
  is_blocking boolean not null default true,
  status text not null default 'requested' check (status in (
    'requested', 'uploaded', 'under_review', 'accepted', 'replacement_needed',
    'waiting_on_client', 'not_applicable', 'waived_by_staff'
  )),
  client_note text,
  staff_note text,
  waived_by uuid,
  waived_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (intake_id, item_key)
);

create index if not exists intake_document_requests_intake_idx on public.intake_document_requests (intake_id);

-- =====================================================================
-- intake_documents — uploaded file metadata. The file itself lives in
-- verexahq-client-documents under intake/{workspace_id}/{intake_id}/...
-- =====================================================================
create table if not exists public.intake_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  intake_id uuid not null references public.intakes(id) on delete cascade,
  document_request_id uuid not null references public.intake_document_requests(id),
  original_file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  storage_bucket text not null default 'verexahq-client-documents' check (storage_bucket = 'verexahq-client-documents'),
  storage_path text not null,
  review_status text not null default 'under_review' check (review_status in ('under_review', 'accepted', 'rejected')),
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists intake_documents_intake_idx on public.intake_documents (intake_id);
create index if not exists intake_documents_request_idx on public.intake_documents (document_request_id);

-- =====================================================================
-- intake_status_history — append-only. Mirrors the existing
-- trg_prevent_audit_mutation pattern on audit_events so status changes
-- can't be edited or deleted after the fact.
-- =====================================================================
create table if not exists public.intake_status_history (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intakes(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid,
  reason text,
  occurred_at timestamptz not null default now()
);

create index if not exists intake_status_history_intake_idx on public.intake_status_history (intake_id);

create or replace function public.prevent_intake_status_history_mutation()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'Intake status history is immutable';
end;
$function$;

drop trigger if exists trg_prevent_intake_status_history_mutation on public.intake_status_history;
create trigger trg_prevent_intake_status_history_mutation
  before update or delete on public.intake_status_history
  for each row execute function public.prevent_intake_status_history_mutation();

-- =====================================================================
-- intake_possible_matches — ambiguous (name-only/partial) matches that
-- must go to staff review instead of auto-merging.
-- =====================================================================
create table if not exists public.intake_possible_matches (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null references public.intakes(id) on delete cascade,
  candidate_client_id uuid not null references public.clients(id),
  match_reason text not null,
  reviewed boolean not null default false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  resolution text check (resolution in ('linked', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (intake_id, candidate_client_id)
);

create index if not exists intake_possible_matches_intake_idx on public.intake_possible_matches (intake_id);

-- =====================================================================
-- RLS: enabled on every table above. No anon/authenticated grants at
-- all on the token/challenge tables (no legitimate UI ever needs to read
-- a hash) — those are reachable only through SECURITY DEFINER RPCs
-- (owned by postgres, bypass RLS by design). Staff get workspace-scoped
-- SELECT via the existing is_workspace_member()/can_staff_write()
-- helpers already used everywhere else in this schema; staff writes are
-- funneled through RPCs (next migration) so every status change is
-- captured in intake_status_history, not left to ad hoc UPDATEs.
-- =====================================================================
alter table public.intakes enable row level security;
alter table public.intake_versions enable row level security;
alter table public.intake_return_tokens enable row level security;
alter table public.intake_verification_challenges enable row level security;
alter table public.intake_document_requests enable row level security;
alter table public.intake_documents enable row level security;
alter table public.intake_status_history enable row level security;
alter table public.intake_possible_matches enable row level security;

drop policy if exists intakes_staff_select on public.intakes;
create policy intakes_staff_select on public.intakes
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists intake_versions_staff_select on public.intake_versions;
create policy intake_versions_staff_select on public.intake_versions
  for select using (exists (select 1 from public.intakes i where i.id = intake_id and public.is_workspace_member(i.workspace_id)));

drop policy if exists intake_document_requests_staff_select on public.intake_document_requests;
create policy intake_document_requests_staff_select on public.intake_document_requests
  for select using (exists (select 1 from public.intakes i where i.id = intake_id and public.is_workspace_member(i.workspace_id)));

drop policy if exists intake_document_requests_staff_update on public.intake_document_requests;
create policy intake_document_requests_staff_update on public.intake_document_requests
  for update using (exists (select 1 from public.intakes i where i.id = intake_id and public.can_staff_write(i.workspace_id)))
  with check (exists (select 1 from public.intakes i where i.id = intake_id and public.can_staff_write(i.workspace_id)));

drop policy if exists intake_documents_staff_select on public.intake_documents;
create policy intake_documents_staff_select on public.intake_documents
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists intake_status_history_staff_select on public.intake_status_history;
create policy intake_status_history_staff_select on public.intake_status_history
  for select using (exists (select 1 from public.intakes i where i.id = intake_id and public.is_workspace_member(i.workspace_id)));

drop policy if exists intake_possible_matches_staff_select on public.intake_possible_matches;
create policy intake_possible_matches_staff_select on public.intake_possible_matches
  for select using (exists (select 1 from public.intakes i where i.id = intake_id and public.is_workspace_member(i.workspace_id)));

-- Deliberately no policies at all on intake_return_tokens or
-- intake_verification_challenges (default-deny under RLS) — nothing in
-- the app should ever read a token or code hash directly, staff
-- included.
