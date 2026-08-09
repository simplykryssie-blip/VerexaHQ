-- security_sweep_fixes_batch_2
--
-- Fixes three items from the Supabase security advisor that were still
-- open as of the last scan:
--
-- 1. v_engagement_progress was an implicit SECURITY DEFINER view (the
--    Postgres default for a view owned by a privileged role), so it ran
--    with the view owner's permissions rather than the querying user's --
--    bypassing RLS on engagements/workflow_runs/tasks/attachments for
--    whoever queried it. Recreated with security_invoker = true so RLS
--    is enforced normally. Definition is otherwise byte-for-byte
--    unchanged from the live view (pulled via pg_get_viewdef before
--    writing this migration).
--
-- 2 & 3. generate_invoice_number() and generate_quote_number() had a
--    mutable search_path, a known function-hijacking vector: an object
--    earlier in the caller's search_path could shadow a table/function
--    referenced unqualified inside the trigger. Both already qualify
--    every relation reference (public.invoices, public.quotes), so this
--    pins search_path defensively without changing behavior. Bodies are
--    otherwise unchanged (pulled via pg_get_functiondef).

CREATE OR REPLACE VIEW public.v_engagement_progress
WITH (security_invoker = true) AS
WITH task_counts AS (
  SELECT t.engagement_id,
    count(*) AS total_tasks,
    count(*) FILTER (WHERE t.status = 'completed'::text) AS completed_tasks
  FROM tasks t
  GROUP BY t.engagement_id
), doc_counts AS (
  SELECT attachments.entity_id AS engagement_id,
    count(*) AS total_docs,
    count(*) FILTER (WHERE attachments.category = 'Final'::text OR attachments.tags @> ARRAY['Verified'::text]) AS verified_docs
  FROM attachments
  WHERE attachments.entity_type = 'engagement'::text
  GROUP BY attachments.entity_id
)
SELECT e.id AS engagement_id,
  e.engagement_number,
  wr.status AS workflow_status,
  COALESCE(tc.completed_tasks::double precision / NULLIF(tc.total_tasks, 0)::double precision * 100::double precision, 0::double precision) AS task_progress_pct,
  COALESCE(dc.verified_docs::double precision / NULLIF(dc.total_docs, 0)::double precision * 100::double precision, 0::double precision) AS document_progress_pct,
  CASE
    WHEN wr.status = 'Completed'::workflow_run_status THEN 100::double precision
    ELSE (COALESCE(tc.completed_tasks::double precision / NULLIF(tc.total_tasks, 0)::double precision, 0::double precision) * 0.7::double precision + COALESCE(dc.verified_docs::double precision / NULLIF(dc.total_docs, 0)::double precision, 0::double precision) * 0.3::double precision) * 100::double precision
  END AS overall_progress_pct
FROM engagements e
  LEFT JOIN workflow_runs wr ON wr.engagement_id = e.id
  LEFT JOIN task_counts tc ON tc.engagement_id = e.id
  LEFT JOIN doc_counts dc ON dc.engagement_id = e.id;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public, pg_temp
AS $function$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next bigint;
begin
  if new.invoice_number is not null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('invoice_' || new.workspace_id::text || v_year, 0));
  select coalesce(max(split_part(invoice_number, '-', 3)::bigint), 0) + 1 into v_next
    from public.invoices
    where workspace_id = new.workspace_id and invoice_number like 'INV-' || v_year || '-%';
  new.invoice_number := 'INV-' || v_year || '-' || lpad(v_next::text, 6, '0');
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.generate_quote_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public, pg_temp
AS $function$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next bigint;
begin
  if new.quote_number is not null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('quote_' || new.workspace_id::text || v_year, 0));
  select coalesce(max(split_part(quote_number, '-', 3)::bigint), 0) + 1 into v_next
    from public.quotes
    where workspace_id = new.workspace_id and quote_number like 'QUO-' || v_year || '-%';
  new.quote_number := 'QUO-' || v_year || '-' || lpad(v_next::text, 6, '0');
  return new;
end;
$function$;
