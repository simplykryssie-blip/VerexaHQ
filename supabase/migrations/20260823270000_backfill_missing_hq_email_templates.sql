-- 20260821130000_remove_system_preloaded_templates.sql intended to backfill
-- Verexa HQ CRM's own copies of appointment-reminder,
-- automation-staff-notification, and portal-invite-email before deleting
-- every workspace_id IS NULL template -- but its backfill INSERT selected
-- FROM the global rows at migration-run-time, which (for reasons no longer
-- reconstructable) matched zero rows for these three slugs, so it silently
-- inserted nothing before the delete removed the source rows for good. HQ
-- has had none of these three templates ever since, which is the second,
-- distinct bug behind the stuck portal-invite job: once the cron caching
-- bug (see the prior migration/commit) was fixed and the job actually ran,
-- it failed for real with "Portal invite email template is missing" --
-- because it genuinely was.
--
-- Backfills all three from another real workspace's copies (content is
-- generic firm-branded copy driven entirely by merge tokens, so it's a
-- faithful restore, not new content). Guarded so re-running this is a no-op.
insert into public.email_templates (workspace_id, name, slug, subject, body_html, status, category, merge_fields, schedule_rule)
select '74321fb2-9a18-4625-ab12-01c98e888667'::uuid, name, slug, subject, body_html, status, category, merge_fields, schedule_rule
from public.email_templates
where workspace_id = '0867bbc5-e62b-4217-8bad-11351c24def5'::uuid
  and slug in ('appointment-reminder', 'automation-staff-notification', 'portal-invite-email')
  and not exists (
    select 1 from public.email_templates existing
    where existing.workspace_id = '74321fb2-9a18-4625-ab12-01c98e888667'::uuid
      and existing.slug = email_templates.slug
  );
