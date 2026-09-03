-- Backs the webhook_events_select RLS policy's workspace_id equality
-- filter directly (unlike the routine created_by/reviewed_by audit
-- columns left unindexed elsewhere, this one is on the query's hot path).
create index idx_webhook_events_workspace on public.webhook_events (workspace_id) where workspace_id is not null;
