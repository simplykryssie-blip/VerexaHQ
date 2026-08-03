-- Phase 0: Platform Foundation
-- Extensions required across all phases.

create extension if not exists pgcrypto;   -- gen_random_uuid(), encryption primitives for Phase 1 identity vault
create extension if not exists pg_trgm;    -- fuzzy/trigram search on names, contacts, etc.
create extension if not exists citext;     -- case-insensitive columns (emails, subdomains)
