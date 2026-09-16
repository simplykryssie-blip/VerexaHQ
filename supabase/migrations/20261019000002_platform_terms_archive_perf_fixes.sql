-- Two follow-ups flagged by the Supabase performance advisor right after
-- the archive table/RPC above went live:
--
-- 1. auth_rls_initplan: the SELECT policy called auth.uid() directly inside
--    the EXISTS subquery, which re-evaluates per row instead of once per
--    query. Wrapping it as (select auth.uid()) lets Postgres cache it as an
--    initplan -- same fix Supabase recommends everywhere this shows up.
-- 2. unindexed_foreign_keys: user_id had no covering index (workspace_id
--    already did; consent_record_id's UNIQUE constraint already covers it).
alter policy platform_terms_acceptance_archive_select on public.platform_terms_acceptance_archive
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.workspace_users wu
      where wu.workspace_id = platform_terms_acceptance_archive.workspace_id
        and wu.user_id = (select auth.uid())
        and wu.is_owner = true
        and wu.status = 'active'
    )
  );

alter policy legal_archives_storage_select on storage.objects
  using (
    bucket_id = 'legal-archives'
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.workspace_users wu
        where wu.workspace_id = ((storage.foldername(name))[2])::uuid
          and wu.user_id = (select auth.uid())
          and wu.is_owner = true
          and wu.status = 'active'
      )
    )
  );

create index platform_terms_acceptance_archive_user_id_idx on public.platform_terms_acceptance_archive (user_id);
