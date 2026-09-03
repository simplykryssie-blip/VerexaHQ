-- EPIC 3B: WORKFLOW EXECUTION ENGINE (Phase 4 - Corrected)
-- Supabase Project: daxpavvsotvsyqqntddc

-- 1. PROGRESS TRACKING VIEW
-- Note: The original SQL referenced a 'tasks' table which does not exist.
-- The schema uses 'workflow_stages' (instances) joined via 'workflow_runs' to track progress.
CREATE OR REPLACE VIEW v_engagement_progress AS
WITH stage_counts AS (
    SELECT 
        wr.engagement_id,
        COUNT(*) AS total_tasks,
        COUNT(*) FILTER (WHERE ws.status = 'Completed') AS completed_tasks
    FROM workflow_stages ws
    JOIN workflow_runs wr ON ws.workflow_run_id = wr.id
    GROUP BY wr.engagement_id
),
doc_counts AS (
    SELECT 
        entity_id AS engagement_id,
        COUNT(*) AS total_docs,
        COUNT(*) FILTER (WHERE category = 'Final' OR tags @> ARRAY['Verified']) AS verified_docs
    FROM client_documents
    WHERE entity_type = 'engagement'
    GROUP BY entity_id
)
SELECT 
    e.id AS engagement_id,
    e.engagement_number,
    wr.status AS workflow_status,
    COALESCE((sc.completed_tasks::float / NULLIF(sc.total_tasks, 0)) * 100, 0) AS task_progress_pct,
    COALESCE((dc.verified_docs::float / NULLIF(dc.total_docs, 0)) * 100, 0) AS document_progress_pct,
    CASE 
        WHEN wr.status = 'Completed' THEN 100
        ELSE (COALESCE((sc.completed_tasks::float / NULLIF(sc.total_tasks, 0)), 0) * 0.7 + 
              COALESCE((dc.verified_docs::float / NULLIF(dc.total_docs, 0)), 0) * 0.3) * 100
    END AS overall_progress_pct
FROM engagements e
LEFT JOIN workflow_runs wr ON wr.engagement_id = e.id
LEFT JOIN stage_counts sc ON sc.engagement_id = e.id
LEFT JOIN doc_counts dc ON dc.engagement_id = e.id;

-- 2. DEPENDENCY VALIDATION FUNCTION
-- Note: The original SQL referenced 'tasks.workflow_stage_id' which does not exist.
-- Adapted to check workflow_stages directly by its id.
CREATE OR REPLACE FUNCTION check_stage_readiness(p_workflow_stage_id UUID)
RETURNS TABLE(is_ready BOOLEAN, missing_requirements TEXT[]) AS $$
DECLARE
    v_missing TEXT[] := ARRAY[]::TEXT[];
    v_incomplete_stages INT;
BEGIN
    -- Check for incomplete prior stages in the same workflow run
    SELECT COUNT(*) INTO v_incomplete_stages 
    FROM workflow_stages ws
    WHERE ws.workflow_run_id = (
        SELECT workflow_run_id FROM workflow_stages WHERE id = p_workflow_stage_id
    )
    AND ws.display_order < (
        SELECT display_order FROM workflow_stages WHERE id = p_workflow_stage_id
    )
    AND ws.status != 'Completed';
    
    IF v_incomplete_stages > 0 THEN
        v_missing := array_append(v_missing, 'Incomplete Prior Stages (' || v_incomplete_stages || ')');
    END IF;
    
    RETURN QUERY SELECT (array_length(v_missing, 1) IS NULL OR array_length(v_missing, 1) = 0), v_missing;
END;
$$ LANGUAGE plpgsql;

-- 3. AUDIT TRIGGERS FOR WORKFLOW EVENTS
CREATE OR REPLACE FUNCTION audit_workflow_event()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO activity_log (workspace_id, entity_type, entity_id, event_type, description, metadata)
    VALUES (
        NEW.workspace_id,
        'workflow_run',
        NEW.id,
        'STATUS_CHANGE',
        'Workflow status changed from ' || COALESCE(OLD.status::text, 'NULL') || ' to ' || NEW.status::text,
        jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_workflow_status ON workflow_runs;
CREATE TRIGGER trg_audit_workflow_status
AFTER UPDATE OF status ON workflow_runs
FOR EACH ROW
EXECUTE FUNCTION audit_workflow_event();

-- 4. REVIEWER QUEUE VIEW
CREATE OR REPLACE VIEW v_reviewer_queue AS
SELECT 
    ws.id AS workflow_stage_id,
    ws.workspace_id,
    e.engagement_number,
    e.client_id,
    ws.stage_name,
    ws.reviewer_id,
    ws.status,
    ws.due_date,
    ws.started_at
FROM workflow_stages ws
JOIN workflow_runs wr ON ws.workflow_run_id = wr.id
JOIN engagements e ON wr.engagement_id = e.id
WHERE ws.status IN ('Waiting', 'In Progress') AND ws.reviewer_id IS NOT NULL;
