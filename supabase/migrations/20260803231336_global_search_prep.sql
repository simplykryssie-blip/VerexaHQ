-- Epic 3A: Engagement Foundation -- Part 7 (Global Search prep).
--
-- "Prepare Global Search indexes" -- generated tsvector columns + GIN
-- indexes on the searchable text of Clients, Engagements, Documents/
-- Attachments, and Notes, so a future search feature is an index lookup
-- away instead of a schema change. No search UI or RPC yet -- just the
-- indexes, per "prepare... future searching," matching the same
-- lay-the-groundwork-only spirit as the Client/Engagement Workspace
-- sections below.

alter table public.clients add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(first_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(last_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(business_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(primary_email, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(primary_phone, '')), 'C')
  ) stored;
create index if not exists idx_clients_search on public.clients using gin (search_vector);

alter table public.engagements add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(engagement_number, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(internal_reference, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(current_stage, '')), 'C')
  ) stored;
create index if not exists idx_engagements_search on public.engagements using gin (search_vector);

alter table public.attachments add column if not exists search_vector tsvector
  generated always as (to_tsvector('english', coalesce(file_name, ''))) stored;
create index if not exists idx_attachments_search on public.attachments using gin (search_vector);

alter table public.notes add column if not exists search_vector tsvector
  generated always as (to_tsvector('english', coalesce(body, ''))) stored;
create index if not exists idx_notes_search on public.notes using gin (search_vector);
