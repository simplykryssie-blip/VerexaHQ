-- Move citext/pg_trgm out of the public schema per Supabase lint 0014.
-- ALTER EXTENSION ... SET SCHEMA relocates the extension's types/operators
-- without touching objects that already reference them by OID (existing
-- citext columns and the trigram index keep working unchanged).

create schema if not exists extensions;
alter extension citext set schema extensions;
alter extension pg_trgm set schema extensions;

-- Every session needs "extensions" on its search_path to resolve citext/
-- gin_trgm_ops by name in future migrations and queries without having to
-- schema-qualify them everywhere.
alter database postgres set search_path = public, extensions;
