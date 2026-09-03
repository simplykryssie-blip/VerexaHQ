-- EPIC 3A: ENGAGEMENT FOUNDATION (REVISED)
-- Supabase Project: daxpavvsotvsyqqntddc

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE engagement_status AS ENUM (
        'New', 'Waiting On Client', 'Waiting On Staff', 'In Progress', 
        'Waiting On Review', 'Corrections Requested', 'Approved', 
        'Waiting On Signature', 'Waiting On Payment', 'Ready To Release', 
        'Completed', 'Archived'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE engagement_priority AS ENUM ('Low', 'Medium', 'High', 'Urgent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE review_status AS ENUM ('Pending', 'In Review', 'Approved', 'Rejected', 'Corrections Requested');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. ENGAGEMENTS TABLE CREATION
CREATE TABLE IF NOT EXISTS engagements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    client_id UUID REFERENCES clients(id),
    workspace_id UUID REFERENCES workspaces(id),
    blueprint_id UUID REFERENCES blueprints(id),
    workflow_id UUID REFERENCES processes(id),
    current_stage TEXT,
    priority engagement_priority DEFAULT 'Medium',
    review_status review_status DEFAULT 'Pending',
    assigned_staff_id UUID REFERENCES user_profiles(id),
    reviewer_id UUID REFERENCES user_profiles(id),
    compliance_officer_id UUID REFERENCES user_profiles(id),
    owner_workspace_id UUID REFERENCES workspaces(id),
    shared_status TEXT,
    open_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    due_date TIMESTAMP WITH TIME ZONE,
    completed_date TIMESTAMP WITH TIME ZONE,
    archived_date TIMESTAMP WITH TIME ZONE,
    internal_reference TEXT,
    engagement_number TEXT UNIQUE
);

-- 3. STATUS HISTORY
CREATE TABLE IF NOT EXISTS engagement_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT NOT NULL,
    changed_by UUID REFERENCES user_profiles(id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reason TEXT,
    audit_reference UUID REFERENCES audit_log(id)
);

-- 4. ENGAGEMENTS TABLE ENHANCEMENT (ADDITIONAL COLUMNS - IF NOT EXISTS)
ALTER TABLE engagements 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id),
ADD COLUMN IF NOT EXISTS blueprint_id UUID REFERENCES blueprints(id),
ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES processes(id), -- Assuming 'processes' are workflows
ADD COLUMN IF NOT EXISTS current_stage TEXT,
ADD COLUMN IF NOT EXISTS priority engagement_priority DEFAULT 'Medium',
ADD COLUMN IF NOT EXISTS review_status review_status DEFAULT 'Pending',
ADD COLUMN IF NOT EXISTS assigned_staff_id UUID REFERENCES user_profiles(id),
ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES user_profiles(id),
ADD COLUMN IF NOT EXISTS compliance_officer_id UUID REFERENCES user_profiles(id),
ADD COLUMN IF NOT EXISTS owner_workspace_id UUID REFERENCES workspaces(id),
ADD COLUMN IF NOT EXISTS shared_status TEXT,
ADD COLUMN IF NOT EXISTS open_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS due_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS completed_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS archived_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS internal_reference TEXT,
ADD COLUMN IF NOT EXISTS engagement_number TEXT UNIQUE;

-- Create a function to generate human-readable engagement numbers (ENG-YYYY-000001)
CREATE OR REPLACE FUNCTION generate_engagement_number()
RETURNS TRIGGER AS $$
DECLARE
    year_part TEXT;
    seq_part TEXT;
    next_val BIGINT;
BEGIN
    year_part := to_char(NOW(), 'YYYY');
    -- Simple sequence approach (could be more complex per workspace)
    SELECT count(*) + 1 INTO next_val FROM engagements WHERE to_char(created_at, 'YYYY') = year_part;
    seq_part := lpad(next_val::text, 6, '0');
    NEW.engagement_number := 'ENG-' || year_part || '-' || seq_part;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_engagement_number ON engagements;
CREATE TRIGGER trg_generate_engagement_number
BEFORE INSERT ON engagements
FOR EACH ROW
WHEN (NEW.engagement_number IS NULL)
EXECUTE FUNCTION generate_engagement_number();

-- 5. UNIVERSAL TIMELINE (Reusing/Extending activity_log)
-- We'll add polymorphic columns to activity_log
ALTER TABLE activity_log
ADD COLUMN IF NOT EXISTS entity_type TEXT,
ADD COLUMN IF NOT EXISTS entity_id UUID,
ADD COLUMN IF NOT EXISTS event_type TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 6. UNIVERSAL NOTES
-- Reusing client_notes but making it universal
ALTER TABLE client_notes
RENAME COLUMN client_id TO entity_id; -- Migration: set entity_type = 'client'
ALTER TABLE client_notes
ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'client',
ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES user_profiles(id),
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS rich_content JSONB,
ADD COLUMN IF NOT EXISTS mentions JSONB,
ADD COLUMN IF NOT EXISTS attachments JSONB;

-- 7. UNIVERSAL ATTACHMENTS
-- Reusing client_documents
ALTER TABLE client_documents
RENAME COLUMN client_id TO entity_id;
ALTER TABLE client_documents
ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'client',
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS tags TEXT[],
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS uploader_id UUID REFERENCES user_profiles(id);

-- 8. NOTIFICATION FOUNDATION
-- Reusing notification_queue
ALTER TABLE notification_queue
ADD COLUMN IF NOT EXISTS event_type TEXT,
ADD COLUMN IF NOT EXISTS payload JSONB,
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Medium',
ADD COLUMN IF NOT EXISTS channels TEXT[] DEFAULT ARRAY['In-App'];

-- 9. SEARCH INDEXES
CREATE INDEX IF NOT EXISTS idx_engagements_number ON engagements(engagement_number);
CREATE INDEX IF NOT EXISTS idx_engagements_client ON engagements(client_id);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notes_entity ON client_notes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON client_documents(entity_type, entity_id);
