-- =============================================================================
-- BASELINE SCHEMA SNAPSHOT — bootstrap-only, not a normal migration
-- =============================================================================
--
-- WHAT THIS IS
--   A full schema-only snapshot of production's `public` schema on Supabase
--   project daxpavvsotvsyqqntddc (org nmkuapcamjwfrnulutkd), captured live via
--   SQL introspection (pg_catalog / information_schema, no pg_dump/psql access
--   was available) on 2026-09-03. It reflects the schema AS IT EXISTS TODAY —
--   i.e. the cumulative effect of every migration ever applied to production,
--   including the original "platform_foundation rebuild" that created the
--   core tables (workspaces, clients, engagements, invoices, etc.) directly
--   against production without ever being captured as a migration file. That
--   gap is exactly why this snapshot exists: the 385 incremental files in
--   supabase/migrations/ assume those core tables already exist and cannot,
--   by themselves, bootstrap an empty database.
--
-- WHAT THIS IS FOR
--   Bootstrapping a brand-new, EMPTY Supabase project (e.g. the isolated
--   `verexahq-test` project used by tests/critical-paths.test.ts) to match
--   production's schema in a single shot. Apply ONLY this file to a fresh
--   project — do NOT also replay the 385 incremental migration files
--   afterwards; this snapshot already reflects their cumulative effect and
--   replaying them on top would fail with "already exists" errors.
--
-- WHAT THIS IS NOT
--   - NOT idempotent against a database that already has this schema. It
--     contains no "IF NOT EXISTS" guards on most objects (tables, functions,
--     policies, etc.) and must NEVER be applied to production itself, to any
--     project that already ran the 385 incremental migrations, or replayed a
--     second time against a project it was already applied to.
--   - NOT a replacement migration history — it captures current STATE, not
--     the sequence of changes that produced it.
--   - Contains NO data. Schema only: tables, columns, types/defaults/NOT
--     NULL, constraints (PK/unique/FK/check), indexes, views, functions,
--     triggers, RLS enablement + policies, sequences, custom
--     types/enums/domains, and extensions. Zero INSERT statements.
--
-- FILE ORDER (deviates slightly from the usual "functions before tables"
-- convention — see note below)
--   1. Extensions
--   2. Custom types / enums (no domains exist in this schema)
--   3. Tables (bare: columns, defaults, identity/generated columns, NOT NULL)
--   4. Functions / procedures
--   5. Constraints (PK -> unique -> FK -> check)
--   6. Indexes (non-constraint-backed only; PK/unique indexes come from step 5)
--   7. Triggers (including one CREATE CONSTRAINT TRIGGER)
--   8. Views
--   9. RLS: ENABLE ROW LEVEL SECURITY + CREATE POLICY
--
--   Tables were deliberately moved BEFORE functions (the "textbook" order
--   puts functions first). Verification showed 53 of the 358 functions are
--   LANGUAGE SQL, and PostgreSQL parses/validates a SQL-language function
--   body against the objects it references AT CREATE TIME (unlike PL/pgSQL,
--   which only checks references at first CALL). Several SQL functions
--   reference application tables directly, so creating them before the
--   tables exist would fail. No column DEFAULT or GENERATED expression in
--   this schema calls a custom (non-builtin) function, so moving tables
--   ahead of functions is safe and avoids that whole class of failure.
--
-- RISK AREAS TO CHECK FIRST IF THIS FAILS TO APPLY
--   1. SQL-language functions (53 of them) are validated at CREATE time
--      against every object they reference, including OTHER functions. They
--      were fetched/emitted in alphabetical-by-name order, not dependency
--      order, so a SQL function that calls another SQL function defined
--      later alphabetically could fail to create. PL/pgSQL functions (the
--      other 305) are NOT affected by this — Postgres defers their body
--      validation to first call.
--   2. One CONSTRAINT TRIGGER exists: trg_fire_engagement_created_automations
--      on public.engagements (DEFERRABLE INITIALLY DEFERRED, calls
--      fire_engagement_created_automations()). It is emitted via
--      CREATE CONSTRAINT TRIGGER in the triggers section, NOT as a table
--      constraint — pg_get_constraintdef() cannot express it, so it was
--      deliberately excluded from the constraints section to avoid a
--      malformed ALTER TABLE ADD CONSTRAINT statement.
--   3. Generated columns: 4 STORED generated columns exist, all
--      `tsvector ... GENERATED ALWAYS AS (to_tsvector(...)) STORED` full-text
--      search columns (clients.search_vector, engagements.search_vector,
--      notes.search_vector, attachments.search_vector). They depend only on
--      built-in functions (to_tsvector/setweight/coalesce), so ordering is
--      not a concern for them specifically.
--   4. One IDENTITY column: public.rate_limit_hits.id
--      (bigint GENERATED ALWAYS AS IDENTITY). No other identity columns and
--      no standalone/manually-created sequences exist in `public` — the only
--      sequence found is the auto-owned identity sequence for that column,
--      which Postgres creates automatically as part of the column
--      definition, so no separate CREATE SEQUENCE statement was needed.
--   5. No partitioned tables and no table inheritance exist in `public`
--      (there IS one partitioned table in the schema overall —
--      realtime.messages — but that belongs to Supabase's own `realtime`
--      schema, is out of scope, and is not included here).
--   6. Extensions: pg_cron (schema pg_catalog) and supabase_vault (schema
--      vault) are typically pre-provisioned by the Supabase platform itself
--      on a fresh project and/or require elevated privileges to CREATE
--      EXTENSION directly via SQL. If this file's CREATE EXTENSION
--      statements for those two fail or are rejected, that is expected on
--      some fresh-project setups — check whether the target project already
--      has them (Supabase dashboard > Database > Extensions) before treating
--      it as a real error.
--   7. All 146 base tables have Row Level Security enabled and, between
--      them, carry 407 policies. Every policy body was captured verbatim via
--      pg_policies (qual / with_check) and re-serialized as CREATE POLICY;
--      the policies were NOT re-derived or simplified, so any USING/WITH
--      CHECK expression that calls a function (many do, e.g.
--      is_workspace_member(...)) depends on that function already existing
--      — satisfied by the ordering above, but worth knowing if you split
--      this file apart.
--   8. Two Postgres reserved-ish column names on public.engagements
--      (current_stage) and similar are protected by trigger functions
--      (protect_engagement_current_stage, protect_workspace_users_owner_flag,
--      protect_entry_lead_stage) that special-case `current_user = 'postgres'`
--      — if this file is applied by a role other than `postgres` (e.g. via
--      the Supabase SQL editor as a different superuser-equivalent role),
--      double-check these triggers don't reject the bootstrap itself; they
--      only fire on UPDATE, not on the initial CREATE TABLE, so this should
--      not affect a from-empty apply, but note it before writing seed data.
--
-- SELF-VERIFICATION (production pg_catalog counts vs. statements in this
-- file, captured 2026-09-03 — see the accompanying report for full detail)
--   tables: 146 / 146      functions: 358 / 358     triggers: 238 / 238
--   views: 13 / 13         policies: 407 / 407       enums: 5 / 5
--   constraints: 743 emitted (744 total minus 1 constraint trigger,
--     re-homed into the triggers section — see risk area #2 above)
--   indexes: 400 / 400 non-constraint-backed (608 total minus 208
--     constraint-backed: 146 PK + 62 unique, verified to match exactly)
--   extensions: 7 / 7      RLS-enabled tables: 146 / 146 (all base tables)
--   domains: 0             standalone sequences: 0    partitioned tables: 0
--
-- =============================================================================

-- =============================================================================
-- 1. EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


-- =============================================================================
-- 2. CUSTOM TYPES / ENUMS  (no domains exist in this schema)
-- =============================================================================

CREATE TYPE public.engagement_priority AS ENUM ('Low', 'Medium', 'High', 'Urgent');

CREATE TYPE public.engagement_status AS ENUM ('New', 'Waiting On Client', 'Waiting On Staff', 'In Progress', 'Waiting On Review', 'Corrections Requested', 'Approved', 'Waiting On Signature', 'Waiting On Payment', 'Ready To Release', 'Completed', 'Archived');

CREATE TYPE public.review_status AS ENUM ('Pending', 'In Review', 'Approved', 'Rejected', 'Corrections Requested');

CREATE TYPE public.workflow_run_status AS ENUM ('Pending', 'Active', 'Paused', 'Cancelled', 'Completed');

CREATE TYPE public.workflow_stage_status AS ENUM ('Pending', 'In Progress', 'Waiting', 'Completed', 'Skipped');


-- =============================================================================
-- 3. TABLES (bare: columns, defaults, identity/generated columns, NOT NULL)
-- =============================================================================

CREATE TABLE public.activity_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  actor_id uuid,
  entity_type text NOT NULL,
  entity_id uuid,
  activity_type text NOT NULL,
  description text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  event_type text
);

CREATE TABLE public.ai_agent_evidence (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  run_id uuid NOT NULL,
  finding_id uuid,
  evidence_type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  storage_path text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_agent_finding_correlations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  finding_id_a uuid NOT NULL,
  finding_id_b uuid NOT NULL,
  relationship text DEFAULT 'related'::text NOT NULL,
  confidence text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_agent_findings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  agent_id uuid NOT NULL,
  run_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  category text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  expected_behavior text,
  actual_behavior text,
  reproduction_steps jsonb,
  affected_module text,
  related_record_type text,
  related_record_id text,
  fingerprint text NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  regression_of uuid,
  ai_analysis jsonb,
  possible_cause text,
  first_detected_at timestamp with time zone DEFAULT now() NOT NULL,
  last_detected_at timestamp with time zone DEFAULT now() NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  decision_notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_agent_run_budgets (
  run_id uuid NOT NULL,
  max_duration_seconds integer DEFAULT 600 NOT NULL,
  max_steps integer DEFAULT 200 NOT NULL,
  max_ai_calls integer DEFAULT 50 NOT NULL,
  consumed_steps integer DEFAULT 0 NOT NULL,
  consumed_ai_calls integer DEFAULT 0 NOT NULL,
  hard_stopped_at timestamp with time zone,
  hard_stop_reason text
);

CREATE TABLE public.ai_agent_run_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  run_id uuid NOT NULL,
  seq integer NOT NULL,
  level text DEFAULT 'info'::text NOT NULL,
  message text NOT NULL,
  meta jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_agent_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  agent_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  initiated_by uuid,
  run_type text NOT NULL,
  scope jsonb DEFAULT '{}'::jsonb NOT NULL,
  objective text,
  status text DEFAULT 'running'::text NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  summary jsonb DEFAULT '{}'::jsonb NOT NULL,
  error_message text,
  ai_analysis jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_agent_test_personas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  persona_role text NOT NULL,
  auth_user_id uuid,
  label text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_agents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  agent_key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  agent_type text DEFAULT 'system_monitor'::text NOT NULL,
  version text DEFAULT '0.1.0'::text NOT NULL,
  is_enabled boolean DEFAULT false NOT NULL,
  config jsonb DEFAULT '{}'::jsonb NOT NULL,
  last_run_id uuid,
  last_run_at timestamp with time zone,
  last_success_run_at timestamp with time zone,
  last_failure_run_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.appointment_external_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  appointment_id uuid NOT NULL,
  user_calendar_connection_id uuid NOT NULL,
  external_event_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.appointments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  client_id uuid,
  engagement_id uuid,
  staff_id uuid,
  title text NOT NULL,
  description text,
  location text,
  start_at timestamp with time zone NOT NULL,
  end_at timestamp with time zone NOT NULL,
  status text DEFAULT 'scheduled'::text NOT NULL,
  portal_visible boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  meeting_url text,
  external_source text,
  external_id text
);

CREATE TABLE public.attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entity_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  file_size_bytes bigint,
  mime_type text,
  uploaded_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  entity_type text DEFAULT 'client'::text NOT NULL,
  category text,
  tags text[],
  version integer DEFAULT 1,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, COALESCE(file_name, ''::text))) STORED,
  folder_id uuid,
  is_favorite boolean DEFAULT false NOT NULL,
  is_archived boolean DEFAULT false NOT NULL,
  visibility text DEFAULT 'internal'::text NOT NULL,
  replaces_attachment_id uuid,
  is_latest_version boolean DEFAULT true NOT NULL,
  is_locked boolean DEFAULT false NOT NULL,
  ai_metadata jsonb
);

CREATE TABLE public.audit_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid,
  actor_id uuid,
  actor_role text,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  severity text DEFAULT 'info'::text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.automation_date_reminders_sent (
  automation_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  reminder_date date NOT NULL,
  sent_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.automation_execution_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  automation_id uuid NOT NULL,
  engagement_id uuid,
  workflow_run_id uuid,
  status text NOT NULL,
  executed_at timestamp with time zone DEFAULT now(),
  execution_data jsonb,
  error_message text
);

CREATE TABLE public.automation_pending_steps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  run_id uuid NOT NULL,
  automation_step_id uuid NOT NULL,
  status text DEFAULT 'pending_delay'::text NOT NULL,
  scheduled_for timestamp with time zone,
  approved_by uuid,
  approved_at timestamp with time zone,
  rejected_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.automation_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  automation_id uuid NOT NULL,
  engagement_id uuid,
  trigger_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'running'::text NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  client_id uuid,
  current_step_id uuid
);

CREATE TABLE public.automation_step_edges (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  automation_id uuid NOT NULL,
  from_step_id uuid NOT NULL,
  to_step_id uuid,
  branch_conditions jsonb,
  label text,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.automation_steps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  automation_id uuid NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  action_type text NOT NULL,
  action_config jsonb DEFAULT '{}'::jsonb NOT NULL,
  delay_minutes integer DEFAULT 0 NOT NULL,
  requires_approval boolean DEFAULT false NOT NULL,
  approver_role_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  canvas_x numeric,
  canvas_y numeric,
  display_name text,
  is_enabled boolean DEFAULT true NOT NULL
);

CREATE TABLE public.automation_webhook_deliveries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  run_id uuid,
  url text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  last_error text,
  next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  sent_at timestamp with time zone
);

CREATE TABLE public.automations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  trigger_type text NOT NULL,
  trigger_config jsonb DEFAULT '{}'::jsonb NOT NULL,
  conditions jsonb DEFAULT '[]'::jsonb NOT NULL,
  is_enabled boolean DEFAULT true NOT NULL,
  status text DEFAULT 'published'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  ai_config jsonb,
  webhook_token uuid DEFAULT gen_random_uuid() NOT NULL,
  folder_id uuid
);

CREATE TABLE public.billing_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  invoice_timing text DEFAULT 'after_work'::text NOT NULL,
  deposit_required boolean DEFAULT false NOT NULL,
  deposit_percent numeric(5,2),
  payment_before_release boolean DEFAULT false NOT NULL,
  installments_allowed boolean DEFAULT false NOT NULL,
  installment_count integer,
  late_fee_enabled boolean DEFAULT false NOT NULL,
  late_fee_amount numeric(12,2),
  late_fee_percent numeric(5,2),
  automatic_reminders jsonb DEFAULT '[]'::jsonb NOT NULL,
  collections_enabled boolean DEFAULT false NOT NULL,
  collections_after_days integer,
  status text DEFAULT 'published'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.branding (
  workspace_id uuid NOT NULL,
  display_name text,
  logo_url text,
  primary_color text DEFAULT '#0f172a'::text NOT NULL,
  secondary_color text DEFAULT '#2563eb'::text NOT NULL,
  accent_color text DEFAULT '#22c55e'::text NOT NULL,
  portal_subdomain text,
  custom_domain text,
  email_from_name text,
  support_email citext,
  support_phone text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  dba text,
  sidebar_logo_url text,
  portal_logo_url text,
  email_header_logo_url text,
  pdf_header_logo_url text,
  business_phone text,
  business_email citext,
  website_url text,
  theme_mode text DEFAULT 'light'::text NOT NULL,
  reply_to_email text,
  billing_email text,
  notification_email text,
  sidebar_text_color text,
  sidebar_bg_color text,
  favicon_url text
);

CREATE TABLE public.calendar_sync_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  appointment_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  action text NOT NULL,
  title text,
  description text,
  location text,
  meeting_url text,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  status text DEFAULT 'pending'::text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  max_attempts integer DEFAULT 8 NOT NULL,
  error text,
  scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.change_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  quote_id uuid,
  description text NOT NULL,
  amount_delta numeric(12,2) DEFAULT 0 NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  created_by uuid,
  approved_by uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.client_addresses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  address_type text DEFAULT 'mailing'::text NOT NULL,
  street text,
  city text,
  state text,
  zip text,
  is_primary boolean DEFAULT false NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  source_batch_id uuid
);

CREATE TABLE public.client_contacts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  first_name text,
  last_name text,
  title text,
  email citext,
  phone text,
  preferred_contact_method text,
  is_primary boolean DEFAULT false NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.client_emails (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  email_type text DEFAULT 'personal'::text NOT NULL,
  email citext NOT NULL,
  is_primary boolean DEFAULT false NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.client_ledger (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  client_id uuid NOT NULL,
  entry_type text NOT NULL,
  reference_table text,
  reference_id uuid,
  amount numeric(12,2) NOT NULL,
  balance_after numeric(12,2) NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.client_pending_changes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  client_id uuid NOT NULL,
  source text NOT NULL,
  organizer_response_id uuid,
  organizer_field_id uuid,
  target_table text NOT NULL,
  target_column text NOT NULL,
  client_address_id uuid,
  batch_id uuid DEFAULT gen_random_uuid() NOT NULL,
  old_value text,
  new_value text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  submitted_by_portal_user_id uuid,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  decision_notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  new_value_last4 text
);

CREATE TABLE public.client_phones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  phone_type text DEFAULT 'mobile'::text NOT NULL,
  phone_number text NOT NULL,
  is_primary boolean DEFAULT false NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.client_portal_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  invited_email citext NOT NULL,
  invited_name text,
  is_primary boolean DEFAULT false NOT NULL,
  status text DEFAULT 'invited'::text NOT NULL,
  invited_by uuid,
  invited_at timestamp with time zone DEFAULT now() NOT NULL,
  accepted_at timestamp with time zone,
  display_order integer DEFAULT 0 NOT NULL,
  user_id uuid,
  invitation_token uuid DEFAULT gen_random_uuid() NOT NULL,
  token_expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL
);

CREATE TABLE public.client_relationships (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  related_client_id uuid,
  relationship_type text NOT NULL,
  related_name text,
  notes text,
  display_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  related_dob date,
  related_ssn_encrypted bytea,
  related_ssn_last4 text,
  custom_relationship_title text,
  source_organizer_response_id uuid,
  source_instance_index integer
);

CREATE TABLE public.client_service_interests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  service_category_id uuid,
  service_id uuid,
  source text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.clients (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  client_type text DEFAULT 'individual'::text NOT NULL,
  lifecycle_status text DEFAULT 'lead'::text NOT NULL,
  first_name text,
  last_name text,
  business_name text,
  date_of_birth date,
  primary_email citext,
  primary_phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text DEFAULT 'US'::text NOT NULL,
  ssn_encrypted bytea,
  ssn_last4 text,
  ssn_hash text,
  ein_encrypted bytea,
  ein_last4 text,
  ein_hash text,
  itin_encrypted bytea,
  itin_last4 text,
  itin_hash text,
  normalized_email citext,
  normalized_phone text,
  has_portal_access boolean DEFAULT false NOT NULL,
  tags text[] DEFAULT '{}'::text[] NOT NULL,
  custom_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
  notes text,
  merged_into_client_id uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (((((setweight(to_tsvector('english'::regconfig, COALESCE(first_name, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(last_name, ''::text)), 'A'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(business_name, ''::text)), 'A'::"char")) || setweight(to_tsvector('english'::regconfig, (COALESCE(primary_email, ''::citext))::text), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(primary_phone, ''::text)), 'C'::"char"))) STORED,
  relationship_manager_id uuid,
  default_reviewer_id uuid,
  default_compliance_officer_id uuid,
  client_number text,
  source_workspace_id uuid,
  portal_basic_info_completed_at timestamp with time zone,
  middle_name text,
  suffix text,
  lost_reason text,
  sms_opt_out boolean DEFAULT false NOT NULL,
  sms_opt_out_at timestamp with time zone,
  email_opt_out boolean DEFAULT false NOT NULL,
  email_opt_out_at timestamp with time zone,
  lost_at timestamp with time zone
);

CREATE TABLE public.communication_preferences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  client_id uuid NOT NULL,
  preferred_channel text DEFAULT 'email'::text NOT NULL,
  email_opt_in boolean DEFAULT true NOT NULL,
  sms_opt_in boolean DEFAULT true NOT NULL,
  do_not_contact boolean DEFAULT false NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.config_object_shares (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  shared_by_workspace_id uuid NOT NULL,
  shared_with_workspace_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  shared_by uuid,
  responded_by uuid,
  responded_at timestamp with time zone,
  accepted_object_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.config_object_versions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  workspace_id uuid,
  version_number integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.consent_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid,
  user_id uuid,
  client_id uuid,
  consent_type text NOT NULL,
  version text NOT NULL,
  accepted_at timestamp with time zone DEFAULT now() NOT NULL,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.dashboard_widgets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  dashboard_id uuid NOT NULL,
  widget_type text NOT NULL,
  title text,
  display_order integer DEFAULT 0 NOT NULL,
  grid_position jsonb DEFAULT '{}'::jsonb NOT NULL,
  config jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  is_visible boolean DEFAULT true NOT NULL
);

CREATE TABLE public.dashboards (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  role_slug text,
  is_default boolean DEFAULT false NOT NULL,
  status text DEFAULT 'published'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.document_folder_template_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_folder_template_id uuid NOT NULL,
  parent_item_id uuid,
  name text NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.document_folder_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid,
  name text NOT NULL,
  module text NOT NULL,
  status text DEFAULT 'published'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.document_folders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  parent_folder_id uuid,
  name text NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.document_request_item_statuses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_request_id uuid NOT NULL,
  document_request_item_id uuid,
  name text NOT NULL,
  is_required boolean DEFAULT true NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  fulfilled_by_attachment_id uuid,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  organizer_field_id uuid,
  category text
);

CREATE TABLE public.document_request_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_request_template_id uuid NOT NULL,
  category text NOT NULL,
  name text NOT NULL,
  instructions text,
  is_required boolean DEFAULT true NOT NULL,
  conditional_logic jsonb DEFAULT '{}'::jsonb NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  default_folder_name text
);

CREATE TABLE public.document_request_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  status text DEFAULT 'published'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  folder_id uuid
);

CREATE TABLE public.document_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  entity_type text DEFAULT 'client'::text NOT NULL,
  entity_id uuid NOT NULL,
  document_request_template_id uuid,
  title text NOT NULL,
  due_date date,
  status text DEFAULT 'open'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  organizer_response_id uuid,
  reviewed_at timestamp with time zone,
  reviewed_by uuid
);

CREATE TABLE public.draft_saves (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  draft_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.due_date_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  rule_type text NOT NULL,
  base_date_type text,
  offset_days integer DEFAULT 0,
  is_active boolean DEFAULT true,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.email_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  message_id uuid,
  template_key text,
  recipient_email text NOT NULL,
  subject text,
  status text DEFAULT 'queued'::text NOT NULL,
  provider_reference text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  delivered_at timestamp with time zone,
  opened_at timestamp with time zone,
  bounced_at timestamp with time zone,
  open_count integer DEFAULT 0 NOT NULL,
  failed_reason text,
  notification_queue_id uuid,
  clicked_at timestamp with time zone,
  click_count integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.email_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  category text,
  subject text NOT NULL,
  body_html text DEFAULT ''::text NOT NULL,
  merge_fields jsonb DEFAULT '[]'::jsonb NOT NULL,
  schedule_rule jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'published'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  folder_id uuid
);

CREATE TABLE public.engagement_assignment_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  engagement_id uuid NOT NULL,
  assignment_role text NOT NULL,
  previous_user_id uuid,
  new_user_id uuid,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT now() NOT NULL,
  reason text
);

CREATE TABLE public.engagement_letter_public_signatures (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  engagement_letter_template_id uuid NOT NULL,
  client_id uuid NOT NULL,
  signer_name text NOT NULL,
  signer_email text NOT NULL,
  signer_phone text,
  resolved_body_html text NOT NULL,
  typed_name text,
  signed_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  filed_as_attachment boolean DEFAULT false NOT NULL,
  signature_type text DEFAULT 'typed'::text NOT NULL,
  signature_image_path text
);

CREATE TABLE public.engagement_letter_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  body_html text DEFAULT ''::text NOT NULL,
  merge_fields jsonb DEFAULT '[]'::jsonb NOT NULL,
  requires_signature boolean DEFAULT true NOT NULL,
  status text DEFAULT 'published'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  public_token uuid DEFAULT gen_random_uuid() NOT NULL,
  is_public boolean DEFAULT false NOT NULL,
  requires_portal_signup boolean DEFAULT false NOT NULL,
  banner_image_url text,
  folder_id uuid,
  source_type text DEFAULT 'richtext'::text NOT NULL,
  pdf_storage_path text,
  pdf_field_mode text,
  pdf_field_mappings jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE public.engagement_pricing (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  pricing_method text DEFAULT 'flat_fee'::text NOT NULL,
  base_amount numeric(12,2),
  final_amount numeric(12,2),
  discount_amount numeric(12,2) DEFAULT 0 NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.engagement_review_actions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  engagement_share_id uuid NOT NULL,
  action text NOT NULL,
  actor_id uuid,
  comment text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.engagement_shares (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  engagement_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  shared_with_workspace_id uuid NOT NULL,
  shared_items jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  decision_notes text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  shared_by uuid,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.engagement_status_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  engagement_id uuid NOT NULL,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT now(),
  reason text,
  audit_reference uuid
);

CREATE TABLE public.engagement_tax_details (
  engagement_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  tax_year integer,
  return_type text,
  is_amended boolean DEFAULT false NOT NULL,
  original_engagement_id uuid,
  is_extended boolean DEFAULT false NOT NULL,
  extension_filed_date date,
  extension_due_date date,
  return_status text DEFAULT 'not_filed'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  filing_status text,
  federal_refund_amount numeric,
  federal_balance_due numeric
);

CREATE TABLE public.engagements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  client_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  workflow_id uuid,
  current_stage text,
  priority engagement_priority DEFAULT 'Medium'::engagement_priority,
  review_status review_status DEFAULT 'Pending'::review_status,
  assigned_staff_id uuid,
  reviewer_id uuid,
  compliance_officer_id uuid,
  owner_workspace_id uuid,
  shared_status text,
  open_date timestamp with time zone DEFAULT now(),
  due_date timestamp with time zone,
  completed_date timestamp with time zone,
  archived_date timestamp with time zone,
  internal_reference text,
  engagement_number text,
  service_id uuid,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  status text DEFAULT 'New'::text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (((setweight(to_tsvector('english'::regconfig, COALESCE(engagement_number, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(internal_reference, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(current_stage, ''::text)), 'C'::"char"))) STORED,
  billing_rule_id uuid,
  source_engagement_share_id uuid,
  case_type text DEFAULT 'other'::text NOT NULL
);

CREATE TABLE public.feature_flags (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  module text NOT NULL,
  is_core boolean DEFAULT false NOT NULL,
  default_enabled boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.firm_connections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  parent_workspace_id uuid NOT NULL,
  child_workspace_id uuid,
  relationship_type text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  invited_by uuid,
  responded_by uuid,
  responded_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  invite_token uuid,
  invite_expires_at timestamp with time zone,
  billing_responsibility text DEFAULT 'ptin_self'::text NOT NULL,
  shares_communications_identity boolean DEFAULT true NOT NULL,
  allows_branding_override boolean DEFAULT false NOT NULL,
  notes text
);

CREATE TABLE public.firm_tax_profile (
  workspace_id uuid NOT NULL,
  ein_encrypted bytea,
  ein_last4 text,
  efin_encrypted bytea,
  efin_last4 text,
  ptin_encrypted bytea,
  ptin_last4 text,
  supported_filing_states text[] DEFAULT '{}'::text[] NOT NULL,
  regular_office_hours jsonb DEFAULT '{}'::jsonb NOT NULL,
  tax_season_hours jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  efin_hash text,
  ptin_hash text
);

CREATE TABLE public.internal_message_threads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  user_a_id uuid NOT NULL,
  user_b_id uuid NOT NULL,
  created_by uuid,
  last_message_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.internal_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  thread_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  read_at timestamp with time zone
);

CREATE TABLE public.invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  client_id uuid NOT NULL,
  engagement_id uuid,
  invoice_number text,
  status text DEFAULT 'draft'::text NOT NULL,
  issue_date date DEFAULT CURRENT_DATE NOT NULL,
  due_date date,
  line_items jsonb DEFAULT '[]'::jsonb NOT NULL,
  subtotal numeric(12,2) DEFAULT 0 NOT NULL,
  discount_amount numeric(12,2) DEFAULT 0 NOT NULL,
  tax_amount numeric(12,2) DEFAULT 0 NOT NULL,
  total_amount numeric(12,2) DEFAULT 0 NOT NULL,
  amount_paid numeric(12,2) DEFAULT 0 NOT NULL,
  notes text,
  sent_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  stripe_checkout_url text,
  payment_method text,
  expected_deposit_date date,
  overdue_flagged_at timestamp with time zone
);

CREATE TABLE public.irs_notices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  notice_type text NOT NULL,
  notice_date date NOT NULL,
  response_due_date date,
  status text DEFAULT 'open'::text NOT NULL,
  description text,
  resolution_notes text,
  resolved_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.learning_courses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  owner_workspace_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  status text DEFAULT 'draft'::text NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.learning_module_completions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  module_id uuid NOT NULL,
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  score_percent integer,
  passed boolean,
  completed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.learning_modules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  course_id uuid NOT NULL,
  module_type text NOT NULL,
  title text NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  body text,
  video_url text,
  passing_score_percent integer DEFAULT 70 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  video_storage_path text
);

CREATE TABLE public.learning_quiz_options (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  question_id uuid NOT NULL,
  option_text text NOT NULL,
  is_correct boolean DEFAULT false NOT NULL,
  display_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.learning_quiz_questions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  module_id uuid NOT NULL,
  question_text text NOT NULL,
  display_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.library_folders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  item_type text NOT NULL,
  parent_folder_id uuid,
  name text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.login_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  workspace_id uuid,
  ip_address inet,
  user_agent text,
  success boolean NOT NULL,
  failure_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.message_threads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  entity_type text DEFAULT 'client'::text NOT NULL,
  entity_id uuid NOT NULL,
  subject text,
  channel text DEFAULT 'portal'::text NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  last_message_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  external_source text,
  external_id text
);

CREATE TABLE public.messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  sender_type text DEFAULT 'staff'::text NOT NULL,
  sender_id uuid,
  body text NOT NULL,
  is_internal boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  read_at timestamp with time zone,
  external_source text,
  external_id text
);

CREATE TABLE public.network_message_threads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ero_workspace_id uuid NOT NULL,
  workspace_a_id uuid NOT NULL,
  workspace_b_id uuid NOT NULL,
  created_by uuid,
  last_message_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.network_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  thread_id uuid NOT NULL,
  sender_workspace_id uuid NOT NULL,
  sender_user_id uuid,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  read_at timestamp with time zone
);

CREATE TABLE public.notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entity_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  author_id uuid,
  body text NOT NULL,
  is_pinned boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  entity_type text DEFAULT 'client'::text NOT NULL,
  is_private boolean DEFAULT false NOT NULL,
  is_internal boolean DEFAULT true NOT NULL,
  rich_content jsonb,
  mentions jsonb,
  attachments jsonb,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, COALESCE(body, ''::text))) STORED,
  subject text,
  external_source text,
  external_id text
);

CREATE TABLE public.notification_preferences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  event_type text NOT NULL,
  channel text NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.notification_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid,
  recipient_user_id uuid,
  recipient_email citext,
  recipient_phone text,
  channel text NOT NULL,
  template_key text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
  sent_at timestamp with time zone,
  error text,
  attempts integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  event_type text,
  priority text DEFAULT 'Medium'::text,
  channels text[] DEFAULT ARRAY['In-App'::text],
  max_attempts integer DEFAULT 5 NOT NULL,
  dedupe_key text,
  entity_type text,
  entity_id uuid,
  read_at timestamp with time zone
);

CREATE TABLE public.office_locations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  is_primary boolean DEFAULT false NOT NULL,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text DEFAULT 'US'::text NOT NULL,
  phone text,
  email citext,
  timezone text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.organizer_fields (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organizer_template_id uuid NOT NULL,
  parent_field_id uuid,
  field_type text NOT NULL,
  label text NOT NULL,
  help_text text,
  display_order integer DEFAULT 0 NOT NULL,
  is_required boolean DEFAULT false NOT NULL,
  options jsonb DEFAULT '[]'::jsonb NOT NULL,
  conditional_logic jsonb DEFAULT '{}'::jsonb NOT NULL,
  validation jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  body_html text,
  client_profile_field text,
  relationship_role text,
  layout_width text DEFAULT 'full'::text NOT NULL,
  include_in_document_checklist boolean DEFAULT false NOT NULL,
  document_checklist_name text,
  document_checklist_category text
);

CREATE TABLE public.organizer_information_request_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  request_id uuid NOT NULL,
  organizer_field_id uuid NOT NULL,
  instance_index integer DEFAULT 0 NOT NULL,
  note text,
  status text DEFAULT 'pending'::text NOT NULL,
  was_answered_when_flagged boolean NOT NULL,
  proposed_value jsonb,
  decision_note text,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.organizer_information_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  organizer_response_id uuid NOT NULL,
  organizer_field_id uuid,
  created_by uuid,
  message text,
  status text DEFAULT 'active'::text NOT NULL,
  sent_via_email boolean DEFAULT false NOT NULL,
  sent_via_sms boolean DEFAULT false NOT NULL,
  shown_in_portal boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  viewed_at timestamp with time zone,
  responded_at timestamp with time zone,
  resolved_at timestamp with time zone,
  resolved_by uuid,
  due_date date,
  tags text[] DEFAULT '{}'::text[] NOT NULL
);

CREATE TABLE public.organizer_response_answers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organizer_response_id uuid NOT NULL,
  organizer_field_id uuid NOT NULL,
  value jsonb,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  instance_index integer DEFAULT 0 NOT NULL,
  review_status review_status,
  review_note text
);

CREATE TABLE public.organizer_responses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  client_id uuid NOT NULL,
  engagement_id uuid,
  organizer_template_id uuid NOT NULL,
  status text DEFAULT 'not_started'::text NOT NULL,
  submitted_at timestamp with time zone,
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  is_public_submission boolean DEFAULT false NOT NULL,
  filed_as_attachment boolean DEFAULT false NOT NULL,
  resolved_service_id uuid,
  needs_service_review boolean DEFAULT false NOT NULL,
  signature_request_id uuid,
  review_status review_status,
  review_note text,
  assigned_reviewer_id uuid
);

CREATE TABLE public.organizer_service_routes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  organizer_template_id uuid NOT NULL,
  routing_field_id uuid NOT NULL,
  answer_value text NOT NULL,
  service_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.organizer_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  status text DEFAULT 'published'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  public_token uuid DEFAULT gen_random_uuid() NOT NULL,
  is_public boolean DEFAULT false NOT NULL,
  requires_portal_signup boolean DEFAULT false NOT NULL,
  banner_image_url text,
  folder_id uuid
);

CREATE TABLE public.payment_methods (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  client_id uuid NOT NULL,
  type text NOT NULL,
  brand text,
  last4 text,
  exp_month smallint,
  exp_year smallint,
  is_default boolean DEFAULT false NOT NULL,
  external_reference text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.payment_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  installment_number integer NOT NULL,
  amount numeric(12,2) NOT NULL,
  due_date date NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  stripe_checkout_url text,
  paid_payment_id uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  client_id uuid NOT NULL,
  invoice_id uuid,
  payment_method_id uuid,
  amount numeric(12,2) NOT NULL,
  currency text DEFAULT 'usd'::text NOT NULL,
  status text DEFAULT 'succeeded'::text NOT NULL,
  payment_date timestamp with time zone DEFAULT now() NOT NULL,
  reference text,
  notes text,
  recorded_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  payment_method text
);

CREATE TABLE public.pending_engagement_letter_sends (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  client_id uuid NOT NULL,
  engagement_letter_template_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  processed_at timestamp with time zone,
  additional_signer_relationship_type text
);

CREATE TABLE public.pending_portal_invites (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  client_id uuid NOT NULL,
  client_portal_user_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  processed_at timestamp with time zone
);

CREATE TABLE public.permissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.pipeline_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  process_id uuid NOT NULL,
  status workflow_run_status DEFAULT 'Active'::workflow_run_status NOT NULL,
  current_stage_id uuid,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  paused_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.pipeline_stages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  pipeline_run_id uuid NOT NULL,
  entity_type text NOT NULL,
  process_stage_id uuid NOT NULL,
  stage_name text NOT NULL,
  display_order integer NOT NULL,
  status workflow_stage_status DEFAULT 'Pending'::workflow_stage_status NOT NULL,
  assigned_staff_id uuid,
  reviewer_id uuid,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  due_date timestamp with time zone,
  estimated_duration interval,
  actual_duration interval,
  sla_status text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.platform_subscription_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  base_price_cents integer NOT NULL,
  included_seats integer DEFAULT 1 NOT NULL,
  per_seat_price_cents integer DEFAULT 0 NOT NULL,
  email_overage_rate_cents integer DEFAULT 0 NOT NULL,
  storage_overage_rate_cents integer DEFAULT 0 NOT NULL,
  sms_overage_rate_cents integer DEFAULT 0 NOT NULL,
  currency text DEFAULT 'usd'::text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  stripe_product_id text,
  stripe_price_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  signup_free_emails integer DEFAULT 0 NOT NULL,
  signup_free_sms integer DEFAULT 0 NOT NULL,
  signup_free_storage_gb numeric DEFAULT 0 NOT NULL
);

CREATE TABLE public.platform_system_credentials (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  system_name text NOT NULL,
  username text,
  secret_encrypted bytea NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.pricing_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  pricing_method text NOT NULL,
  base_amount numeric(12,2),
  hourly_rate numeric(12,2),
  form_based_rates jsonb DEFAULT '{}'::jsonb NOT NULL,
  complexity_tiers jsonb DEFAULT '[]'::jsonb NOT NULL,
  discount_rules jsonb DEFAULT '{}'::jsonb NOT NULL,
  minimum_amount numeric(12,2),
  maximum_amount numeric(12,2),
  allow_override boolean DEFAULT true NOT NULL,
  status text DEFAULT 'published'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.process_stages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  process_id uuid NOT NULL,
  name text NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  reviewer_role_id uuid,
  completion_rule text DEFAULT 'all_tasks_complete'::text NOT NULL,
  due_date_rule jsonb DEFAULT '{}'::jsonb NOT NULL,
  entry_conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
  notify_on_entry jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  expected_duration interval,
  warning_threshold interval,
  critical_threshold interval
);

CREATE TABLE public.process_tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  process_stage_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  display_order integer DEFAULT 0 NOT NULL,
  assignee_role_id uuid,
  is_required boolean DEFAULT true NOT NULL,
  due_date_rule jsonb DEFAULT '{}'::jsonb NOT NULL,
  automation_trigger jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.processes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  status text DEFAULT 'published'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  folder_id uuid
);

CREATE TABLE public.provider_status (
  provider text NOT NULL,
  is_configured boolean DEFAULT false NOT NULL,
  status text DEFAULT 'unknown'::text NOT NULL,
  consecutive_failures integer DEFAULT 0 NOT NULL,
  last_check_at timestamp with time zone,
  last_success_at timestamp with time zone,
  last_failure_at timestamp with time zone,
  last_error text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.quotes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  client_id uuid NOT NULL,
  engagement_id uuid,
  quote_number text,
  title text NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  line_items jsonb DEFAULT '[]'::jsonb NOT NULL,
  subtotal numeric(12,2) DEFAULT 0 NOT NULL,
  discount_amount numeric(12,2) DEFAULT 0 NOT NULL,
  tax_amount numeric(12,2) DEFAULT 0 NOT NULL,
  total_amount numeric(12,2) DEFAULT 0 NOT NULL,
  valid_until date,
  sent_at timestamp with time zone,
  accepted_at timestamp with time zone,
  declined_at timestamp with time zone,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  service_id uuid
);

CREATE TABLE public.rate_limit_hits (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  rate_key text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.recurring_billing (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  client_id uuid NOT NULL,
  engagement_id uuid,
  frequency text NOT NULL,
  amount numeric(12,2) NOT NULL,
  next_billing_date date NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  payment_method_id uuid,
  description text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.role_permission_overrides (
  role_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  permission_id uuid NOT NULL,
  granted boolean NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.role_permissions (
  role_id uuid NOT NULL,
  permission_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  is_system_role boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.service_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.services (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid,
  service_category_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  estimated_duration_minutes integer,
  default_price numeric(12,2),
  pricing_rule_id uuid,
  billing_rule_id uuid,
  process_id uuid,
  organizer_template_id uuid,
  document_request_template_id uuid,
  is_bookable boolean DEFAULT false NOT NULL,
  is_portal_visible boolean DEFAULT true NOT NULL,
  requires_organizer boolean DEFAULT false NOT NULL,
  requires_engagement_letter boolean DEFAULT false NOT NULL,
  requires_documents boolean DEFAULT false NOT NULL,
  requires_signature boolean DEFAULT false NOT NULL,
  requires_review boolean DEFAULT false NOT NULL,
  requires_invoice boolean DEFAULT true NOT NULL,
  requires_payment_before_release boolean DEFAULT false NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  tags text[] DEFAULT '{}'::text[] NOT NULL,
  status text DEFAULT 'published'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  document_folder_template_id uuid,
  cloned_from_service_id uuid,
  engagement_letter_template_id uuid
);

CREATE TABLE public.signature_request_signers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  signature_request_id uuid NOT NULL,
  signer_name text NOT NULL,
  signer_email text,
  sign_order integer DEFAULT 1 NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  signature_type text,
  signature_image_path text,
  typed_name text,
  signed_at timestamp with time zone,
  declined_at timestamp with time zone,
  decline_reason text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  access_token uuid DEFAULT gen_random_uuid() NOT NULL,
  resolved_document_html text,
  attested_by uuid,
  attested_at timestamp with time zone
);

CREATE TABLE public.signature_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  attachment_id uuid,
  title text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  due_date date,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  engagement_letter_template_id uuid,
  organizer_template_id uuid
);

CREATE TABLE public.site_funnels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  website_id uuid NOT NULL
);

CREATE TABLE public.site_page_sections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  page_id uuid NOT NULL,
  section_type text NOT NULL,
  display_order integer NOT NULL,
  config jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.site_pages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  funnel_id uuid,
  funnel_position integer,
  title text NOT NULL,
  slug text NOT NULL,
  meta_description text,
  status text DEFAULT 'draft'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  website_id uuid NOT NULL,
  background_color text,
  custom_css text,
  custom_js text,
  schema_markup text
);

CREATE TABLE public.site_websites (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  favicon_url text,
  head_tracking_code text,
  body_tracking_code text,
  status text DEFAULT 'draft'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  folder_id uuid,
  custom_domain text,
  domain_verified boolean DEFAULT false NOT NULL,
  domain_verified_at timestamp with time zone,
  header_background text
);

CREATE TABLE public.sms_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  message_id uuid,
  template_key text,
  recipient_phone text NOT NULL,
  body text NOT NULL,
  status text DEFAULT 'queued'::text NOT NULL,
  provider_reference text,
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  delivered_at timestamp with time zone,
  failed_reason text,
  notification_queue_id uuid
);

CREATE TABLE public.sms_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  body text DEFAULT ''::text NOT NULL,
  merge_fields jsonb DEFAULT '[]'::jsonb NOT NULL,
  schedule_rule jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'published'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  folder_id uuid
);

CREATE TABLE public.system_failure_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source text NOT NULL,
  workspace_id uuid,
  message text NOT NULL,
  context jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  notified_at timestamp with time zone
);

CREATE TABLE public.system_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  key text NOT NULL,
  value jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.task_dependencies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  task_id uuid NOT NULL,
  depends_on_task_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workflow_stage_id uuid,
  engagement_id uuid,
  title text NOT NULL,
  description text,
  status text DEFAULT 'pending'::text NOT NULL,
  assigned_staff_id uuid,
  due_date timestamp with time zone,
  completed_at timestamp with time zone,
  priority text DEFAULT 'medium'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  workspace_id uuid NOT NULL,
  overdue_flagged_at timestamp with time zone,
  client_id uuid,
  external_source text,
  external_id text,
  visibility text DEFAULT 'internal'::text NOT NULL
);

CREATE TABLE public.tax_years (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  year integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.trusted_devices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  device_fingerprint text NOT NULL,
  device_name text,
  last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  trusted_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone
);

CREATE TABLE public.user_calendar_connections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  status text DEFAULT 'disconnected'::text NOT NULL,
  external_account_email text,
  calendar_id text DEFAULT 'primary'::text NOT NULL,
  access_token_encrypted bytea,
  refresh_token_encrypted bytea,
  token_expires_at timestamp with time zone,
  refresh_token_rotated_at timestamp with time zone,
  connected_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_profiles (
  id uuid NOT NULL,
  first_name text,
  last_name text,
  display_name text,
  phone text,
  avatar_url text,
  default_workspace_id uuid,
  is_platform_admin boolean DEFAULT false NOT NULL,
  last_seen_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  failed_login_count integer DEFAULT 0 NOT NULL,
  locked_until timestamp with time zone,
  mfa_enabled boolean DEFAULT false NOT NULL,
  mfa_enrolled_at timestamp with time zone,
  seen_onboarding_steps text[] DEFAULT '{}'::text[] NOT NULL,
  ptin_encrypted bytea,
  ptin_last4 text,
  ptin_hash text,
  is_platform_it boolean DEFAULT false NOT NULL,
  is_platform_ai_operator boolean DEFAULT false NOT NULL
);

CREATE TABLE public.user_widget_preferences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  dashboard_widget_id uuid NOT NULL,
  is_visible boolean,
  display_order integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_zoom_connections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  zoom_user_id text NOT NULL,
  zoom_email text,
  access_token_encrypted bytea,
  refresh_token_encrypted bytea,
  token_expires_at timestamp with time zone,
  refresh_token_rotated_at timestamp with time zone,
  status text DEFAULT 'connected'::text NOT NULL,
  connected_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.webhook_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider text NOT NULL,
  event_type text NOT NULL,
  external_id text,
  workspace_id uuid,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'received'::text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  last_error text,
  received_at timestamp with time zone DEFAULT now() NOT NULL,
  processed_at timestamp with time zone
);

CREATE TABLE public.workspace_billing_charge_attempts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  period_end timestamp with time zone NOT NULL,
  attempted_at timestamp with time zone DEFAULT now() NOT NULL,
  amount_cents integer NOT NULL,
  stripe_payment_intent_id text,
  status text NOT NULL,
  failure_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workspace_email_domains (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  domain text NOT NULL,
  resend_domain_id text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  dns_records jsonb DEFAULT '[]'::jsonb NOT NULL,
  from_local_part text DEFAULT 'notifications'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  verified_at timestamp with time zone
);

CREATE TABLE public.workspace_feature_flags (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  feature_flag_id uuid NOT NULL,
  is_enabled boolean DEFAULT false NOT NULL,
  config jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workspace_ghl_connections (
  workspace_id uuid NOT NULL,
  api_key_encrypted bytea NOT NULL,
  location_id text NOT NULL,
  connected_by uuid,
  connected_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workspace_invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  email text NOT NULL,
  role_id uuid NOT NULL,
  token uuid DEFAULT gen_random_uuid() NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  invited_by uuid,
  accepted_by uuid,
  accepted_at timestamp with time zone,
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workspace_jotform_connections (
  workspace_id uuid NOT NULL,
  api_key_encrypted bytea NOT NULL,
  connected_by uuid,
  connected_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workspace_retention_policies (
  workspace_id uuid NOT NULL,
  documents_retention_days integer,
  messages_retention_days integer,
  audit_logs_retention_days integer,
  archived_clients_retention_days integer,
  archived_engagements_retention_days integer,
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workspace_security_policies (
  workspace_id uuid NOT NULL,
  password_min_length integer DEFAULT 12 NOT NULL,
  password_require_uppercase boolean DEFAULT true NOT NULL,
  password_require_number boolean DEFAULT true NOT NULL,
  password_require_symbol boolean DEFAULT false NOT NULL,
  password_expiry_days integer,
  session_timeout_minutes integer DEFAULT 15 NOT NULL,
  max_failed_login_attempts integer DEFAULT 5 NOT NULL,
  lockout_duration_minutes integer DEFAULT 15 NOT NULL,
  mfa_required boolean DEFAULT false NOT NULL,
  mfa_required_for_roles text[] DEFAULT '{}'::text[] NOT NULL,
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workspace_subscription_invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  stripe_invoice_id text NOT NULL,
  amount_due integer NOT NULL,
  amount_paid integer DEFAULT 0 NOT NULL,
  status text NOT NULL,
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  paid_at timestamp with time zone,
  hosted_invoice_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workspace_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_status text DEFAULT 'incomplete'::text NOT NULL,
  seat_count integer DEFAULT 1 NOT NULL,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  trial_end timestamp with time zone,
  card_funding_type text,
  locked_plan_snapshot jsonb,
  price_change_notice_sent_at timestamp with time zone,
  price_change_effective_date date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  cancel_at_period_end boolean DEFAULT false NOT NULL,
  default_payment_method_id text,
  card_brand text,
  card_last4 text,
  card_exp_month integer,
  card_exp_year integer
);

CREATE TABLE public.workspace_tags (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workspace_usage_meters (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  resource_type text NOT NULL,
  free_units_granted numeric DEFAULT 0 NOT NULL,
  granted_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  free_units_consumed numeric DEFAULT 0 NOT NULL,
  prepaid_balance numeric DEFAULT 0 NOT NULL
);

CREATE TABLE public.workspace_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  is_owner boolean DEFAULT false NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  invited_by uuid,
  invited_at timestamp with time zone,
  joined_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workspaces (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  workspace_type text DEFAULT 'independent_ptin'::text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  timezone text DEFAULT 'America/New_York'::text NOT NULL,
  primary_contact_email citext,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  phone text,
  website text,
  mailing_address text,
  stripe_connected_account_id text,
  stripe_connect_account_type text,
  stripe_charges_enabled boolean DEFAULT false NOT NULL,
  stripe_payouts_enabled boolean DEFAULT false NOT NULL,
  stripe_details_submitted boolean DEFAULT false NOT NULL,
  stripe_connect_status text DEFAULT 'not_connected'::text NOT NULL,
  stripe_connect_updated_at timestamp with time zone,
  suspension_reason text,
  onboarding_dismissed_at timestamp with time zone,
  default_relationship_manager_id uuid,
  default_reviewer_id uuid,
  default_compliance_officer_id uuid,
  allow_connected_ptin_messaging boolean DEFAULT false NOT NULL,
  is_platform_home boolean DEFAULT false NOT NULL,
  is_demo boolean DEFAULT false NOT NULL,
  client_assignment_mode text DEFAULT 'owner'::text NOT NULL,
  client_assignment_staff_pool uuid[] DEFAULT '{}'::uuid[] NOT NULL
);

-- =============================================================================
-- 4. FUNCTIONS / PROCEDURES
-- =============================================================================

CREATE OR REPLACE FUNCTION public._decide_client_field_change(p_workspace_id uuid, p_client_id uuid, p_target_table text, p_target_column text, p_client_address_id uuid, p_current_value text, p_new_value text, p_source text, p_organizer_response_id uuid, p_organizer_field_id uuid, p_batch_id uuid, p_portal_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_new_value is null or btrim(p_new_value) = '' then
    return 'skipped';
  end if;
  if p_current_value is not distinct from p_new_value then
    return 'skipped';
  end if;
  if p_current_value is null or btrim(p_current_value) = '' then
    return 'applied';
  end if;

  insert into public.client_pending_changes (
    workspace_id, client_id, source, organizer_response_id, organizer_field_id,
    target_table, target_column, client_address_id, batch_id, old_value, new_value, submitted_by_portal_user_id
  ) values (
    p_workspace_id, p_client_id, p_source, p_organizer_response_id, p_organizer_field_id,
    p_target_table, p_target_column, p_client_address_id, p_batch_id, p_current_value, p_new_value, p_portal_user_id
  )
  on conflict (client_id, target_table, target_column, coalesce(client_address_id, '00000000-0000-0000-0000-000000000000'))
    where status = 'pending'
    do update set new_value = excluded.new_value, old_value = excluded.old_value, batch_id = excluded.batch_id, created_at = now();

  return 'queued';
end;
$function$
;

CREATE OR REPLACE FUNCTION public._evaluate_condition_list(p_conditions jsonb, p_context jsonb, p_workspace_id uuid, p_client_id uuid, p_engagement_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_cond jsonb;
  v_field text;
  v_op text;
  v_join text;
  v_expected text;
  v_actual text;
  v_client record;
  v_engagement record;
  v_interest record;
  v_portal record;
  v_quote record;
  v_task record;
  v_doc_request record;
  v_process_id uuid;
  v_process_stage_id uuid;
  v_lead_process_stage_id uuid;
  v_org_template_id_raw text;
  v_org_template_id uuid;
  v_org_expected_status text;
  v_org_actual_status text;
  v_match boolean;
  v_result boolean;
  v_index int := 0;
begin
  if p_conditions is null or jsonb_array_length(p_conditions) = 0 then
    return true;
  end if;

  select * into v_client from public.clients where id = p_client_id;
  select * into v_interest from public.client_service_interests where client_id = p_client_id order by created_at desc limit 1;
  select * into v_portal from public.client_portal_users where client_id = p_client_id order by invited_at desc limit 1;
  select * into v_engagement from public.engagements where id = p_engagement_id;
  select pr.process_id, ps.process_stage_id into v_process_id, v_process_stage_id
  from public.pipeline_runs pr
  join public.pipeline_stages ps on ps.id = pr.current_stage_id
  where pr.entity_type = 'engagement' and pr.entity_id = p_engagement_id and pr.status = 'Active'
  order by pr.started_at desc limit 1;
  select ps.process_stage_id into v_lead_process_stage_id
  from public.pipeline_runs pr
  join public.pipeline_stages ps on ps.id = pr.current_stage_id
  where pr.entity_type = 'client' and pr.entity_id = p_client_id and pr.status = 'Active'
  order by pr.started_at desc limit 1;
  select * into v_quote from public.quotes
  where (p_engagement_id is not null and engagement_id = p_engagement_id)
     or (p_client_id is not null and client_id = p_client_id)
  order by created_at desc limit 1;
  select * into v_task from public.tasks where id = nullif(p_context->>'task_id', '')::uuid;
  select * into v_doc_request from public.document_requests where id = nullif(p_context->>'document_request_id', '')::uuid;

  for v_cond in select * from jsonb_array_elements(p_conditions)
  loop
    v_index := v_index + 1;
    v_field := v_cond->>'field';
    v_op := coalesce(v_cond->>'op', 'eq');
    v_join := coalesce(v_cond->>'join', 'and');
    v_expected := v_cond->>'value';

    if v_field = 'client.tags' then
      v_match := v_expected = any(coalesce(v_client.tags, '{}'::text[]));
      if v_op = 'neq' then
        v_match := not v_match;
      end if;
    elsif v_field = 'document_request.all_required_complete' then
      v_match := (coalesce(v_expected, 'true') = 'true') = not exists (
        select 1 from public.document_request_item_statuses
        where document_request_id = coalesce((p_context->>'document_request_id')::uuid, v_doc_request.id)
          and is_required = true and status = 'pending'
      );
    elsif v_field = 'client.organizer_status' then
      v_org_template_id_raw := split_part(coalesce(v_expected, ''), '|', 1);
      v_org_expected_status := split_part(coalesce(v_expected, ''), '|', 2);
      v_org_template_id := case
        when v_org_template_id_raw = 'current_run' then nullif(p_context->>'last_organizer_template_id', '')::uuid
        when v_org_template_id_raw = 'client_service' then (
          select ot.id
          from public.services s
          join public.organizer_templates svc_ot on svc_ot.id = s.organizer_template_id
          join public.organizer_templates ot on ot.slug = svc_ot.slug and ot.workspace_id = p_workspace_id
          where s.id = coalesce(nullif(p_context->>'service_id', '')::uuid, v_interest.service_id)
          limit 1
        )
        else nullif(v_org_template_id_raw, '')::uuid
      end;
      select status into v_org_actual_status
      from public.organizer_responses
      where client_id = p_client_id and organizer_template_id = v_org_template_id
      order by created_at desc limit 1;
      v_org_actual_status := coalesce(v_org_actual_status, 'not_sent');
      if v_op = 'neq' then
        v_match := v_org_actual_status is distinct from v_org_expected_status;
      else
        v_match := v_org_actual_status is not distinct from v_org_expected_status;
      end if;
    else
      v_actual := case v_field
        when 'client.lifecycle_status' then v_client.lifecycle_status
        when 'client.client_type' then v_client.client_type
        when 'client.relationship_manager_id' then v_client.relationship_manager_id::text
        when 'client.service_category_id' then v_interest.service_category_id::text
        when 'client.service_id' then v_interest.service_id::text
        when 'client.source' then v_interest.source
        when 'client.portal_status' then coalesce(v_portal.status, 'not_sent')
        when 'lead.process_stage_id' then v_lead_process_stage_id::text
        when 'engagement.status' then v_engagement.status
        when 'engagement.priority' then v_engagement.priority::text
        when 'engagement.case_type' then v_engagement.case_type
        when 'engagement.service_id' then v_engagement.service_id::text
        when 'engagement.assigned_staff_id' then v_engagement.assigned_staff_id::text
        when 'engagement.reviewer_id' then v_engagement.reviewer_id::text
        when 'engagement.process_id' then v_process_id::text
        when 'engagement.process_stage_id' then v_process_stage_id::text
        when 'engagement.engagement_letter_status' then coalesce(
          nullif((
            select sr.status
            from public.signature_requests sr
            join public.attachments a on a.id = sr.attachment_id
            where a.entity_type = 'engagement' and a.entity_id = p_engagement_id
            order by sr.created_at desc
            limit 1
          ), 'cancelled'),
          'not_sent'
        )
        when 'quote.status' then v_quote.status
        when 'quote.total_amount' then v_quote.total_amount::text
        when 'task.status' then v_task.status
        when 'task.assigned_staff_id' then v_task.assigned_staff_id::text
        when 'task.overdue' then (v_task.due_date is not null and v_task.due_date < now() and v_task.status <> 'completed')::text
        when 'document_request.status' then v_doc_request.status
        else p_context ->> v_field
      end;

      if v_op = 'eq' then
        v_match := v_actual is not distinct from v_expected;
      elsif v_op = 'neq' then
        v_match := v_actual is distinct from v_expected;
      elsif v_op = 'in' then
        v_match := v_actual = any(string_to_array(coalesce(v_expected, ''), ','));
      elsif v_op = 'not_in' then
        v_match := v_actual is not null and not (v_actual = any(string_to_array(coalesce(v_expected, ''), ',')));
      elsif v_op = 'gt' then
        v_match := v_actual is not null and v_expected is not null and v_actual::numeric > v_expected::numeric;
      elsif v_op = 'gte' then
        v_match := v_actual is not null and v_expected is not null and v_actual::numeric >= v_expected::numeric;
      elsif v_op = 'lt' then
        v_match := v_actual is not null and v_expected is not null and v_actual::numeric < v_expected::numeric;
      elsif v_op = 'lte' then
        v_match := v_actual is not null and v_expected is not null and v_actual::numeric <= v_expected::numeric;
      elsif v_op = 'is_null' then
        v_match := v_actual is null;
      elsif v_op = 'is_not_null' then
        v_match := v_actual is not null;
      else
        v_match := true;
      end if;
    end if;

    if v_index = 1 then
      v_result := v_match;
    elsif v_join = 'or' then
      v_result := v_result or v_match;
    else
      v_result := v_result and v_match;
    end if;
  end loop;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._notify_admins_of_new_public_lead(p_workspace_id uuid, p_client_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_recipient record;
begin
  for v_recipient in
    select wu.user_id from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = p_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    perform public.create_notification(
      p_workspace_id, v_recipient.user_id, 'PUBLIC_LEAD_CREATED',
      'public_lead_created', jsonb_build_object('client_id', p_client_id),
      array['In-App'::text], 'Medium', 'client', p_client_id
    );
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._notify_admins_of_organizer_submitted(p_workspace_id uuid, p_client_id uuid, p_response_id uuid, p_organizer_template_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_recipient record;
  v_template_name text;
  v_client_name text;
begin
  select name into v_template_name from public.organizer_templates where id = p_organizer_template_id;

  select case when client_type = 'business' and business_name is not null then business_name
              else btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
         end
  into v_client_name
  from public.clients where id = p_client_id;

  for v_recipient in
    select wu.user_id from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = p_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    if public.is_notification_enabled(v_recipient.user_id, p_workspace_id, 'ORGANIZER_SUBMITTED', 'In-App') then
      perform public.create_notification(
        p_workspace_id, v_recipient.user_id, 'ORGANIZER_SUBMITTED',
        'organizer_submitted',
        jsonb_build_object('client_id', p_client_id, 'client_name', v_client_name, 'response_id', p_response_id, 'organizer_template_name', v_template_name),
        array['In-App'::text], 'Medium', 'client', p_client_id
      );
    end if;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._notify_admins_of_pending_client_change(p_workspace_id uuid, p_client_id uuid, p_batch_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_recipient record;
begin
  for v_recipient in
    select wu.user_id from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = p_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    perform public.create_notification(
      p_workspace_id, v_recipient.user_id, 'CLIENT_PENDING_CHANGE_CREATED',
      'client_pending_change_created', jsonb_build_object('client_id', p_client_id, 'batch_id', p_batch_id),
      array['In-App'::text], 'Medium', 'client', p_client_id
    );
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._notify_admins_of_quote_response(p_workspace_id uuid, p_client_id uuid, p_quote_id uuid, p_response text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_recipient record;
begin
  for v_recipient in
    select wu.user_id from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = p_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    perform public.create_notification(
      p_workspace_id, v_recipient.user_id,
      case when p_response = 'accepted' then 'QUOTE_ACCEPTED' else 'QUOTE_DECLINED' end,
      case when p_response = 'accepted' then 'quote_accepted' else 'quote_declined' end,
      jsonb_build_object('client_id', p_client_id, 'quote_id', p_quote_id),
      array['In-App'::text], 'Medium', 'quote', p_quote_id
    );
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._organizer_name_text(p_value jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_raw text := public._organizer_scalar_text(p_value);
  v_obj jsonb;
begin
  if v_raw is null or btrim(v_raw) = '' then
    return null;
  end if;
  begin
    v_obj := v_raw::jsonb;
  exception when others then
    return v_raw;
  end;
  if jsonb_typeof(v_obj) = 'object' then
    return nullif(btrim(concat_ws(' ', v_obj->>'first', nullif(v_obj->>'middle', ''), v_obj->>'last', nullif(v_obj->>'suffix', ''))), '');
  end if;
  return v_raw;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._organizer_scalar_text(p_value jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_value is null then null
    when jsonb_typeof(p_value) = 'string' then p_value #>> '{}'
    else p_value::text
  end;
$function$
;

CREATE OR REPLACE FUNCTION public._propose_client_field_from_organizer_answer(p_workspace_id uuid, p_client_id uuid, p_organizer_response_id uuid, p_organizer_field_id uuid, p_client_profile_field text, p_value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_source text := 'organizer';
  v_batch uuid := gen_random_uuid();
  v_decision text;
  v_any_queued boolean := false;
  v_obj jsonb;
  v_text text;
  v_date date;
  v_address_id uuid;
  v_cur_street text;
  v_cur_city text;
  v_cur_state text;
  v_cur_zip text;
  v_cur_first text;
  v_cur_middle text;
  v_cur_last text;
  v_cur_suffix text;
  v_current text;
  v_stored_value text;
  v_last4 text;
  v_old_last4 text;
begin
  if p_value is null then
    return;
  end if;

  if p_client_profile_field = 'full_name' then
    v_obj := p_value;
    if jsonb_typeof(v_obj) = 'string' then
      begin
        v_obj := (v_obj #>> '{}')::jsonb;
      exception when others then
        v_obj := jsonb_build_object('first', p_value #>> '{}');
      end;
    end if;
    if jsonb_typeof(v_obj) <> 'object' then
      return;
    end if;

    select first_name, middle_name, last_name, suffix into v_cur_first, v_cur_middle, v_cur_last, v_cur_suffix
    from public.clients where id = p_client_id;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'clients', 'first_name', null, v_cur_first, v_obj->>'first', v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then update public.clients set first_name = v_obj->>'first', updated_at = now() where id = p_client_id; end if;
    if v_decision = 'queued' then v_any_queued := true; end if;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'clients', 'middle_name', null, v_cur_middle, v_obj->>'middle', v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then update public.clients set middle_name = v_obj->>'middle', updated_at = now() where id = p_client_id; end if;
    if v_decision = 'queued' then v_any_queued := true; end if;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'clients', 'last_name', null, v_cur_last, v_obj->>'last', v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then update public.clients set last_name = v_obj->>'last', updated_at = now() where id = p_client_id; end if;
    if v_decision = 'queued' then v_any_queued := true; end if;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'clients', 'suffix', null, v_cur_suffix, v_obj->>'suffix', v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then update public.clients set suffix = v_obj->>'suffix', updated_at = now() where id = p_client_id; end if;
    if v_decision = 'queued' then v_any_queued := true; end if;

    if v_any_queued then
      perform public._notify_admins_of_pending_client_change(p_workspace_id, p_client_id, v_batch);
    end if;

  elsif p_client_profile_field = 'mailing_address' then
    v_obj := p_value;
    if jsonb_typeof(v_obj) = 'string' then
      begin
        v_obj := (v_obj #>> '{}')::jsonb;
      exception when others then
        v_obj := null;
      end;
    end if;
    if v_obj is null or jsonb_typeof(v_obj) <> 'object' then
      return;
    end if;

    select id, street, city, state, zip into v_address_id, v_cur_street, v_cur_city, v_cur_state, v_cur_zip
    from public.client_addresses
    where client_id = p_client_id and address_type = 'mailing'
    order by is_primary desc, created_at asc
    limit 1;

    if v_address_id is null then
      insert into public.client_addresses (client_id, workspace_id, address_type, is_primary, display_order)
      values (p_client_id, p_workspace_id, 'mailing', true, 0)
      returning id into v_address_id;
      v_cur_street := null;
      v_cur_city := null;
      v_cur_state := null;
      v_cur_zip := null;
    end if;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'client_addresses', 'street', v_address_id, v_cur_street, v_obj->>'street', v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then update public.client_addresses set street = v_obj->>'street', updated_at = now() where id = v_address_id; end if;
    if v_decision = 'queued' then v_any_queued := true; end if;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'client_addresses', 'city', v_address_id, v_cur_city, v_obj->>'city', v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then update public.client_addresses set city = v_obj->>'city', updated_at = now() where id = v_address_id; end if;
    if v_decision = 'queued' then v_any_queued := true; end if;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'client_addresses', 'state', v_address_id, v_cur_state, v_obj->>'state', v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then update public.client_addresses set state = v_obj->>'state', updated_at = now() where id = v_address_id; end if;
    if v_decision = 'queued' then v_any_queued := true; end if;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'client_addresses', 'zip', v_address_id, v_cur_zip, v_obj->>'zip', v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then update public.client_addresses set zip = v_obj->>'zip', updated_at = now() where id = v_address_id; end if;
    if v_decision = 'queued' then v_any_queued := true; end if;

    if v_any_queued then
      perform public._notify_admins_of_pending_client_change(p_workspace_id, p_client_id, v_batch);
    end if;

  elsif p_client_profile_field = 'date_of_birth' then
    v_text := coalesce(p_value #>> '{}', '');
    if btrim(v_text) = '' then
      return;
    end if;
    begin
      v_date := v_text::date;
    exception when others then
      return;
    end;

    select date_of_birth::text into v_current from public.clients where id = p_client_id;

    v_decision := public._decide_client_field_change(p_workspace_id, p_client_id, 'clients', 'date_of_birth', null, v_current, v_date::text, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null);
    if v_decision = 'applied' then
      perform set_config('app.bypass_sensitive_field_guard', 'on', true);
      update public.clients set date_of_birth = v_date, updated_at = now() where id = p_client_id;
    elsif v_decision = 'queued' then
      perform public._notify_admins_of_pending_client_change(p_workspace_id, p_client_id, v_batch);
    end if;

  elsif p_client_profile_field = 'ssn' then
    v_text := coalesce(p_value #>> '{}', '');
    if btrim(v_text) = '' then
      return;
    end if;

    v_stored_value := encode(public.encrypt_client_secret(v_text), 'base64');
    v_last4 := nullif(right(regexp_replace(v_text, '\D', '', 'g'), 4), '');
    select ssn_last4 into v_old_last4 from public.clients where id = p_client_id;

    insert into public.client_pending_changes (
      workspace_id, client_id, source, organizer_response_id, organizer_field_id,
      target_table, target_column, old_value, new_value, new_value_last4, batch_id, submitted_by_portal_user_id
    ) values (
      p_workspace_id, p_client_id, v_source, p_organizer_response_id, p_organizer_field_id,
      'clients', 'ssn', v_old_last4, v_stored_value, v_last4, v_batch, null
    )
    on conflict (client_id, target_table, target_column, coalesce(client_address_id, '00000000-0000-0000-0000-000000000000'))
      where status = 'pending'
      do update set new_value = excluded.new_value, new_value_last4 = excluded.new_value_last4, old_value = excluded.old_value, batch_id = excluded.batch_id, created_at = now();

    perform public._notify_admins_of_pending_client_change(p_workspace_id, p_client_id, v_batch);

  elsif p_client_profile_field in ('first_name', 'last_name', 'business_name', 'primary_email', 'primary_phone') then
    v_text := p_value #>> '{}';
    if v_text is null or btrim(v_text) = '' then
      return;
    end if;

    execute format('select %I from public.clients where id = $1', p_client_profile_field) into v_current using p_client_id;

    v_decision := public._decide_client_field_change(
      p_workspace_id, p_client_id, 'clients', p_client_profile_field, null, v_current, v_text,
      v_source, p_organizer_response_id, p_organizer_field_id, v_batch, null
    );

    if v_decision = 'applied' then
      execute format('update public.clients set %I = $1, updated_at = now() where id = $2', p_client_profile_field) using v_text, p_client_id;
    elsif v_decision = 'queued' then
      perform public._notify_admins_of_pending_client_change(p_workspace_id, p_client_id, v_batch);
    end if;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_config_object_share(p_share_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_share record;
  v_new_id uuid;
begin
  select * into v_share from public.config_object_shares where id = p_share_id;
  if v_share.id is null then
    raise exception 'share not found';
  end if;
  if not public.is_workspace_admin(v_share.shared_with_workspace_id) then
    raise exception 'insufficient permissions to accept this share';
  end if;
  if v_share.status <> 'pending' then
    raise exception 'this share is no longer pending';
  end if;

  v_new_id := public.duplicate_config_object(v_share.object_type, v_share.object_id, v_share.shared_with_workspace_id, null);

  update public.config_object_shares
  set status = 'accepted', accepted_object_id = v_new_id, responded_by = auth.uid(), responded_at = now()
  where id = p_share_id;

  return v_new_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_firm_connection_billing(p_connection_id uuid)
 RETURNS firm_connections
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.firm_connections;
begin
  select * into v_row from public.firm_connections where id = p_connection_id for update;
  if v_row.id is null then
    raise exception 'connection not found';
  end if;
  if not public.is_workspace_admin(v_row.parent_workspace_id) then
    raise exception 'Only the ERO can accept billing for this connection.';
  end if;
  if v_row.status <> 'active' then
    raise exception 'Only an active connection can have its billing accepted.';
  end if;
  if v_row.billing_responsibility = 'ero' then
    return v_row;
  end if;

  if not exists (select 1 from public.workspace_subscriptions where workspace_id = v_row.parent_workspace_id) then
    raise exception 'This ERO has no active subscription to bill the seat against.';
  end if;

  update public.firm_connections set billing_responsibility = 'ero', updated_at = now() where id = p_connection_id returning * into v_row;
  update public.workspace_subscriptions set seat_count = coalesce(seat_count, 0) + 1, updated_at = now() where workspace_id = v_row.parent_workspace_id;

  if v_row.responded_by is not null then
    perform public.create_notification(
      v_row.child_workspace_id, v_row.responded_by, 'FIRM_CONNECTION_BILLING_ACCEPTED',
      'firm_connection_billing_accepted', jsonb_build_object('firm_connection_id', p_connection_id),
      array['In-App'::text], 'Medium', 'firm_connection', p_connection_id
    );
  end if;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_firm_connection_invite(p_token uuid, p_name text, p_workspace_type text DEFAULT 'independent_ptin'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'accept_firm_connection_invite requires an authenticated user';
  end if;

  if not exists (
    select 1 from public.firm_connections
    where invite_token = p_token
      and status = 'pending'
      and child_workspace_id is null
      and invite_expires_at >= now()
  ) then
    raise exception 'This invite is invalid, expired, or has already been used.';
  end if;

  v_workspace_id := public.create_workspace(p_name, p_workspace_type);
  perform public.redeem_firm_connection_invite(p_token, v_workspace_id);

  return v_workspace_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_platform_terms(p_version text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select workspace_id into v_workspace_id
  from public.workspace_users
  where user_id = auth.uid() and is_owner = true and status = 'active'
  order by created_at
  limit 1;

  insert into public.consent_records (workspace_id, user_id, client_id, consent_type, version, accepted_at)
  values (v_workspace_id, auth.uid(), null, 'platform_terms', p_version, now());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_portal_invitation(p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_invite public.client_portal_users;
  v_user_email text;
begin
  select * into v_invite from public.client_portal_users where invitation_token = p_token;

  if v_invite.id is null then
    raise exception 'invitation not found';
  end if;
  if v_invite.status not in ('invited') then
    raise exception 'invitation is no longer pending';
  end if;
  if v_invite.token_expires_at < now() then
    raise exception 'invitation has expired';
  end if;

  select email into v_user_email from auth.users where id = auth.uid();
  if v_user_email is null or lower(v_user_email) <> lower(v_invite.invited_email::text) then
    raise exception 'this invitation was sent to a different email address';
  end if;

  update public.client_portal_users
  set status = 'active', user_id = auth.uid(), accepted_at = now()
  where id = v_invite.id;

  return v_invite.client_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_quote(p_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quote public.quotes;
  v_service record;
  v_category_slug text;
  v_case_type text;
  v_engagement_id uuid;
begin
  select * into v_quote from public.quotes where id = p_quote_id;
  if v_quote.id is null then
    raise exception 'quote not found';
  end if;
  if not public.is_portal_user(v_quote.client_id) then
    raise exception 'not authorized to respond to this quote';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'this quote is no longer awaiting a response';
  end if;

  update public.quotes set status = 'accepted', accepted_at = now() where id = p_quote_id;

  if v_quote.engagement_id is null and v_quote.service_id is not null then
    select id, process_id, billing_rule_id into v_service
    from public.services
    where id = v_quote.service_id and (workspace_id is null or workspace_id = v_quote.workspace_id);

    if v_service.id is not null then
      select sc.slug into v_category_slug
      from public.services s
      join public.service_categories sc on sc.id = s.service_category_id
      where s.id = v_service.id;

      v_case_type := case v_category_slug
        when 'tax-preparation' then 'tax_return'
        when 'bookkeeping' then 'bookkeeping'
        when 'payroll' then 'payroll'
        when 'business-services' then 'business_service'
        else 'other'
      end;

      insert into public.engagements (workspace_id, client_id, service_id, workflow_id, billing_rule_id, case_type)
      values (v_quote.workspace_id, v_quote.client_id, v_service.id, v_service.process_id, v_service.billing_rule_id, v_case_type)
      returning id into v_engagement_id;

      if v_service.process_id is not null then
        perform public.start_pipeline_run('engagement', v_engagement_id, v_service.process_id);
      end if;

      update public.quotes set engagement_id = v_engagement_id where id = p_quote_id;
    end if;
  end if;

  perform public._notify_admins_of_quote_response(v_quote.workspace_id, v_quote.client_id, p_quote_id, 'accepted');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(p_workspace_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.workspace_users
  set status = 'active', joined_at = now()
  where workspace_id = p_workspace_id and user_id = auth.uid() and status = 'invited';
$function$
;

CREATE OR REPLACE FUNCTION public.accept_workspace_invitation_by_token(p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_invitation public.workspace_invitations;
  v_user_email text;
begin
  select * into v_invitation from public.workspace_invitations where token = p_token;

  if v_invitation.id is null then
    raise exception 'invitation not found';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'invitation is no longer pending';
  end if;
  if v_invitation.expires_at < now() then
    update public.workspace_invitations set status = 'expired', updated_at = now() where id = v_invitation.id;
    raise exception 'invitation has expired';
  end if;

  select email into v_user_email from auth.users where id = auth.uid();
  if v_user_email is null or lower(v_user_email) <> lower(v_invitation.email) then
    raise exception 'this invitation was sent to a different email address';
  end if;

  insert into public.workspace_users (workspace_id, user_id, role_id, status, invited_by, invited_at, joined_at)
  values (v_invitation.workspace_id, auth.uid(), v_invitation.role_id, 'active', v_invitation.invited_by, v_invitation.created_at, now())
  on conflict (workspace_id, user_id) do update
    set role_id = excluded.role_id, status = 'active', joined_at = now();

  update public.workspace_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now(), updated_at = now()
  where id = v_invitation.id;

  return v_invitation.workspace_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_client_address(p_client_id uuid, p_workspace_id uuid, p_street text, p_city text, p_state text, p_zip text, p_make_primary boolean DEFAULT true, p_address_type text DEFAULT 'mailing'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_next_order integer;
begin
  if not has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;

  if p_make_primary then
    update public.client_addresses set is_primary = false where client_id = p_client_id and address_type = p_address_type and is_primary;
  end if;

  select coalesce(max(display_order), -1) + 1 into v_next_order
  from public.client_addresses where client_id = p_client_id and address_type = p_address_type;

  insert into public.client_addresses (client_id, workspace_id, address_type, street, city, state, zip, is_primary, display_order)
  values (p_client_id, p_workspace_id, p_address_type, p_street, p_city, p_state, p_zip, p_make_primary, v_next_order)
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_client_email(p_client_id uuid, p_workspace_id uuid, p_email text, p_make_primary boolean DEFAULT true, p_email_type text DEFAULT 'personal'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_next_order integer;
begin
  if not has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;

  if p_make_primary then
    update public.client_emails set is_primary = false where client_id = p_client_id and is_primary;
  end if;

  select coalesce(max(display_order), -1) + 1 into v_next_order from public.client_emails where client_id = p_client_id;

  insert into public.client_emails (client_id, workspace_id, email_type, email, is_primary, display_order)
  values (p_client_id, p_workspace_id, p_email_type, p_email, p_make_primary, v_next_order)
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_client_phone(p_client_id uuid, p_workspace_id uuid, p_phone text, p_make_primary boolean DEFAULT true, p_phone_type text DEFAULT 'mobile'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_next_order integer;
begin
  if not has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;

  if p_make_primary then
    update public.client_phones set is_primary = false where client_id = p_client_id and is_primary;
  end if;

  select coalesce(max(display_order), -1) + 1 into v_next_order from public.client_phones where client_id = p_client_id;

  insert into public.client_phones (client_id, workspace_id, phone_type, phone_number, is_primary, display_order)
  values (p_client_id, p_workspace_id, p_phone_type, p_phone, p_make_primary, v_next_order)
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_process_stage(p_service_id uuid, p_stage_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_service record;
  v_process_id uuid;
  v_next_order int;
  v_new_stage_id uuid;
begin
  select id, workspace_id, process_id, name into v_service from services where id = p_service_id;
  if v_service.id is null then
    raise exception 'service % not found', p_service_id;
  end if;
  if v_service.workspace_id is null then
    raise exception 'cannot add stages to a system default service -- clone it first';
  end if;
  if not is_workspace_admin(v_service.workspace_id) then
    raise exception 'insufficient permissions to edit this service''s workflow';
  end if;

  v_process_id := v_service.process_id;
  if v_process_id is null then
    v_process_id := gen_random_uuid();
    insert into processes (id, workspace_id, name, slug, created_by)
    values (
      v_process_id, v_service.workspace_id, v_service.name,
      lower(regexp_replace(v_service.name, '[^a-zA-Z0-9]+', '-', 'g')) || '-workflow-' || left(replace(v_process_id::text, '-', ''), 8),
      auth.uid()
    );
    update services set process_id = v_process_id where id = p_service_id;
  end if;

  select coalesce(max(display_order), 0) + 1 into v_next_order from process_stages where process_id = v_process_id;

  v_new_stage_id := gen_random_uuid();
  insert into process_stages (id, process_id, name, display_order)
  values (v_new_stage_id, v_process_id, p_stage_name, v_next_order);

  return v_new_stage_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_process_stage_to_pipeline(p_process_id uuid, p_stage_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_process record;
  v_next_order int;
  v_new_stage_id uuid;
begin
  select id, workspace_id into v_process from processes where id = p_process_id;
  if v_process.id is null then
    raise exception 'pipeline % not found', p_process_id;
  end if;
  if v_process.workspace_id is null then
    raise exception 'cannot add stages to a system default pipeline -- clone it first';
  end if;
  if not is_workspace_admin(v_process.workspace_id) then
    raise exception 'insufficient permissions to edit this pipeline';
  end if;

  select coalesce(max(display_order), 0) + 1 into v_next_order from process_stages where process_id = p_process_id;

  v_new_stage_id := gen_random_uuid();
  insert into process_stages (id, process_id, name, display_order)
  values (v_new_stage_id, p_process_id, p_stage_name, v_next_order);

  return v_new_stage_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.advance_pipeline_on_stage_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_entity_type text;
  v_entity_id uuid;
  v_next_stage_id uuid;
begin
  select entity_type, entity_id into v_entity_type, v_entity_id
  from public.pipeline_runs where id = new.pipeline_run_id;

  select id into v_next_stage_id from public.pipeline_stages
  where pipeline_run_id = new.pipeline_run_id
    and display_order > new.display_order
    and status not in ('Completed', 'Skipped')
  order by display_order asc limit 1;

  if v_next_stage_id is not null then
    update public.pipeline_runs set current_stage_id = v_next_stage_id where id = new.pipeline_run_id;
    update public.pipeline_stages set status = 'In Progress', started_at = now() where id = v_next_stage_id;
  else
    update public.pipeline_runs set status = 'Completed', completed_at = now() where id = new.pipeline_run_id;
    if v_entity_type = 'engagement' then
      update public.engagements set status = 'Completed', completed_date = now() where id = v_entity_id;
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.advance_pipeline_stage(p_entity_type text, p_entity_id uuid, p_process_id uuid, p_process_stage_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_run_id uuid;
  v_stage_id uuid;
  v_target_stage_id uuid;
  v_target_order int;
  v_current_order int;
  v_loop_guard int;
begin
  if p_entity_type = 'client' then
    select workspace_id into v_workspace_id from public.clients where id = p_entity_id;
  elsif p_entity_type = 'engagement' then
    select workspace_id into v_workspace_id from public.engagements where id = p_entity_id;
  else
    raise exception 'unsupported entity_type: %', p_entity_type;
  end if;
  if v_workspace_id is null then
    raise exception '% not found', p_entity_type;
  end if;

  if not public.has_permission(v_workspace_id, case p_entity_type when 'client' then 'clients.edit' else 'engagements.manage' end) then
    raise exception 'Not authorized';
  end if;

  select id, current_stage_id into v_run_id, v_stage_id
  from public.pipeline_runs
  where entity_type = p_entity_type and entity_id = p_entity_id and status = 'Active' and process_id = p_process_id;

  if v_run_id is null then
    v_run_id := public.start_pipeline_run(p_entity_type, p_entity_id, p_process_id);
    select current_stage_id into v_stage_id from public.pipeline_runs where id = v_run_id;
  end if;

  select id into v_target_stage_id from public.pipeline_stages
  where pipeline_run_id = v_run_id and process_stage_id = p_process_stage_id;

  if v_target_stage_id is null then
    raise exception 'Target stage is not part of this pipeline';
  end if;

  select display_order into v_target_order from public.pipeline_stages where id = v_target_stage_id;
  select display_order into v_current_order from public.pipeline_stages where id = v_stage_id;

  if v_target_order < v_current_order then
    raise exception 'Moving backward through pipeline stages is not supported';
  end if;

  v_loop_guard := 0;
  while v_stage_id is distinct from v_target_stage_id and v_loop_guard < 100 loop
    update public.pipeline_stages set status = 'Completed', completed_at = now() where id = v_stage_id;
    select current_stage_id into v_stage_id from public.pipeline_runs where id = v_run_id;
    v_loop_guard := v_loop_guard + 1;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.advance_ready_automation_step(p_pending_step_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pending record;
begin
  select * into v_pending from public.automation_pending_steps
  where id = p_pending_step_id and status = 'pending_delay' and scheduled_for <= now();
  if v_pending.id is null then
    return;
  end if;
  update public.automation_pending_steps set status = 'completed' where id = p_pending_step_id;
  perform public.execute_automation_step(v_pending.run_id, v_pending.automation_step_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.append_agent_run_event(p_run_id uuid, p_level text, p_message text, p_meta jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_budget record;
  v_next_seq integer;
begin
  if not public.can_access_admin_ai() then
    raise exception 'insufficient permissions';
  end if;

  select * into v_budget from public.ai_agent_run_budgets where run_id = p_run_id;
  if v_budget.run_id is null then
    raise exception 'run not found';
  end if;
  if v_budget.hard_stopped_at is not null then
    raise exception 'this run was hard-stopped (%) and cannot log further events', v_budget.hard_stop_reason;
  end if;

  if v_budget.consumed_steps + 1 > v_budget.max_steps then
    update public.ai_agent_run_budgets set hard_stopped_at = now(), hard_stop_reason = 'max_steps exceeded' where run_id = p_run_id;
    update public.ai_agent_runs set status = 'failed', completed_at = now(), error_message = 'Run exceeded its maximum step budget and was stopped.' where id = p_run_id;
    raise exception 'run exceeded max_steps budget and was stopped';
  end if;

  select coalesce(max(seq), 0) + 1 into v_next_seq from public.ai_agent_run_events where run_id = p_run_id;

  insert into public.ai_agent_run_events (run_id, seq, level, message, meta)
  values (p_run_id, v_next_seq, p_level, p_message, p_meta);

  update public.ai_agent_run_budgets set consumed_steps = consumed_steps + 1 where run_id = p_run_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_client_default_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner_id uuid;
begin
  if new.default_reviewer_id is null or new.default_compliance_officer_id is null then
    select wu.user_id into v_owner_id
    from public.workspace_users wu
    where wu.workspace_id = new.workspace_id and wu.is_owner and wu.status = 'active'
    limit 1;

    new.default_reviewer_id := coalesce(new.default_reviewer_id, v_owner_id);
    new.default_compliance_officer_id := coalesce(new.default_compliance_officer_id, v_owner_id);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_document_folder_template()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_template_id uuid;
  v_item record;
  v_id_map jsonb := '{}'::jsonb;
  v_new_folder_id uuid;
  v_parent_folder_id uuid;
begin
  if new.service_id is null then
    return new;
  end if;

  select document_folder_template_id into v_template_id from public.services where id = new.service_id;
  if v_template_id is null then
    return new;
  end if;

  for v_item in
    with recursive tree as (
      select id, parent_item_id, name, display_order, 0 as depth
      from public.document_folder_template_items
      where document_folder_template_id = v_template_id and parent_item_id is null
      union all
      select c.id, c.parent_item_id, c.name, c.display_order, t.depth + 1
      from public.document_folder_template_items c
      join tree t on c.parent_item_id = t.id
    )
    select * from tree order by depth, display_order
  loop
    v_parent_folder_id := case
      when v_item.parent_item_id is null then null
      else (v_id_map ->> v_item.parent_item_id::text)::uuid
    end;

    insert into public.document_folders (workspace_id, entity_type, entity_id, parent_folder_id, name, display_order, created_by)
    values (new.workspace_id, 'engagement', new.id, v_parent_folder_id, v_item.name, v_item.display_order, auth.uid())
    returning id into v_new_folder_id;

    v_id_map := v_id_map || jsonb_build_object(v_item.id::text, v_new_folder_id::text);
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_engagement_default_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner_id uuid;
begin
  if new.assigned_staff_id is null then
    select wu.user_id into v_owner_id
    from public.workspace_users wu
    where wu.workspace_id = new.workspace_id and wu.is_owner and wu.status = 'active'
    limit 1;
    new.assigned_staff_id := v_owner_id;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_manual_payment_to_installment(p_payment_id uuid, p_payment_plan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_payment_invoice_id uuid;
  v_plan_invoice_id uuid;
  v_plan_status text;
begin
  select workspace_id, invoice_id into v_workspace_id, v_payment_invoice_id
  from public.payments where id = p_payment_id;

  if v_workspace_id is null then
    raise exception 'payment not found';
  end if;
  if not public.has_permission(v_workspace_id, 'billing.manage') then
    raise exception 'insufficient permissions';
  end if;

  select invoice_id, status into v_plan_invoice_id, v_plan_status
  from public.payment_plans where id = p_payment_plan_id;

  if v_plan_invoice_id is null then
    raise exception 'payment plan installment not found';
  end if;
  if v_plan_invoice_id <> v_payment_invoice_id then
    raise exception 'this installment belongs to a different invoice than the payment';
  end if;
  if v_plan_status <> 'pending' then
    raise exception 'this installment is not pending';
  end if;

  update public.payment_plans
  set status = 'paid', paid_payment_id = p_payment_id
  where id = p_payment_plan_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_payment_to_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_balance numeric(12,2);
begin
  if new.invoice_id is not null then
    update public.invoices
      set amount_paid = amount_paid + new.amount,
          status = case
            when amount_paid + new.amount >= total_amount then 'paid'
            when amount_paid + new.amount > 0 then 'partially_paid'
            else status
          end
      where id = new.invoice_id;
  end if;

  select coalesce(sum(amount), 0) - new.amount into v_balance
    from public.client_ledger where client_id = new.client_id;

  insert into public.client_ledger (workspace_id, client_id, entry_type, reference_table, reference_id, amount, balance_after, description)
  values (new.workspace_id, new.client_id, 'payment', 'payments', new.id, -new.amount, v_balance, 'Payment received');

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_pipeline_stage_default_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner_id uuid;
begin
  if new.entity_type <> 'engagement' then
    return new;
  end if;

  if new.assigned_staff_id is null or new.reviewer_id is null then
    select wu.user_id into v_owner_id
    from public.workspace_users wu
    where wu.workspace_id = new.workspace_id and wu.is_owner and wu.status = 'active'
    limit 1;

    new.assigned_staff_id := coalesce(new.assigned_staff_id, v_owner_id);
    new.reviewer_id := coalesce(new.reviewer_id, v_owner_id);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_automation_step(p_pending_step_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pending record;
  v_step record;
  v_authorized boolean;
begin
  select * into v_pending from public.automation_pending_steps where id = p_pending_step_id and status = 'pending_approval';
  if v_pending.id is null then
    raise exception 'Pending approval not found';
  end if;

  select * into v_step from public.automation_steps where id = v_pending.automation_step_id;

  if v_step.approver_role_id is not null then
    select exists (
      select 1 from public.workspace_users wu
      where wu.workspace_id = v_pending.workspace_id and wu.user_id = auth.uid() and wu.status = 'active' and wu.role_id = v_step.approver_role_id
    ) or public.is_workspace_admin(v_pending.workspace_id) into v_authorized;
  else
    v_authorized := public.is_workspace_admin(v_pending.workspace_id);
  end if;

  if not v_authorized then
    raise exception 'You are not authorized to approve this step';
  end if;

  update public.automation_pending_steps set status = 'completed', approved_by = auth.uid(), approved_at = now() where id = p_pending_step_id;
  perform public.execute_automation_step(v_pending.run_id, v_pending.automation_step_id);

  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_client_pending_change(p_pending_change_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_row public.client_pending_changes;
  v_plaintext text;
  v_ssn_hash text;
  v_address_id uuid;
begin
  select * into v_row from public.client_pending_changes where id = p_pending_change_id;
  if v_row.id is null then
    raise exception 'pending change not found';
  end if;
  if not public.has_permission(v_row.workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'this change has already been reviewed';
  end if;

  if v_row.target_table = 'clients' and v_row.target_column = 'date_of_birth' then
    update public.clients set date_of_birth = v_row.new_value::date, updated_at = now() where id = v_row.client_id;

  elsif v_row.target_table = 'clients' and v_row.target_column = 'ssn' then
    v_plaintext := public.decrypt_client_secret(decode(v_row.new_value, 'base64'));
    v_ssn_hash := encode(digest(regexp_replace(v_plaintext, '\D', '', 'g') || v_row.workspace_id::text, 'sha256'), 'hex');
    update public.clients
    set ssn_encrypted = decode(v_row.new_value, 'base64'), ssn_hash = v_ssn_hash, ssn_last4 = v_row.new_value_last4, updated_at = now()
    where id = v_row.client_id;

  elsif v_row.target_table = 'clients' and v_row.target_column in ('first_name', 'middle_name', 'last_name', 'suffix', 'business_name') then
    execute format('update public.clients set %I = $1, updated_at = now() where id = $2', v_row.target_column)
      using v_row.new_value, v_row.client_id;

  elsif v_row.target_table = 'clients' and v_row.target_column = 'primary_email' then
    perform public.add_client_email(v_row.client_id, v_row.workspace_id, v_row.new_value, true, 'personal');

  elsif v_row.target_table = 'clients' and v_row.target_column = 'primary_phone' then
    perform public.add_client_phone(v_row.client_id, v_row.workspace_id, v_row.new_value, true, 'mobile');

  elsif v_row.target_table = 'client_addresses' and v_row.target_column in ('street', 'city', 'state', 'zip') then
    -- All four columns for one address change arrive as separate pending
    -- rows sharing a batch_id; only the first one approved for this address
    -- should create the new row, the rest just contribute their column.
    select id into v_address_id from public.client_addresses
    where client_id = v_row.client_id and address_type = 'mailing'
      and is_primary and source_batch_id = v_row.batch_id
    limit 1;

    if v_address_id is null then
      v_address_id := public.add_client_address(
        v_row.client_id, v_row.workspace_id,
        case when v_row.target_column = 'street' then v_row.new_value else (select street from public.client_addresses where id = v_row.client_address_id) end,
        case when v_row.target_column = 'city' then v_row.new_value else (select city from public.client_addresses where id = v_row.client_address_id) end,
        case when v_row.target_column = 'state' then v_row.new_value else (select state from public.client_addresses where id = v_row.client_address_id) end,
        case when v_row.target_column = 'zip' then v_row.new_value else (select zip from public.client_addresses where id = v_row.client_address_id) end,
        true, 'mailing'
      );
      update public.client_addresses set source_batch_id = v_row.batch_id where id = v_address_id;
    else
      execute format('update public.client_addresses set %I = $1, updated_at = now() where id = $2', v_row.target_column)
        using v_row.new_value, v_address_id;
    end if;

  else
    raise exception 'unsupported target %/%', v_row.target_table, v_row.target_column;
  end if;

  update public.client_pending_changes
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), decision_notes = p_notes
  where id = p_pending_change_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_organizer_information_request_item(p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_response_id uuid;
  v_field_id uuid;
  v_instance_index int;
  v_status text;
  v_was_answered boolean;
  v_proposed_value jsonb;
begin
  select req.workspace_id, req.organizer_response_id, item.organizer_field_id, item.instance_index, item.status, item.was_answered_when_flagged, item.proposed_value
  into v_workspace_id, v_response_id, v_field_id, v_instance_index, v_status, v_was_answered, v_proposed_value
  from public.organizer_information_request_items item
  join public.organizer_information_requests req on req.id = item.request_id
  where item.id = p_item_id;

  if v_workspace_id is null then
    raise exception 'information request item not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;
  if not v_was_answered or v_status <> 'client_responded' or v_proposed_value is null then
    raise exception 'this item has no pending correction to approve';
  end if;

  insert into public.organizer_response_answers (organizer_response_id, organizer_field_id, instance_index, value)
  values (v_response_id, v_field_id, v_instance_index, v_proposed_value)
  on conflict (organizer_response_id, organizer_field_id, instance_index)
  do update set value = excluded.value, updated_at = now();

  update public.organizer_information_request_items
  set status = 'approved', resolved_by = auth.uid(), resolved_at = now()
  where id = p_item_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.archive_config_object_share(p_share_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_by uuid;
  v_with uuid;
begin
  select shared_by_workspace_id, shared_with_workspace_id into v_by, v_with
  from public.config_object_shares where id = p_share_id;
  if v_by is null then
    raise exception 'share not found';
  end if;
  if not (public.is_workspace_admin(v_by) or public.is_workspace_admin(v_with)) then
    raise exception 'insufficient permissions to archive this share';
  end if;

  update public.config_object_shares set status = 'archived' where id = p_share_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.attest_signature_presence(p_signer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
begin
  select r.workspace_id into v_workspace_id
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  where s.id = p_signer_id;

  if v_workspace_id is null then
    raise exception 'signer not found';
  end if;

  if not public.has_permission(v_workspace_id, 'signatures.request') then
    raise exception 'insufficient permissions';
  end if;

  update public.signature_request_signers
  set attested_by = auth.uid(), attested_at = now()
  where id = p_signer_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_pipeline_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.entity_type <> 'engagement' then
    return new;
  end if;

  insert into public.activity_log (workspace_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (
    new.workspace_id,
    'workflow_run',
    new.id,
    'STATUS_CHANGE',
    'STATUS_CHANGE',
    'Workflow status changed from ' || coalesce(old.status::text, 'NULL') || ' to ' || new.status::text,
    jsonb_build_object('old_status', old.status, 'new_status', new.status)
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_row jsonb;
begin
  v_row := to_jsonb(case when TG_OP = 'DELETE' then old else new end);
  v_workspace_id := case
    when v_row ? 'workspace_id' then (v_row->>'workspace_id')::uuid
    when TG_TABLE_NAME = 'workspaces' then (v_row->>'id')::uuid
    else null
  end;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, before_data, after_data)
  values (
    v_workspace_id,
    auth.uid(),
    TG_TABLE_NAME,
    (v_row->>'id')::uuid,
    lower(TG_OP),
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_assign_client_relationship_manager()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if NEW.relationship_manager_id is null then
    NEW.relationship_manager_id := public.resolve_client_relationship_manager(NEW.workspace_id, auth.uid());
  end if;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_admin_ai()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_platform_admin() or public.is_platform_ai_operator();
$function$
;

CREATE OR REPLACE FUNCTION public.can_use_network_messaging(p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    case
      when (select w.workspace_type from public.workspaces w where w.id = p_workspace_id) in ('ero_office', 'service_bureau')
        then public.is_workspace_member(p_workspace_id)
      else exists (select 1 from public.get_messageable_network_workspaces(p_workspace_id))
    end;
$function$
;

CREATE OR REPLACE FUNCTION public.capture_public_lead_from_contact_step(p_token uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_service_ids uuid[], p_auth_user_id uuid DEFAULT NULL::uuid, p_middle_name text DEFAULT NULL::text, p_suffix text DEFAULT NULL::text, p_mailing_street text DEFAULT NULL::text, p_mailing_city text DEFAULT NULL::text, p_mailing_state text DEFAULT NULL::text, p_mailing_zip text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_has_address boolean;
  v_service_id uuid;
begin
  select ot.workspace_id into v_workspace_id
  from public.organizer_templates ot
  where ot.public_token = p_token and ot.is_public = true and ot.status = 'published';

  if v_workspace_id is null then
    raise exception 'This link is no longer available';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;

  v_client_id := public.find_or_create_public_lead(v_workspace_id, p_first_name, p_last_name, p_email, p_phone);

  update public.clients
  set middle_name = coalesce(middle_name, nullif(btrim(p_middle_name), '')),
      suffix = coalesce(suffix, nullif(btrim(p_suffix), ''))
  where id = v_client_id;

  if p_mailing_street is not null or p_mailing_city is not null or p_mailing_state is not null or p_mailing_zip is not null then
    select exists(select 1 from public.client_addresses where client_id = v_client_id and address_type = 'mailing') into v_has_address;
    if not v_has_address then
      insert into public.client_addresses (client_id, workspace_id, address_type, is_primary, display_order, street, city, state, zip)
      values (v_client_id, v_workspace_id, 'mailing', true, 0, nullif(btrim(p_mailing_street), ''), nullif(btrim(p_mailing_city), ''), nullif(btrim(p_mailing_state), ''), nullif(btrim(p_mailing_zip), ''));
    end if;
  end if;

  foreach v_service_id in array coalesce(p_service_ids, array[]::uuid[])
  loop
    insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
    select v_client_id, v_workspace_id, s.service_category_id, s.id, 'public_organizer_signup'
    from public.services s
    where s.id = v_service_id;
  end loop;

  if p_auth_user_id is not null then
    perform public.link_public_portal_account(v_workspace_id, v_client_id, p_auth_user_id, p_email, btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, '')));
  end if;

  perform public._notify_admins_of_new_public_lead(v_workspace_id, v_client_id);

  return jsonb_build_object('client_id', v_client_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.capture_public_lead_from_site_page(p_page_id uuid, p_section_id uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_service_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_service_id uuid;
begin
  select p.workspace_id into v_workspace_id
  from public.site_pages p
  join public.site_page_sections s on s.page_id = p.id
  where p.id = p_page_id and s.id = p_section_id and s.section_type = 'lead_form' and p.status = 'published';

  if v_workspace_id is null then
    raise exception 'This page is no longer available';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;

  v_client_id := public.find_or_create_public_lead(v_workspace_id, p_first_name, p_last_name, p_email, p_phone);

  foreach v_service_id in array coalesce(p_service_ids, array[]::uuid[])
  loop
    insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
    select v_client_id, v_workspace_id, s.service_category_id, s.id, 'public_site_page'
    from public.services s
    where s.id = v_service_id;
  end loop;

  perform public._notify_admins_of_new_public_lead(v_workspace_id, v_client_id);

  return jsonb_build_object('client_id', v_client_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_document_request_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_incomplete_required int;
begin
  select count(*) into v_incomplete_required
  from public.document_request_item_statuses
  where document_request_id = new.document_request_id
    and is_required and status = 'pending';

  if v_incomplete_required = 0 then
    update public.document_requests set status = 'completed', updated_at = now()
    where id = new.document_request_id and status = 'open';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_login_lockout(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
  v_locked_until timestamptz;
begin
  select id into v_user_id from auth.users where lower(email) = lower(p_email);
  if v_user_id is null then
    return jsonb_build_object('locked', false);
  end if;

  select locked_until into v_locked_until from public.user_profiles where id = v_user_id;
  if v_locked_until is not null and v_locked_until > now() then
    return jsonb_build_object('locked', true, 'locked_until', v_locked_until);
  end if;

  return jsonb_build_object('locked', false);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_max_hits integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count int;
begin
  delete from public.rate_limit_hits
  where rate_key = p_key and created_at < now() - make_interval(secs => p_window_seconds);

  select count(*) into v_count
  from public.rate_limit_hits
  where rate_key = p_key and created_at >= now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max_hits then
    return false;
  end if;

  insert into public.rate_limit_hits (rate_key) values (p_key);
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_storage_capacity(p_workspace_id uuid, p_additional_bytes bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_meter record;
  v_current_bytes bigint;
begin
  select free_units_granted, prepaid_balance into v_meter
  from public.workspace_usage_meters
  where workspace_id = p_workspace_id and resource_type = 'storage';

  if not found then
    return true;
  end if;

  select coalesce(sum(file_size_bytes), 0) into v_current_bytes
  from public.attachments
  where workspace_id = p_workspace_id and is_archived = false;

  return (v_current_bytes + coalesce(p_additional_bytes, 0)) <= ((v_meter.free_units_granted + v_meter.prepaid_balance) * 1073741824);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.compare_config_object_versions(p_table text, p_id uuid, p_version_a integer, p_version_b integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_a jsonb;
  v_b jsonb;
  v_workspace_id uuid;
  v_changed_keys text[];
begin
  select snapshot, workspace_id into v_a, v_workspace_id
  from public.config_object_versions where object_type = p_table and object_id = p_id and version_number = p_version_a;
  select snapshot into v_b
  from public.config_object_versions where object_type = p_table and object_id = p_id and version_number = p_version_b;

  if v_a is null or v_b is null then
    raise exception 'one or both versions not found for % %', p_table, p_id;
  end if;
  if v_workspace_id is not null and not public.is_workspace_member(v_workspace_id) then
    raise exception 'insufficient permissions to view these versions';
  end if;

  select array_agg(distinct k) into v_changed_keys
  from (
    select key as k from jsonb_each(v_a) where not jsonb_build_object(key, value) <@ v_b
    union
    select key as k from jsonb_each(v_b) where not jsonb_build_object(key, value) <@ v_a
  ) diffs;

  return jsonb_build_object(
    'version_a', jsonb_build_object('version_number', p_version_a, 'snapshot', v_a),
    'version_b', jsonb_build_object('version_number', p_version_b, 'snapshot', v_b),
    'changed_keys', to_jsonb(coalesce(v_changed_keys, array[]::text[]))
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_agent_run(p_run_id uuid, p_status text, p_summary jsonb DEFAULT '{}'::jsonb, p_ai_analysis jsonb DEFAULT NULL::jsonb, p_error_message text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agent_id uuid;
begin
  if not public.can_access_admin_ai() then
    raise exception 'insufficient permissions';
  end if;
  if p_status not in ('completed', 'failed', 'cancelled') then
    raise exception 'invalid terminal status: %', p_status;
  end if;

  update public.ai_agent_runs
  set status = p_status, completed_at = now(), summary = p_summary, ai_analysis = p_ai_analysis, error_message = p_error_message
  where id = p_run_id and status = 'running'
  returning agent_id into v_agent_id;

  if v_agent_id is null then
    raise exception 'run not found or already completed';
  end if;

  if p_status = 'completed' then
    update public.ai_agents set last_success_run_at = now(), updated_at = now() where id = v_agent_id;
  elsif p_status = 'failed' then
    update public.ai_agents set last_failure_run_at = now(), updated_at = now() where id = v_agent_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.compliance_inactive_users(p_workspace_id uuid, p_inactive_since interval DEFAULT '30 days'::interval)
 RETURNS TABLE(workspace_id uuid, user_id uuid, display_name text, role_name text, last_seen_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select wu.workspace_id, wu.user_id, up.display_name, r.name, up.last_seen_at
  from public.workspace_users wu
  join public.user_profiles up on up.id = wu.user_id
  join public.roles r on r.id = wu.role_id
  where wu.workspace_id = p_workspace_id
    and wu.status = 'active'
    and (up.last_seen_at is null or up.last_seen_at < now() - p_inactive_since);
$function$
;

CREATE OR REPLACE FUNCTION public.compute_business_hours_deadline(p_workspace_id uuid, p_start timestamp with time zone, p_hours_needed numeric)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_tz text;
  v_hours jsonb;
  v_holidays jsonb;
  v_remaining numeric := p_hours_needed;
  v_cursor_local timestamp;
  v_day_date date;
  v_day_str text;
  v_dow smallint;
  v_day_names text[] := array['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  v_day jsonb;
  v_window_start timestamp;
  v_window_end timestamp;
  v_window_hours numeric;
  v_days_walked int := 0;
  v_is_holiday boolean;
begin
  select timezone into v_tz from public.workspaces where id = p_workspace_id;
  v_tz := coalesce(nullif(v_tz, ''), 'America/New_York');

  select value into v_hours from public.system_settings where workspace_id = p_workspace_id and key = 'business_hours';
  if v_hours is null then
    v_hours := jsonb_build_object(
      'sunday', null, 'saturday', null,
      'monday', jsonb_build_object('start', '09:00', 'end', '17:00'),
      'tuesday', jsonb_build_object('start', '09:00', 'end', '17:00'),
      'wednesday', jsonb_build_object('start', '09:00', 'end', '17:00'),
      'thursday', jsonb_build_object('start', '09:00', 'end', '17:00'),
      'friday', jsonb_build_object('start', '09:00', 'end', '17:00')
    );
  end if;

  select value into v_holidays from public.system_settings where workspace_id = p_workspace_id and key = 'holidays';
  v_holidays := coalesce(v_holidays, '[]'::jsonb);

  v_cursor_local := p_start at time zone v_tz;

  while v_remaining > 0 and v_days_walked < 90 loop
    v_day_date := v_cursor_local::date;
    v_dow := extract(dow from v_day_date);
    v_day := v_hours -> v_day_names[v_dow + 1];
    v_day_str := to_char(v_day_date, 'YYYY-MM-DD');

    select exists (
      select 1 from jsonb_array_elements(v_holidays) as h
      where v_day_str between (h->>'start') and (h->>'end')
    ) into v_is_holiday;

    if v_is_holiday then
      v_day := null;
    end if;

    if v_day is not null and v_day <> 'null'::jsonb then
      v_window_start := greatest(v_cursor_local, v_day_date + (v_day->>'start')::time);
      v_window_end := v_day_date + (v_day->>'end')::time;

      if v_window_end > v_window_start then
        v_window_hours := extract(epoch from (v_window_end - v_window_start)) / 3600.0;
        if v_window_hours >= v_remaining then
          return (v_window_start + (v_remaining * interval '1 hour')) at time zone v_tz;
        end if;
        v_remaining := v_remaining - v_window_hours;
      end if;
    end if;

    v_cursor_local := (v_day_date + 1);
    v_days_walked := v_days_walked + 1;
  end loop;

  return v_cursor_local at time zone v_tz;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.copy_shared_engagement(p_engagement_share_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_share public.engagement_shares;
  v_client_id uuid;
  v_new_client_id uuid := gen_random_uuid();
  v_new_engagement_id uuid := gen_random_uuid();
  v_row jsonb;
  v_tax_rec record;
  v_response_rec record;
  v_answer_rec record;
  v_attachment_rec record;
  v_new_response_id uuid;
  v_new_entity_id uuid;
  v_new_attachment_id uuid;
  v_new_storage_path text;
  v_paths jsonb := '[]'::jsonb;
begin
  select * into v_share from public.engagement_shares where id = p_engagement_share_id;
  if v_share.id is null then
    raise exception 'engagement share not found';
  end if;
  if not public.has_permission(v_share.shared_with_workspace_id, 'engagements.approve_review') then
    raise exception 'insufficient permissions to finalize this engagement share';
  end if;
  if v_share.status <> 'approved' then
    raise exception 'this share has not been approved';
  end if;

  select client_id into v_client_id from public.engagements where id = v_share.engagement_id;

  select to_jsonb(t) into v_row from public.clients t where t.id = v_client_id;
  v_row := (v_row - 'merged_into_client_id' - 'relationship_manager_id' - 'default_reviewer_id' - 'default_compliance_officer_id')
    || jsonb_build_object(
      'id', v_new_client_id, 'workspace_id', v_share.shared_with_workspace_id,
      'source_workspace_id', v_share.workspace_id, 'created_at', now(), 'updated_at', now()
    );
  insert into public.clients select * from jsonb_populate_record(null::public.clients, v_row);

  select to_jsonb(t) into v_row from public.engagements t where t.id = v_share.engagement_id;
  v_row := (v_row - 'reviewer_id' - 'assigned_staff_id' - 'compliance_officer_id')
    || jsonb_build_object(
      'id', v_new_engagement_id, 'workspace_id', v_share.shared_with_workspace_id,
      'client_id', v_new_client_id, 'status', 'Waiting On Review',
      'source_engagement_share_id', p_engagement_share_id, 'created_at', now(), 'updated_at', now()
    );
  insert into public.engagements select * from jsonb_populate_record(null::public.engagements, v_row);

  for v_tax_rec in select * from public.engagement_tax_details where engagement_id = v_share.engagement_id loop
    v_row := (to_jsonb(v_tax_rec) - 'original_engagement_id')
      || jsonb_build_object(
        'engagement_id', v_new_engagement_id, 'workspace_id', v_share.shared_with_workspace_id,
        'created_at', now(), 'updated_at', now()
      );
    insert into public.engagement_tax_details select * from jsonb_populate_record(null::public.engagement_tax_details, v_row);
  end loop;

  for v_response_rec in select * from public.organizer_responses where engagement_id = v_share.engagement_id loop
    v_new_response_id := gen_random_uuid();
    v_row := (to_jsonb(v_response_rec) - 'resolved_service_id')
      || jsonb_build_object(
        'id', v_new_response_id, 'engagement_id', v_new_engagement_id, 'client_id', v_new_client_id,
        'workspace_id', v_share.shared_with_workspace_id, 'created_at', now(), 'updated_at', now()
      );
    insert into public.organizer_responses select * from jsonb_populate_record(null::public.organizer_responses, v_row);

    for v_answer_rec in select * from public.organizer_response_answers where organizer_response_id = v_response_rec.id loop
      v_row := to_jsonb(v_answer_rec)
        || jsonb_build_object('id', gen_random_uuid(), 'organizer_response_id', v_new_response_id, 'updated_at', now());
      insert into public.organizer_response_answers select * from jsonb_populate_record(null::public.organizer_response_answers, v_row);
    end loop;
  end loop;

  for v_attachment_rec in
    select * from public.attachments
    where visibility = 'client_visible' and is_archived = false
      and (
        (entity_type = 'engagement' and entity_id = v_share.engagement_id)
        or (entity_type = 'client' and entity_id = v_client_id)
      )
  loop
    v_new_attachment_id := gen_random_uuid();
    v_new_entity_id := case when v_attachment_rec.entity_type = 'engagement' then v_new_engagement_id else v_new_client_id end;
    v_new_storage_path := v_share.shared_with_workspace_id || '/' || v_new_entity_id || '/' || extract(epoch from now())::bigint || '-' || v_attachment_rec.file_name;

    v_row := (to_jsonb(v_attachment_rec) - 'replaces_attachment_id')
      || jsonb_build_object(
        'id', v_new_attachment_id, 'workspace_id', v_share.shared_with_workspace_id,
        'entity_id', v_new_entity_id, 'storage_path', v_new_storage_path, 'created_at', now()
      );
    insert into public.attachments select * from jsonb_populate_record(null::public.attachments, v_row);

    v_paths := v_paths || jsonb_build_object('old_path', v_attachment_rec.storage_path, 'new_path', v_new_storage_path);
  end loop;

  return v_paths;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.correlate_agent_findings(p_finding_id_a uuid, p_finding_id_b uuid, p_relationship text DEFAULT 'related'::text, p_confidence text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_a uuid := least(p_finding_id_a, p_finding_id_b);
  v_b uuid := greatest(p_finding_id_a, p_finding_id_b);
begin
  if not public.can_access_admin_ai() then
    raise exception 'insufficient permissions';
  end if;
  if p_finding_id_a = p_finding_id_b then
    raise exception 'cannot correlate a finding with itself';
  end if;

  insert into public.ai_agent_finding_correlations (finding_id_a, finding_id_b, relationship, confidence, created_by)
  values (v_a, v_b, p_relationship, p_confidence, auth.uid())
  on conflict (finding_id_a, finding_id_b) do update set relationship = excluded.relationship, confidence = excluded.confidence;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_agent_finding(p_agent_key text, p_run_id uuid, p_workspace_id uuid, p_category text, p_severity text, p_title text, p_description text, p_fingerprint text, p_expected_behavior text DEFAULT NULL::text, p_actual_behavior text DEFAULT NULL::text, p_reproduction_steps jsonb DEFAULT NULL::jsonb, p_affected_module text DEFAULT NULL::text, p_related_record_type text DEFAULT NULL::text, p_related_record_id text DEFAULT NULL::text, p_ai_analysis jsonb DEFAULT NULL::jsonb, p_possible_cause text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agent_id uuid;
  v_existing record;
  v_finding_id uuid;
begin
  if not public.can_access_admin_ai() then
    raise exception 'insufficient permissions';
  end if;

  select id into v_agent_id from public.ai_agents where agent_key = p_agent_key;
  if v_agent_id is null then
    raise exception 'unknown agent: %', p_agent_key;
  end if;

  select * into v_existing from public.ai_agent_findings
  where agent_id = v_agent_id and workspace_id = p_workspace_id and fingerprint = p_fingerprint
  order by created_at desc
  limit 1;

  if v_existing.id is not null and v_existing.status in ('open', 'investigating', 'retest_required') then
    update public.ai_agent_findings
    set last_detected_at = now(), run_id = p_run_id, actual_behavior = coalesce(p_actual_behavior, actual_behavior),
        ai_analysis = coalesce(p_ai_analysis, ai_analysis), updated_at = now()
    where id = v_existing.id
    returning id into v_finding_id;
    return v_finding_id;
  end if;

  if v_existing.id is not null and v_existing.status in ('fixed', 'resolved') then
    update public.ai_agent_findings
    set status = 'reopened', regression_of = v_existing.id, last_detected_at = now(), run_id = p_run_id,
        actual_behavior = coalesce(p_actual_behavior, actual_behavior), ai_analysis = coalesce(p_ai_analysis, ai_analysis),
        updated_at = now()
    where id = v_existing.id
    returning id into v_finding_id;
    return v_finding_id;
  end if;

  insert into public.ai_agent_findings (
    agent_id, run_id, workspace_id, category, severity, title, description, fingerprint,
    expected_behavior, actual_behavior, reproduction_steps, affected_module,
    related_record_type, related_record_id, ai_analysis, possible_cause
  ) values (
    v_agent_id, p_run_id, p_workspace_id, p_category, p_severity, p_title, p_description, p_fingerprint,
    p_expected_behavior, p_actual_behavior, p_reproduction_steps, p_affected_module,
    p_related_record_type, p_related_record_id, p_ai_analysis, p_possible_cause
  )
  returning id into v_finding_id;

  return v_finding_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_client(p_workspace_id uuid, p_client_type text, p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_business_name text DEFAULT NULL::text, p_date_of_birth date DEFAULT NULL::date, p_primary_email text DEFAULT NULL::text, p_primary_phone text DEFAULT NULL::text, p_ssn text DEFAULT NULL::text, p_ein text DEFAULT NULL::text, p_itin text DEFAULT NULL::text, p_force_create boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_normalized_email citext;
  v_normalized_phone text;
  v_ssn_hash text;
  v_ein_hash text;
  v_existing record;
  v_new_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'clients.create') then
    raise exception 'insufficient permissions to create a client in this workspace';
  end if;

  v_normalized_email := nullif(lower(btrim(p_primary_email)), '');
  v_normalized_phone := nullif(regexp_replace(coalesce(p_primary_phone, ''), '\D', '', 'g'), '');
  v_ssn_hash := case when p_ssn is not null and btrim(p_ssn) <> ''
    then encode(digest(regexp_replace(p_ssn, '\D', '', 'g') || p_workspace_id::text, 'sha256'), 'hex') end;
  v_ein_hash := case when p_ein is not null and btrim(p_ein) <> ''
    then encode(digest(regexp_replace(p_ein, '\D', '', 'g') || p_workspace_id::text, 'sha256'), 'hex') end;

  if not p_force_create then
    select id, array_remove(array[
        case when v_ssn_hash is not null and ssn_hash = v_ssn_hash then 'ssn' end,
        case when v_ein_hash is not null and ein_hash = v_ein_hash then 'ein' end,
        case when v_normalized_email is not null and normalized_email = v_normalized_email then 'email' end,
        case when v_normalized_phone is not null and normalized_phone = v_normalized_phone then 'phone' end
      ], null) as matched_on
    into v_existing
    from public.clients
    where workspace_id = p_workspace_id
      and merged_into_client_id is null
      and (
        (v_ssn_hash is not null and ssn_hash = v_ssn_hash)
        or (v_ein_hash is not null and ein_hash = v_ein_hash)
        or (v_normalized_email is not null and normalized_email = v_normalized_email)
        or (v_normalized_phone is not null and normalized_phone = v_normalized_phone)
      )
    limit 1;

    if v_existing.id is not null then
      return jsonb_build_object('client_id', v_existing.id, 'is_new', false, 'duplicate_matched_on', to_jsonb(v_existing.matched_on));
    end if;
  end if;

  insert into public.clients (
    workspace_id, client_type, first_name, last_name, business_name, date_of_birth,
    primary_email, primary_phone, normalized_email, normalized_phone,
    ssn_encrypted, ssn_last4, ssn_hash, ein_encrypted, ein_last4, ein_hash,
    itin_encrypted, itin_last4, itin_hash, created_by
  ) values (
    p_workspace_id, p_client_type, p_first_name, p_last_name, p_business_name, p_date_of_birth,
    p_primary_email, p_primary_phone, v_normalized_email, v_normalized_phone,
    public.encrypt_client_secret(p_ssn), nullif(right(regexp_replace(coalesce(p_ssn, ''), '\D', '', 'g'), 4), ''), v_ssn_hash,
    public.encrypt_client_secret(p_ein), nullif(right(regexp_replace(coalesce(p_ein, ''), '\D', '', 'g'), 4), ''), v_ein_hash,
    public.encrypt_client_secret(p_itin), nullif(right(regexp_replace(coalesce(p_itin, ''), '\D', '', 'g'), 4), ''),
    case when p_itin is not null and btrim(p_itin) <> '' then encode(digest(regexp_replace(p_itin, '\D', '', 'g') || p_workspace_id::text, 'sha256'), 'hex') end,
    auth.uid()
  )
  returning id into v_new_id;

  return jsonb_build_object('client_id', v_new_id, 'is_new', true, 'duplicate_matched_on', '[]'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_client_relationship(p_client_id uuid, p_workspace_id uuid, p_relationship_type text, p_related_name text, p_related_client_id uuid DEFAULT NULL::uuid, p_related_dob date DEFAULT NULL::date, p_related_ssn text DEFAULT NULL::text, p_custom_relationship_title text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to add a relationship in this workspace';
  end if;

  insert into public.client_relationships (
    client_id, workspace_id, relationship_type, related_name, related_client_id,
    related_dob, related_ssn_encrypted, related_ssn_last4, custom_relationship_title
  ) values (
    p_client_id, p_workspace_id, p_relationship_type, p_related_name, p_related_client_id,
    p_related_dob, public.encrypt_client_secret(p_related_ssn),
    nullif(right(regexp_replace(coalesce(p_related_ssn, ''), '\D', '', 'g'), 4), ''),
    p_custom_relationship_title
  )
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_config_object_share(p_table text, p_object_id uuid, p_target_workspace_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source_workspace_id uuid;
  v_share_id uuid;
begin
  if not public.is_valid_config_table(p_table) then
    raise exception 'unsupported config table: %', p_table;
  end if;

  execute format('select workspace_id from public.%I where id = $1', p_table)
    into v_source_workspace_id using p_object_id;

  if v_source_workspace_id is null then
    raise exception '% not found, or is a system-wide object that cannot be shared', p_table;
  end if;

  if not public.is_workspace_admin(v_source_workspace_id) then
    raise exception 'insufficient permissions to share this object';
  end if;

  -- Sharing only flows from an ERO/Service Bureau down to a connected
  -- downline firm -- never the reverse, and never to an unconnected
  -- workspace. This is always an explicit, one-object-at-a-time action;
  -- nothing here runs automatically when a connection is made.
  if not exists (
    select 1 from public.firm_connections
    where status = 'active'
      and parent_workspace_id = v_source_workspace_id
      and child_workspace_id = p_target_workspace_id
  ) then
    raise exception 'target workspace is not an active downline connection';
  end if;

  if exists (
    select 1 from public.config_object_shares
    where object_type = p_table and object_id = p_object_id
      and shared_with_workspace_id = p_target_workspace_id and status = 'pending'
  ) then
    raise exception 'a pending share for this object already exists for that workspace';
  end if;

  insert into public.config_object_shares (object_type, object_id, shared_by_workspace_id, shared_with_workspace_id, shared_by, status)
  values (p_table, p_object_id, v_source_workspace_id, p_target_workspace_id, auth.uid(), 'pending')
  returning id into v_share_id;

  return v_share_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_document_request(p_workspace_id uuid, p_entity_type text, p_entity_id uuid, p_template_id uuid, p_title text, p_due_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'documents.request') then
    raise exception 'insufficient permissions to request documents in this workspace';
  end if;

  insert into public.document_requests (workspace_id, entity_type, entity_id, document_request_template_id, title, due_date, created_by)
  values (p_workspace_id, p_entity_type, p_entity_id, p_template_id, p_title, p_due_date, auth.uid())
  returning id into v_request_id;

  insert into public.document_request_item_statuses (document_request_id, document_request_item_id, name, is_required, category, status, fulfilled_by_attachment_id)
  select
    v_request_id,
    dri.id,
    dri.name,
    dri.is_required,
    dri.category,
    coalesce(prior.status, 'pending'),
    prior.fulfilled_by_attachment_id
  from public.document_request_items dri
  left join lateral (
    select s.status, s.fulfilled_by_attachment_id
    from public.document_request_item_statuses s
    join public.document_requests r on r.id = s.document_request_id
    where r.entity_type = p_entity_type
      and r.entity_id = p_entity_id
      and s.name = dri.name
      and s.status <> 'pending'
    order by s.updated_at desc
    limit 1
  ) prior on true
  where dri.document_request_template_id = p_template_id;

  return v_request_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_engagement(p_workspace_id uuid, p_client_id uuid, p_service_id uuid DEFAULT NULL::uuid, p_assigned_staff_id uuid DEFAULT NULL::uuid, p_priority engagement_priority DEFAULT 'Medium'::engagement_priority, p_billing_rule_id uuid DEFAULT NULL::uuid, p_process_id uuid DEFAULT NULL::uuid, p_case_type text DEFAULT 'other'::text, p_due_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_service record;
  v_process record;
  v_engagement_id uuid;
  v_billing_rule_id uuid;
  v_process_id uuid;
  v_handoff_run_id uuid;
begin
  if not has_permission(p_workspace_id, 'engagements.manage') then
    raise exception 'insufficient permissions to create an engagement in this workspace';
  end if;

  if p_service_id is not null then
    select id, process_id, billing_rule_id into v_service from services
    where id = p_service_id and (workspace_id is null or workspace_id = p_workspace_id);
    if v_service.id is null then raise exception 'service % not found or not accessible in this workspace', p_service_id; end if;
    v_billing_rule_id := coalesce(p_billing_rule_id, v_service.billing_rule_id);
  else
    v_billing_rule_id := p_billing_rule_id;
  end if;

  if p_process_id is not null then
    select id into v_process from processes where id = p_process_id and (workspace_id is null or workspace_id = p_workspace_id);
    if v_process.id is null then raise exception 'pipeline % not found or not accessible in this workspace', p_process_id; end if;
    v_process_id := p_process_id;
  elsif p_service_id is not null then
    v_process_id := v_service.process_id;
  else
    v_process_id := null;
  end if;

  insert into engagements (workspace_id, client_id, service_id, workflow_id, assigned_staff_id, priority, billing_rule_id, case_type, due_date)
  values (p_workspace_id, p_client_id, p_service_id, v_process_id, p_assigned_staff_id, p_priority, v_billing_rule_id, coalesce(p_case_type, 'other'), p_due_date)
  returning id into v_engagement_id;

  if v_process_id is not null then
    update pipeline_runs
    set entity_type = 'engagement', entity_id = v_engagement_id
    where entity_type = 'client' and entity_id = p_client_id
      and process_id = v_process_id and status = 'Active'
    returning id into v_handoff_run_id;

    if v_handoff_run_id is not null then
      update pipeline_stages set entity_type = 'engagement' where pipeline_run_id = v_handoff_run_id;
    else
      perform start_pipeline_run('engagement', v_engagement_id, v_process_id);
    end if;
  end if;

  return v_engagement_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_engagement_share(p_engagement_id uuid)
 RETURNS engagement_shares
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_ero_workspace_id uuid;
  v_row public.engagement_shares;
  v_recipient record;
begin
  select workspace_id into v_workspace_id from public.engagements where id = p_engagement_id;
  if v_workspace_id is null then
    raise exception 'engagement not found';
  end if;
  if not public.has_permission(v_workspace_id, 'engagements.share') then
    raise exception 'insufficient permissions to share this engagement';
  end if;

  select parent_workspace_id into v_ero_workspace_id
  from public.firm_connections
  where child_workspace_id = v_workspace_id and relationship_type = 'ero_ptin' and status = 'active';

  if v_ero_workspace_id is null then
    raise exception 'This workspace is not connected to an ERO.';
  end if;

  insert into public.engagement_shares (engagement_id, workspace_id, shared_with_workspace_id, status, shared_by)
  values (p_engagement_id, v_workspace_id, v_ero_workspace_id, 'pending', auth.uid())
  returning * into v_row;

  for v_recipient in
    select wu.user_id from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = v_ero_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    perform public.create_notification(
      v_ero_workspace_id, v_recipient.user_id, 'ENGAGEMENT_SHARE_CREATED',
      'engagement_share_created', jsonb_build_object('engagement_share_id', v_row.id, 'engagement_id', p_engagement_id),
      array['In-App'::text], 'Medium', 'engagement', p_engagement_id
    );
  end loop;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_firm_connection_invite(p_workspace_id uuid, p_relationship_type text DEFAULT 'ero_ptin'::text)
 RETURNS firm_connections
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.firm_connections;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to create a connection invite';
  end if;
  if p_relationship_type not in ('service_bureau_ero', 'ero_ptin', 'service_bureau_ptin') then
    raise exception 'invalid relationship_type';
  end if;

  insert into public.firm_connections (parent_workspace_id, relationship_type, status, invite_token, invite_expires_at, invited_by)
  values (p_workspace_id, p_relationship_type, 'pending', gen_random_uuid(), now() + interval '14 days', auth.uid())
  returning * into v_row;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_notification(p_workspace_id uuid, p_recipient_user_id uuid, p_event_type text, p_template_key text, p_payload jsonb DEFAULT '{}'::jsonb, p_channels text[] DEFAULT ARRAY['In-App'::text], p_priority text DEFAULT 'Medium'::text, p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  insert into public.notification_queue (workspace_id, recipient_user_id, channel, channels, event_type, template_key, payload, priority, entity_type, entity_id)
  values (p_workspace_id, p_recipient_user_id, p_channels[1], p_channels, p_event_type, p_template_key, p_payload, p_priority, p_entity_type, p_entity_id)
  returning id into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_organizer_information_request(p_response_id uuid, p_message text, p_organizer_field_id uuid DEFAULT NULL::uuid, p_send_email boolean DEFAULT false, p_send_sms boolean DEFAULT false, p_show_in_portal boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_primary_email text;
  v_primary_phone text;
  v_request_id uuid;
  v_thread_id uuid;
begin
  select workspace_id, client_id, engagement_id into v_workspace_id, v_client_id, v_engagement_id
  from public.organizer_responses where id = p_response_id;

  if v_workspace_id is null then
    raise exception 'organizer response not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;
  if nullif(btrim(p_message), '') is null then
    raise exception 'a message is required';
  end if;

  v_entity_type := case when v_engagement_id is not null then 'engagement' else 'client' end;
  v_entity_id := coalesce(v_engagement_id, v_client_id);

  insert into public.organizer_information_requests
    (workspace_id, organizer_response_id, organizer_field_id, created_by, message, sent_via_email, sent_via_sms, shown_in_portal)
  values (v_workspace_id, p_response_id, p_organizer_field_id, auth.uid(), p_message, p_send_email, p_send_sms, p_show_in_portal)
  returning id into v_request_id;

  perform public.set_organizer_response_review_status(p_response_id, 'Corrections Requested', p_message);

  if p_send_email or p_send_sms then
    select primary_email, primary_phone into v_primary_email, v_primary_phone
    from public.clients where id = v_client_id;
  end if;

  if p_send_email and v_primary_email is not null then
    insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type)
    values (v_workspace_id, v_primary_email, 'Email', 'organizer-information-request',
      jsonb_build_object('message', p_message), v_entity_type, v_entity_id, 'organizer_information_request');
  end if;

  if p_send_sms and v_primary_phone is not null then
    insert into public.notification_queue (workspace_id, recipient_phone, channel, template_key, payload, entity_type, entity_id, event_type)
    values (v_workspace_id, v_primary_phone, 'SMS', 'organizer-information-request',
      jsonb_build_object('message', p_message), v_entity_type, v_entity_id, 'organizer_information_request');
  end if;

  if p_show_in_portal then
    select id into v_thread_id from public.message_threads
    where workspace_id = v_workspace_id and entity_type = 'client' and entity_id = v_client_id and status = 'open'
    order by coalesce(last_message_at, created_at) desc
    limit 1;

    if v_thread_id is null then
      insert into public.message_threads (workspace_id, entity_type, entity_id, subject, channel)
      values (v_workspace_id, 'client', v_client_id, 'Information needed on your organizer', 'portal')
      returning id into v_thread_id;
    end if;

    insert into public.messages (workspace_id, thread_id, sender_type, is_internal, body)
    values (v_workspace_id, v_thread_id, 'staff', false, p_message);

    update public.message_threads set last_message_at = now() where id = v_thread_id;
  end if;

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), v_entity_type, v_entity_id, 'ORGANIZER_INFO_REQUESTED', 'ORGANIZER_INFO_REQUESTED',
    'Requested information on an organizer', jsonb_build_object('request_id', v_request_id, 'response_id', p_response_id));

  return v_request_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_workflow_pipeline(p_workspace_id uuid, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_process_id uuid := gen_random_uuid();
begin
  if not has_permission(p_workspace_id, 'pipelines.manage') then
    raise exception 'insufficient permissions to create a pipeline in this workspace';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'a pipeline name is required';
  end if;

  insert into processes (id, workspace_id, name, slug, created_by)
  values (
    v_process_id, p_workspace_id, p_name,
    lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || left(replace(v_process_id::text, '-', ''), 8),
    auth.uid()
  );

  return v_process_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_workspace(p_name text, p_workspace_type text DEFAULT 'independent_ptin'::text, p_timezone text DEFAULT 'America/New_York'::text, p_owner_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_owner_role_id uuid;
  v_slug text;
  v_suffix int := 0;
  v_owner_uid uuid;
begin
  if p_owner_user_id is not null then
    if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
      raise exception 'p_owner_user_id can only be set by a service-role caller';
    end if;
    v_owner_uid := p_owner_user_id;
  else
    v_owner_uid := auth.uid();
  end if;

  if v_owner_uid is null then
    raise exception 'create_workspace requires an authenticated user';
  end if;

  if exists (select 1 from public.client_portal_users where user_id = v_owner_uid and status = 'active') then
    raise exception 'this account is a client portal account and cannot create a staff workspace';
  end if;

  select id into v_owner_role_id from public.roles where workspace_id is null and slug = 'owner';
  if v_owner_role_id is null then
    raise exception 'system owner role is not seeded';
  end if;

  v_slug := regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  if v_slug = '' then
    v_slug := 'workspace';
  end if;
  while exists (select 1 from public.workspaces where slug = v_slug || case when v_suffix = 0 then '' else '-' || v_suffix end) loop
    v_suffix := v_suffix + 1;
  end loop;
  if v_suffix > 0 then
    v_slug := v_slug || '-' || v_suffix;
  end if;

  insert into public.workspaces (name, slug, workspace_type, timezone, created_by, primary_contact_email)
  values (p_name, v_slug, p_workspace_type, p_timezone, v_owner_uid, (select email from auth.users where id = v_owner_uid))
  returning id into v_workspace_id;

  insert into public.workspace_users (workspace_id, user_id, role_id, is_owner, status, joined_at)
  values (v_workspace_id, v_owner_uid, v_owner_role_id, true, 'active', now());

  insert into public.branding (workspace_id, display_name)
  values (v_workspace_id, p_name);

  insert into public.workspace_feature_flags (workspace_id, feature_flag_id, is_enabled)
  select v_workspace_id, id, true from public.feature_flags where is_core;

  insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, status)
  values
    (
      v_workspace_id, 'Client Portal Invite', 'portal-invite-email', 'onboarding',
      'Welcome to {{FirmName}} -- Activate Your Client Portal',
      $body1$Hello {{ClientFirstName}},

Welcome to {{FirmName}}! We're excited to work with you.

To get started, we've created your secure client portal. This portal will be your one-stop location to complete your onboarding, securely upload documents, communicate with our team, review requests, sign documents electronically, and stay informed throughout your engagement.

Your Next Steps

1. Click the secure link below to activate your client portal.
2. Create your password and enable two-factor authentication (recommended).
3. Complete your Core Client Profile. This one-time profile includes your basic information, such as your name, date of birth, Social Security Number or ITIN, address, and contact information. You can update this information anytime if it changes.
4. Complete any organizers or questionnaires our team has assigned to you.
5. Upload any requested documents through the secure portal.

Activate Your Portal

{{PortalActivationButton}}

If the button doesn't work, copy and paste this link into your browser:

{{PortalActivationLink}}

Assigned Tasks

The following items are currently waiting for you:

{{AssignedOrganizerList}}

Don't worry if additional requests appear later. As we review your information, we may request additional documents or ask follow-up questions to ensure we have everything needed to complete your services accurately.

Need Help?

If you have any questions or experience trouble accessing your portal, please contact our office.

{{FirmName}}

Phone: {{FirmPhone}}

Email: {{FirmEmail}}

Website: {{FirmWebsite}}

For your protection, please do not email sensitive information such as Social Security Numbers, tax documents, or financial records. Always upload confidential information through your secure client portal.

We appreciate the opportunity to serve you and look forward to working with you.

Sincerely,

{{FirmName}}

{{FirmAddress}}$body1$,
      '["ClientFirstName", "FirmName", "PortalActivationButton", "PortalActivationLink", "AssignedOrganizerList", "FirmPhone", "FirmEmail", "FirmWebsite", "FirmAddress"]'::jsonb,
      'published'
    ),
    (
      v_workspace_id, 'Appointment Reminder', 'appointment-reminder', 'appointments',
      'Upcoming appointment: {{title}}',
      $body2$Hi,

This is a reminder about the upcoming appointment "{{title}}" on {{start_at}}.

Location: {{location}}

Thank you.$body2$,
      '["title", "start_at", "location"]'::jsonb,
      'published'
    ),
    (
      v_workspace_id, 'Automation Staff Notification', 'automation-staff-notification', 'internal',
      '{{firm_name}}: {{message}}',
      $body3$Hi,

{{message}}

Client: {{client_name}}
Engagement: {{engagement_number}}

-- {{firm_name}} automations$body3$,
      '["message", "client_name", "engagement_number", "firm_name", "status"]'::jsonb,
      'published'
    ),
    (
      v_workspace_id, 'Organizer Information Request', 'organizer-information-request', 'internal',
      'We need more information on your organizer',
      $body4$Hello,

{{message}}

Please log in to your portal to review and respond:

{{portal_link}}

Thank you,
Your tax team$body4$,
      '["message", "portal_link"]'::jsonb,
      'published'
    );

  insert into public.sms_templates (workspace_id, name, slug, body, merge_fields, status)
  values (
    v_workspace_id, 'Organizer Information Request', 'organizer-information-request',
    'We need more info on your organizer: {{message}} Log in to respond: {{portal_link}}',
    '["message", "portal_link"]'::jsonb,
    'published'
  );

  update public.user_profiles set default_workspace_id = v_workspace_id
  where id = v_owner_uid and default_workspace_id is null;

  return v_workspace_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_workspace_invitation(p_workspace_id uuid, p_email text, p_role_id uuid)
 RETURNS workspace_invitations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.workspace_invitations;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to invite members to this workspace';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id and (workspace_id is null or workspace_id = p_workspace_id)) then
    raise exception 'role does not belong to this workspace';
  end if;

  insert into public.workspace_invitations (workspace_id, email, role_id, invited_by)
  values (p_workspace_id, lower(p_email), p_role_id, auth.uid())
  on conflict (workspace_id, lower(email)) where status = 'pending'
  do update set role_id = excluded.role_id, invited_by = excluded.invited_by,
    token = gen_random_uuid(), expires_at = now() + interval '7 days', updated_at = now()
  returning * into v_row;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_workspace_tag(p_workspace_id uuid, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text := btrim(p_name);
  v_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to create a tag in this workspace';
  end if;
  if v_name = '' then
    raise exception 'Tag name cannot be empty';
  end if;

  select id into v_id from public.workspace_tags where workspace_id = p_workspace_id and name = v_name;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.workspace_tags (workspace_id, name, created_by)
  values (p_workspace_id, v_name, auth.uid())
  returning id into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.credit_prepaid_balance(p_workspace_id uuid, p_resource_type text, p_units numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.workspace_usage_meters (workspace_id, resource_type, prepaid_balance)
  values (p_workspace_id, p_resource_type, p_units)
  on conflict (workspace_id, resource_type) do update
    set prepaid_balance = public.workspace_usage_meters.prepaid_balance + excluded.prepaid_balance,
        updated_at = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.current_workspace_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select workspace_id
  from public.workspace_users
  where user_id = auth.uid() and status = 'active';
$function$
;

CREATE OR REPLACE FUNCTION public.debug_whoami()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$ select current_setting('role', true) $function$
;

CREATE OR REPLACE FUNCTION public.decline_config_object_share(p_share_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_shared_with_workspace_id uuid;
begin
  select shared_with_workspace_id into v_shared_with_workspace_id from public.config_object_shares where id = p_share_id;
  if v_shared_with_workspace_id is null then
    raise exception 'share not found';
  end if;
  if not public.is_workspace_admin(v_shared_with_workspace_id) then
    raise exception 'insufficient permissions to decline this share';
  end if;

  update public.config_object_shares
  set status = 'declined', responded_by = auth.uid(), responded_at = now()
  where id = p_share_id and status = 'pending';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.decline_quote(p_quote_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quote public.quotes;
begin
  select * into v_quote from public.quotes where id = p_quote_id;
  if v_quote.id is null then
    raise exception 'quote not found';
  end if;
  if not public.is_portal_user(v_quote.client_id) then
    raise exception 'not authorized to respond to this quote';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'this quote is no longer awaiting a response';
  end if;

  update public.quotes
  set status = 'declined',
      declined_at = now(),
      notes = case when p_reason is not null and btrim(p_reason) <> ''
        then coalesce(notes || E'\n\n', '') || 'Client declined: ' || btrim(p_reason)
        else notes
      end
  where id = p_quote_id;

  perform public._notify_admins_of_quote_response(v_quote.workspace_id, v_quote.client_id, p_quote_id, 'declined');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.decline_signature(p_signer_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
  v_workspace_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_signer_email text;
  v_caller_email text;
begin
  select s.signature_request_id, r.workspace_id, a.entity_type, a.entity_id, s.signer_email
  into v_request_id, v_workspace_id, v_entity_type, v_entity_id, v_signer_email
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  join public.attachments a on a.id = r.attachment_id
  where s.id = p_signer_id;

  if v_request_id is null then
    raise exception 'signer not found';
  end if;

  select email into v_caller_email from auth.users where id = auth.uid();

  if not (
    public.has_permission(v_workspace_id, 'signatures.request')
    or (
      v_signer_email is not null and lower(v_caller_email) = lower(v_signer_email)
      and public.is_portal_user_for_entity(v_entity_type, v_entity_id)
    )
  ) then
    raise exception 'insufficient permissions';
  end if;

  update public.signature_request_signers
  set status = 'declined', declined_at = now(), decline_reason = p_reason
  where id = p_signer_id and status = 'pending';

  if not found then
    raise exception 'this signing request is no longer pending';
  end if;

  update public.signature_requests set status = 'declined', updated_at = now() where id = v_request_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.decline_signature_by_token(p_token uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_signer_id uuid;
  v_request_id uuid;
begin
  select s.id, s.signature_request_id into v_signer_id, v_request_id
  from public.signature_request_signers s
  where s.access_token = p_token;

  if v_signer_id is null then
    raise exception 'invalid signing link';
  end if;

  update public.signature_request_signers
  set status = 'declined', declined_at = now(), decline_reason = p_reason
  where id = v_signer_id and status = 'pending';

  if not found then
    raise exception 'this signing request is no longer pending';
  end if;

  update public.signature_requests set status = 'declined', updated_at = now() where id = v_request_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.decrypt_calendar_secret(p_ciphertext bytea)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select case when p_ciphertext is null then null
    else pgp_sym_decrypt(p_ciphertext, (select decrypted_secret from vault.decrypted_secrets where name = 'calendar_oauth_vault_key'))
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.decrypt_client_secret(p_ciphertext bytea)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select case when p_ciphertext is null then null
    else pgp_sym_decrypt(p_ciphertext, (select decrypted_secret from vault.decrypted_secrets where name = 'client_identity_vault_key'))
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.decrypt_firm_secret(p_ciphertext bytea)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select case when p_ciphertext is null then null
    else pgp_sym_decrypt(p_ciphertext, (select decrypted_secret from vault.decrypted_secrets where name = 'firm_tax_profile_key'))
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.decrypt_zoom_secret(p_ciphertext bytea)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select case when p_ciphertext is null then null
    else pgp_sym_decrypt(p_ciphertext, (select decrypted_secret from vault.decrypted_secrets where name = 'zoom_oauth_vault_key'))
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_client_email(p_email_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.client_emails where id = p_email_id;
  if v_workspace_id is null then
    raise exception 'email not found';
  end if;
  if not has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;
  delete from public.client_emails where id = p_email_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_client_phone(p_phone_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.client_phones where id = p_phone_id;
  if v_workspace_id is null then
    raise exception 'phone not found';
  end if;
  if not has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;
  delete from public.client_phones where id = p_phone_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_platform_system_credential(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_platform_it() then
    raise exception 'insufficient permissions to manage system credentials';
  end if;

  delete from public.platform_system_credentials where id = p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_process_stage(p_stage_id uuid, p_destination_stage_id uuid DEFAULT NULL::uuid, p_new_stage_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage record;
  v_process record;
  v_stage_count int;
  v_affected int;
  v_destination_name text;
  v_next_order int;
  v_automation_names text;
begin
  select ps.id, ps.process_id, ps.name into v_stage from process_stages ps where ps.id = p_stage_id;
  if v_stage.id is null then
    raise exception 'stage % not found', p_stage_id;
  end if;

  select p.id, p.workspace_id into v_process from processes p where p.id = v_stage.process_id;
  if v_process.workspace_id is null then
    raise exception 'cannot edit a system default workflow -- clone the service first';
  end if;
  if not is_workspace_admin(v_process.workspace_id) then
    raise exception 'insufficient permissions to edit this workflow';
  end if;

  select count(*) into v_stage_count from process_stages where process_id = v_process.id;
  if v_stage_count <= 1 then
    raise exception 'cannot delete the last stage of a workflow -- delete the service or process instead if it''s no longer needed';
  end if;

  select string_agg(distinct a.name, ', ')
    into v_automation_names
  from automations a
  left join automation_steps s on s.automation_id = a.id
  where a.workspace_id = v_process.workspace_id
    and (
      a.trigger_config ->> 'process_stage_id' = p_stage_id::text
      or s.action_config ->> 'process_stage_id' = p_stage_id::text
    );
  if v_automation_names is not null then
    raise exception 'this stage is still wired into automation(s): %. update or remove those steps first', v_automation_names;
  end if;

  select count(*) into v_affected from engagements where workflow_id = v_process.id and current_stage = v_stage.name;

  if v_affected > 0 then
    if p_destination_stage_id is not null then
      select name into v_destination_name from process_stages where id = p_destination_stage_id and process_id = v_process.id;
      if v_destination_name is null then
        raise exception 'destination stage does not belong to this workflow';
      end if;
    elsif p_new_stage_name is not null then
      select coalesce(max(display_order), 0) + 1 into v_next_order from process_stages where process_id = v_process.id;
      insert into process_stages (id, process_id, name, display_order)
      values (gen_random_uuid(), v_process.id, p_new_stage_name, v_next_order)
      returning name into v_destination_name;
    else
      raise exception '% engagement(s) are on this stage -- choose a destination', v_affected;
    end if;

    update engagements set current_stage = v_destination_name
    where workflow_id = v_process.id and current_stage = v_stage.name;
  end if;

  delete from process_stages where id = p_stage_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_workflow_pipeline(p_process_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_process record;
  v_engagement_count int;
  v_active_run_count int;
  v_automation_names text;
begin
  select id, workspace_id, name into v_process from processes where id = p_process_id;
  if v_process.id is null then
    raise exception 'pipeline % not found', p_process_id;
  end if;
  if v_process.workspace_id is null then
    raise exception 'cannot delete a system default pipeline -- clone it to create your own editable copy';
  end if;
  if not has_permission(v_process.workspace_id, 'pipelines.manage') then
    raise exception 'insufficient permissions to delete this pipeline';
  end if;

  select count(*) into v_engagement_count from engagements where workflow_id = p_process_id;
  if v_engagement_count > 0 then
    raise exception '% engagement(s) are still running this pipeline -- it can''t be deleted while they''re in progress', v_engagement_count;
  end if;

  select count(*) into v_active_run_count from pipeline_runs where process_id = p_process_id and status = 'Active';
  if v_active_run_count > 0 then
    raise exception '% lead(s) currently have an active run on this pipeline -- move or complete them first, or they''ll lose their progress', v_active_run_count;
  end if;

  select string_agg(distinct a.name, ', ')
    into v_automation_names
  from automations a
  left join automation_steps s on s.automation_id = a.id
  where a.workspace_id = v_process.workspace_id
    and (
      a.trigger_config ->> 'process_id' = p_process_id::text
      or s.action_config ->> 'process_id' = p_process_id::text
    );
  if v_automation_names is not null then
    raise exception 'this pipeline is still wired into automation(s): %. update or remove those steps first', v_automation_names;
  end if;

  update services set process_id = null where process_id = p_process_id;

  delete from processes where id = p_process_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_workspace_tag(p_workspace_id uuid, p_tag_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text;
  v_automation_names text[];
begin
  if not public.has_permission(p_workspace_id, 'automations.manage') then
    raise exception 'insufficient permissions to delete a tag in this workspace';
  end if;

  select name into v_name from public.workspace_tags where id = p_tag_id and workspace_id = p_workspace_id;
  if v_name is null then
    raise exception 'Tag not found in this workspace';
  end if;

  select array_agg(distinct a.name) into v_automation_names
  from public.automations a
  where a.workspace_id = p_workspace_id
    and (
      (a.trigger_type = 'client.tag_added' and a.trigger_config->>'tag' = v_name)
      or exists (
        select 1 from public.automation_steps s
        where s.automation_id = a.id and s.action_type in ('add_tag', 'remove_tag') and s.action_config->>'tag' = v_name
      )
      or exists (
        select 1 from public.automation_step_edges e, jsonb_array_elements(coalesce(e.branch_conditions, '[]'::jsonb)) as cond
        where e.automation_id = a.id and cond->>'field' = 'client.tags' and cond->>'value' = v_name
      )
    );

  if v_automation_names is not null and array_length(v_automation_names, 1) > 0 then
    raise exception 'Still used by: %. Update those automations before deleting this tag.', array_to_string(v_automation_names, ', ');
  end if;

  update public.clients set tags = array_remove(tags, v_name) where workspace_id = p_workspace_id and v_name = any(tags);
  delete from public.workspace_tags where id = p_tag_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.disconnect_firm_connection(p_connection_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.firm_connections;
  v_is_ero_admin boolean;
  v_is_ptin_admin boolean;
begin
  select * into v_row from public.firm_connections where id = p_connection_id for update;
  if v_row.id is null then
    raise exception 'connection not found';
  end if;

  v_is_ero_admin := public.is_workspace_admin(v_row.parent_workspace_id);
  v_is_ptin_admin := public.is_workspace_admin(v_row.child_workspace_id) and v_row.billing_responsibility <> 'ero';

  if not (v_is_ero_admin or v_is_ptin_admin) then
    raise exception 'Only the ERO, or an independently-billed PTIN, can disconnect this connection.';
  end if;

  if v_row.billing_responsibility = 'ero' then
    update public.workspace_subscriptions set seat_count = greatest(coalesce(seat_count, 1) - 1, 0), updated_at = now() where workspace_id = v_row.parent_workspace_id;
  end if;

  update public.firm_connections
  set status = 'revoked',
      billing_responsibility = 'ptin_self',
      responded_by = auth.uid(),
      responded_at = now(),
      updated_at = now()
  where id = p_connection_id;

  if v_is_ptin_admin and not v_is_ero_admin then
    if v_row.invited_by is not null then
      perform public.create_notification(
        v_row.parent_workspace_id, v_row.invited_by, 'FIRM_CONNECTION_REVOKED',
        'firm_connection_revoked', jsonb_build_object('firm_connection_id', p_connection_id),
        array['In-App'::text], 'Medium', 'firm_connection', p_connection_id
      );
    end if;
  else
    if v_row.responded_by is not null then
      perform public.create_notification(
        v_row.child_workspace_id, v_row.responded_by, 'FIRM_CONNECTION_REVOKED',
        'firm_connection_revoked', jsonb_build_object('firm_connection_id', p_connection_id),
        array['In-App'::text], 'Medium', 'firm_connection', p_connection_id
      );
    end if;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.disconnect_workspace_ghl(p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to disconnect GoHighLevel for this workspace';
  end if;
  delete from public.workspace_ghl_connections where workspace_id = p_workspace_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.disconnect_workspace_jotform(p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to disconnect JotForm for this workspace';
  end if;
  delete from public.workspace_jotform_connections where workspace_id = p_workspace_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.duplicate_config_object(p_table text, p_id uuid, p_target_workspace_id uuid DEFAULT NULL::uuid, p_new_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row jsonb;
  v_source_workspace_id uuid;
  v_dest_workspace_id uuid;
  v_new_id uuid := gen_random_uuid();
  v_new_slug text;
  v_source_process_id uuid;
  v_new_process_id uuid;
  v_map record;
begin
  if not public.is_valid_config_table(p_table) then
    raise exception 'unsupported config table: %', p_table;
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_table)
    into v_row using p_id;
  if v_row is null then
    raise exception '% % not found', p_table, p_id;
  end if;

  v_source_workspace_id := nullif(v_row->>'workspace_id', '')::uuid;
  v_dest_workspace_id := coalesce(p_target_workspace_id, v_source_workspace_id);

  if v_dest_workspace_id is null then
    raise exception 'a target workspace is required to duplicate a Verexa system object';
  end if;

  if p_table = 'processes' then
    if not public.has_permission(v_dest_workspace_id, 'pipelines.manage') then
      raise exception 'insufficient permissions to duplicate into this workspace';
    end if;
  elsif p_table = 'automations' then
    if not public.has_permission(v_dest_workspace_id, 'automations.manage') then
      raise exception 'insufficient permissions to duplicate into this workspace';
    end if;
  else
    if not public.is_workspace_admin(v_dest_workspace_id) then
      raise exception 'insufficient permissions to duplicate into this workspace';
    end if;
  end if;

  if v_source_workspace_id is not null and v_source_workspace_id <> v_dest_workspace_id then
    if not exists (
      select 1 from public.config_object_shares
      where object_type = p_table and object_id = p_id
        and shared_with_workspace_id = v_dest_workspace_id
        and status = 'pending'
    ) then
      raise exception 'cannot duplicate another workspace''s object without an active share to this workspace';
    end if;
  end if;

  v_new_slug := coalesce(v_row->>'slug', 'item') || '-copy-' || left(replace(v_new_id::text, '-', ''), 8);

  -- 'public_token'/'webhook_token' are included unconditionally:
  -- organizer_templates/engagement_letter_templates have a UNIQUE
  -- public_token, and automations has a UNIQUE webhook_token -- the
  -- naive to_jsonb() copy above carries the SOURCE row's value
  -- verbatim, which collides on insert. jsonb_populate_record ignores
  -- object keys with no matching column, so this is a harmless no-op
  -- for every config table type that doesn't have that column.
  v_row := v_row || jsonb_build_object(
    'id', v_new_id,
    'workspace_id', v_dest_workspace_id,
    'slug', v_new_slug,
    'status', 'draft',
    'public_token', gen_random_uuid(),
    'webhook_token', gen_random_uuid(),
    'created_at', now(),
    'updated_at', now()
  );
  if p_new_name is not null then
    v_row := v_row || jsonb_build_object('name', p_new_name);
  end if;
  if p_table = 'services' then
    v_row := v_row || jsonb_build_object('cloned_from_service_id', p_id);
  end if;

  execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', p_table, p_table)
    using v_row;

  if p_table = 'pipelines' then
    insert into public.pipeline_stages (id, pipeline_id, name, display_order, color, is_terminal)
    select gen_random_uuid(), v_new_id, name, display_order, color, is_terminal
    from public.pipeline_stages where pipeline_id = p_id;

  elsif p_table = 'document_request_templates' then
    insert into public.document_request_items (id, document_request_template_id, category, name, instructions, is_required, conditional_logic, display_order)
    select gen_random_uuid(), v_new_id, category, name, instructions, is_required, conditional_logic, display_order
    from public.document_request_items where document_request_template_id = p_id;

  elsif p_table = 'document_folder_templates' then
    create temporary table if not exists tmp_folder_item_map (old_id uuid primary key, new_id uuid) on commit drop;
    delete from tmp_folder_item_map where true;

    insert into tmp_folder_item_map (old_id, new_id)
    select id, gen_random_uuid() from public.document_folder_template_items where document_folder_template_id = p_id;

    insert into public.document_folder_template_items (id, document_folder_template_id, parent_item_id, name, display_order)
    select m.new_id, v_new_id, pm.new_id, i.name, i.display_order
    from public.document_folder_template_items i
    join tmp_folder_item_map m on m.old_id = i.id
    left join tmp_folder_item_map pm on pm.old_id = i.parent_item_id
    where i.document_folder_template_id = p_id;

  elsif p_table = 'automations' then
    create temporary table if not exists tmp_step_map (old_id uuid primary key, new_id uuid) on commit drop;
    delete from tmp_step_map where true;

    insert into tmp_step_map (old_id, new_id)
    select id, gen_random_uuid() from public.automation_steps where automation_id = p_id;

    insert into public.automation_steps (id, automation_id, display_order, action_type, action_config, delay_minutes, requires_approval, approver_role_id, canvas_x, canvas_y)
    select m.new_id, v_new_id, s.display_order, s.action_type, s.action_config, s.delay_minutes, s.requires_approval, s.approver_role_id, s.canvas_x, s.canvas_y
    from public.automation_steps s
    join tmp_step_map m on m.old_id = s.id
    where s.automation_id = p_id;

    insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
    select v_new_id, fm.new_id, tm.new_id, e.branch_conditions, e.label, e.sort_order
    from public.automation_step_edges e
    join tmp_step_map fm on fm.old_id = e.from_step_id
    left join tmp_step_map tm on tm.old_id = e.to_step_id
    where e.automation_id = p_id;

  elsif p_table = 'dashboards' then
    insert into public.dashboard_widgets (id, dashboard_id, widget_type, title, display_order, grid_position, config)
    select gen_random_uuid(), v_new_id, widget_type, title, display_order, grid_position, config
    from public.dashboard_widgets where dashboard_id = p_id;

  elsif p_table = 'organizer_templates' then
    create temporary table if not exists tmp_field_map (old_id uuid primary key, new_id uuid) on commit drop;
    delete from tmp_field_map where true;

    insert into tmp_field_map (old_id, new_id)
    select id, gen_random_uuid() from public.organizer_fields where organizer_template_id = p_id;

    insert into public.organizer_fields (id, organizer_template_id, parent_field_id, field_type, label, help_text, display_order, is_required, options, conditional_logic, validation)
    select m.new_id, v_new_id, pm.new_id, f.field_type, f.label, f.help_text, f.display_order, f.is_required, f.options, f.conditional_logic, f.validation
    from public.organizer_fields f
    join tmp_field_map m on m.old_id = f.id
    left join tmp_field_map pm on pm.old_id = f.parent_field_id
    where f.organizer_template_id = p_id;

    for v_map in select old_id, new_id from tmp_field_map loop
      update public.organizer_fields
      set conditional_logic = replace(conditional_logic::text, v_map.old_id::text, v_map.new_id::text)::jsonb
      where organizer_template_id = v_new_id and conditional_logic::text like '%' || v_map.old_id::text || '%';
    end loop;

  elsif p_table = 'processes' then
    create temporary table if not exists tmp_stage_map (old_id uuid primary key, new_id uuid) on commit drop;
    delete from tmp_stage_map where true;

    insert into tmp_stage_map (old_id, new_id)
    select id, gen_random_uuid() from public.process_stages where process_id = p_id;

    insert into public.process_stages (id, process_id, name, display_order, reviewer_role_id, completion_rule, due_date_rule, entry_conditions, notify_on_entry, expected_duration, warning_threshold, critical_threshold)
    select m.new_id, v_new_id, s.name, s.display_order, s.reviewer_role_id, s.completion_rule, s.due_date_rule, s.entry_conditions, s.notify_on_entry, s.expected_duration, s.warning_threshold, s.critical_threshold
    from public.process_stages s
    join tmp_stage_map m on m.old_id = s.id
    where s.process_id = p_id;

    insert into public.process_tasks (id, process_stage_id, name, description, display_order, assignee_role_id, is_required, due_date_rule, automation_trigger)
    select gen_random_uuid(), m.new_id, t.name, t.description, t.display_order, t.assignee_role_id, t.is_required, t.due_date_rule, t.automation_trigger
    from public.process_tasks t
    join tmp_stage_map m on m.old_id = t.process_stage_id;

  elsif p_table = 'services' then
    v_source_process_id := nullif(v_row->>'process_id', '')::uuid;
    if v_source_process_id is not null then
      v_new_process_id := gen_random_uuid();

      insert into public.processes (id, workspace_id, name, slug, description, status, created_by, created_at, updated_at)
      select v_new_process_id, v_dest_workspace_id, name,
             slug || '-copy-' || left(replace(v_new_process_id::text, '-', ''), 8),
             description, 'draft', auth.uid(), now(), now()
      from public.processes where id = v_source_process_id;

      create temporary table if not exists tmp_stage_map (old_id uuid primary key, new_id uuid) on commit drop;
      delete from tmp_stage_map where true;

      insert into tmp_stage_map (old_id, new_id)
      select id, gen_random_uuid() from public.process_stages where process_id = v_source_process_id;

      insert into public.process_stages (id, process_id, name, display_order, reviewer_role_id, completion_rule, due_date_rule, entry_conditions, notify_on_entry, expected_duration, warning_threshold, critical_threshold)
      select m.new_id, v_new_process_id, s.name, s.display_order, s.reviewer_role_id, s.completion_rule, s.due_date_rule, s.entry_conditions, s.notify_on_entry, s.expected_duration, s.warning_threshold, s.critical_threshold
      from public.process_stages s
      join tmp_stage_map m on m.old_id = s.id
      where s.process_id = v_source_process_id;

      insert into public.process_tasks (id, process_stage_id, name, description, display_order, assignee_role_id, is_required, due_date_rule, automation_trigger)
      select gen_random_uuid(), m.new_id, t.name, t.description, t.display_order, t.assignee_role_id, t.is_required, t.due_date_rule, t.automation_trigger
      from public.process_tasks t
      join tmp_stage_map m on m.old_id = t.process_stage_id;

      update public.services set process_id = v_new_process_id where id = v_new_id;
    end if;
  end if;

  return v_new_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.encrypt_calendar_secret(p_plaintext text)
 RETURNS bytea
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select case when p_plaintext is null or btrim(p_plaintext) = '' then null
    else pgp_sym_encrypt(p_plaintext, (select decrypted_secret from vault.decrypted_secrets where name = 'calendar_oauth_vault_key'))
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.encrypt_client_secret(p_plaintext text)
 RETURNS bytea
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select case when p_plaintext is null or btrim(p_plaintext) = '' then null
    else pgp_sym_encrypt(p_plaintext, (select decrypted_secret from vault.decrypted_secrets where name = 'client_identity_vault_key'))
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.encrypt_firm_secret(p_plaintext text)
 RETURNS bytea
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select case when p_plaintext is null or btrim(p_plaintext) = '' then null
    else pgp_sym_encrypt(p_plaintext, (select decrypted_secret from vault.decrypted_secrets where name = 'firm_tax_profile_key'))
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.encrypt_zoom_secret(p_plaintext text)
 RETURNS bytea
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select case when p_plaintext is null or btrim(p_plaintext) = '' then null
    else pgp_sym_encrypt(p_plaintext, (select decrypted_secret from vault.decrypted_secrets where name = 'zoom_oauth_vault_key'))
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_ero_efile_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_has_connection boolean;
  v_has_approved_share boolean;
begin
  if new.status = 'Ready To Release' and old.status is distinct from new.status then
    select exists (
      select 1 from public.firm_connections
      where child_workspace_id = new.workspace_id and relationship_type = 'ero_ptin' and status = 'active'
    ) into v_has_connection;

    if v_has_connection then
      select exists (
        select 1 from public.engagement_shares
        where engagement_id = new.id and status = 'approved'
      ) into v_has_approved_share;

      if not v_has_approved_share then
        raise exception 'This engagement must be approved by your connected ERO before it can be marked ready to release.';
      end if;
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_storage_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.check_storage_capacity(new.workspace_id, coalesce(new.file_size_bytes, 0)) then
    raise exception 'storage_limit_exceeded: this workspace has used its included storage and prepaid balance -- purchase a storage top-up to upload more';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.engagement_has_signed_letter(p_engagement_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.signature_requests sr
    join public.attachments a on a.id = sr.attachment_id
    where a.entity_type = 'engagement'
      and a.entity_id = p_engagement_id
      and sr.status = 'completed'
      and sr.engagement_letter_template_id is not null
  );
$function$
;

CREATE OR REPLACE FUNCTION public.engagement_meets_payment_requirement(p_engagement_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when not coalesce((select s.requires_payment_before_release from public.engagements e join public.services s on s.id = e.service_id where e.id = p_engagement_id), false)
      then true
    else exists (select 1 from public.invoices i where i.engagement_id = p_engagement_id)
      and not exists (select 1 from public.invoices i where i.engagement_id = p_engagement_id and i.status not in ('paid', 'void'))
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_calendar_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    if old.staff_id is not null then
      insert into public.calendar_sync_queue (appointment_id, staff_id, action, title, description, location, meeting_url, start_at, end_at)
      values (old.id, old.staff_id, 'delete', old.title, old.description, old.location, old.meeting_url, old.start_at, old.end_at);
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.title is not distinct from old.title
      and new.start_at is not distinct from old.start_at
      and new.end_at is not distinct from old.end_at
      and new.location is not distinct from old.location
      and new.meeting_url is not distinct from old.meeting_url
      and new.description is not distinct from old.description
      and new.status is not distinct from old.status
      and new.staff_id is not distinct from old.staff_id
    then
      return new;
    end if;

    -- Reassigning staff: clean up the old preparer's calendar too, or the
    -- event would sit there forever as a stale ghost meeting.
    if old.staff_id is not null and old.staff_id is distinct from new.staff_id then
      insert into public.calendar_sync_queue (appointment_id, staff_id, action, title, description, location, meeting_url, start_at, end_at)
      values (old.id, old.staff_id, 'delete', old.title, old.description, old.location, old.meeting_url, old.start_at, old.end_at);
    end if;
  end if;

  if new.staff_id is not null then
    insert into public.calendar_sync_queue (appointment_id, staff_id, action, title, description, location, meeting_url, start_at, end_at)
    values (
      new.id, new.staff_id,
      case when new.status = 'cancelled' then 'delete' else 'upsert' end,
      new.title, new.description, new.location, new.meeting_url, new.start_at, new.end_at
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_payment_receipt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
  v_email text;
  v_invoice_number text;
begin
  if NEW.client_id is null then
    return NEW;
  end if;

  select cpu.user_id, u.email into v_user_id, v_email
  from public.client_portal_users cpu
  join auth.users u on u.id = cpu.user_id
  where cpu.client_id = NEW.client_id and cpu.is_primary = true and cpu.status = 'active'
  limit 1;

  if v_user_id is null then
    return NEW;
  end if;

  if NEW.invoice_id is not null then
    select invoice_number into v_invoice_number from public.invoices where id = NEW.invoice_id;
  end if;

  if public.is_notification_enabled(v_user_id, NEW.workspace_id, 'payment_receipt', 'Email') then
    insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
    values (NEW.workspace_id, 'Email', 'payment-receipt', 'payment_receipt',
            jsonb_build_object('invoice_number', coalesce(v_invoice_number, 'N/A'), 'amount', NEW.amount, 'payment_date', NEW.payment_date),
            v_user_id, v_email, 'payment_receipt:' || NEW.id)
    on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_reminder_notifications()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select i.id, i.workspace_id, i.due_date, i.total_amount, i.amount_paid, i.invoice_number, i.client_id,
           cpu.user_id, u.email, c.primary_phone
    from public.invoices i
    join public.client_portal_users cpu on cpu.client_id = i.client_id and cpu.is_primary = true and cpu.status = 'active'
    join auth.users u on u.id = cpu.user_id
    join public.clients c on c.id = i.client_id
    where i.status not in ('paid', 'void', 'draft')
      and i.amount_paid < i.total_amount
      and i.due_date is not null
      and i.due_date between now() and now() + interval '3 days'
  loop
    if public.is_notification_enabled(r.user_id, r.workspace_id, 'invoice_due', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'Email', 'invoice-due-reminder', 'invoice_due',
              jsonb_build_object('invoice_number', r.invoice_number, 'due_date', r.due_date, 'amount_due', r.total_amount - r.amount_paid),
              r.user_id, r.email, 'invoice_due:' || r.id, 'client', r.client_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.primary_phone is not null and public.is_notification_enabled(r.user_id, r.workspace_id, 'invoice_due', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'SMS', 'invoice-due-reminder-sms', 'invoice_due',
              jsonb_build_object('invoice_number', r.invoice_number, 'due_date', r.due_date, 'amount_due', r.total_amount - r.amount_paid),
              r.user_id, r.primary_phone, 'invoice_due:' || r.id, 'client', r.client_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select s.id as signer_id, sr.workspace_id, sr.due_date, sr.title, s.signer_name, s.signer_email
    from public.signature_request_signers s
    join public.signature_requests sr on sr.id = s.signature_request_id
    where s.status = 'pending'
      and sr.status = 'pending'
      and sr.due_date is not null
      and sr.due_date between now() and now() + interval '2 days'
      and s.signer_email is not null
  loop
    insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_email, dedupe_key)
    values (r.workspace_id, 'Email', 'signature-due-reminder', 'signature_due',
            jsonb_build_object('signer_name', r.signer_name, 'document_title', r.title, 'due_date', r.due_date),
            r.signer_email, 'signature_due:' || r.signer_id)
    on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;

  for r in
    select ps.id as stage_id, pr.workspace_id, pr.entity_id as engagement_id, ps.due_date, ps.stage_name, ps.reviewer_id, u.email, up.phone
    from public.pipeline_stages ps
    join public.pipeline_runs pr on pr.id = ps.pipeline_run_id
    join auth.users u on u.id = ps.reviewer_id
    left join public.user_profiles up on up.id = ps.reviewer_id
    where pr.entity_type = 'engagement'
      and ps.status in ('Pending', 'In Progress', 'Waiting')
      and ps.due_date is not null
      and ps.due_date between now() and now() + interval '2 days'
      and ps.reviewer_id is not null
  loop
    if public.is_notification_enabled(r.reviewer_id, r.workspace_id, 'workflow_stage_due', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'Email', 'workflow-stage-due-reminder', 'workflow_stage_due',
              jsonb_build_object('stage_name', r.stage_name, 'due_date', r.due_date),
              r.reviewer_id, r.email, 'workflow_stage_due:' || r.stage_id, 'engagement', r.engagement_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.phone is not null and public.is_notification_enabled(r.reviewer_id, r.workspace_id, 'workflow_stage_due', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'SMS', 'workflow-stage-due-reminder-sms', 'workflow_stage_due',
              jsonb_build_object('stage_name', r.stage_name, 'due_date', r.due_date),
              r.reviewer_id, r.phone, 'workflow_stage_due:' || r.stage_id, 'engagement', r.engagement_id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select a.id, a.workspace_id, a.title, a.start_at, a.location, a.staff_id, u.email, up.phone
    from public.appointments a
    join auth.users u on u.id = a.staff_id
    left join public.user_profiles up on up.id = a.staff_id
    where a.status in ('scheduled', 'confirmed')
      and a.start_at between now() and now() + interval '1 day'
      and a.staff_id is not null
  loop
    if public.is_notification_enabled(r.staff_id, r.workspace_id, 'appointment_reminder', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
      values (r.workspace_id, 'Email', 'appointment-reminder', 'appointment_reminder',
              jsonb_build_object('title', r.title, 'start_at', r.start_at, 'location', coalesce(r.location, 'Not specified')),
              r.staff_id, r.email, 'appointment_staff:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.phone is not null and public.is_notification_enabled(r.staff_id, r.workspace_id, 'appointment_reminder', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key)
      values (r.workspace_id, 'SMS', 'appointment-reminder-sms', 'appointment_reminder',
              jsonb_build_object('title', r.title, 'start_at', r.start_at, 'location', coalesce(r.location, 'Not specified')),
              r.staff_id, r.phone, 'appointment_staff:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select a.id, a.workspace_id, a.title, a.start_at, a.location, a.client_id, cpu.user_id, u.email, c.primary_phone
    from public.appointments a
    join public.client_portal_users cpu on cpu.client_id = a.client_id and cpu.is_primary = true and cpu.status = 'active'
    join auth.users u on u.id = cpu.user_id
    join public.clients c on c.id = a.client_id
    where a.status in ('scheduled', 'confirmed')
      and a.portal_visible = true
      and a.client_id is not null
      and a.start_at between now() and now() + interval '1 day'
  loop
    if public.is_notification_enabled(r.user_id, r.workspace_id, 'appointment_reminder', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
      values (r.workspace_id, 'Email', 'appointment-reminder', 'appointment_reminder',
              jsonb_build_object('title', r.title, 'start_at', r.start_at, 'location', coalesce(r.location, 'Not specified')),
              r.user_id, r.email, 'appointment_client:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.primary_phone is not null and public.is_notification_enabled(r.user_id, r.workspace_id, 'appointment_reminder', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key)
      values (r.workspace_id, 'SMS', 'appointment-reminder-sms', 'appointment_reminder',
              jsonb_build_object('title', r.title, 'start_at', r.start_at, 'location', coalesce(r.location, 'Not specified')),
              r.user_id, r.primary_phone, 'appointment_client:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select i.id, i.workspace_id, i.invoice_number, i.expected_deposit_date, i.payment_method,
           i.total_amount - i.amount_paid as amount_due,
           coalesce(e.assigned_staff_id, admin.user_id) as recipient_user_id,
           u.email, up.phone
    from public.invoices i
    left join public.engagements e on e.id = i.engagement_id
    left join lateral (
      select wu.user_id
      from public.workspace_users wu
      join public.roles ro on ro.id = wu.role_id
      where wu.workspace_id = i.workspace_id
        and wu.status = 'active'
        and (wu.is_owner or ro.slug in ('owner', 'admin'))
      order by wu.is_owner desc, wu.created_at asc
      limit 1
    ) admin on true
    join auth.users u on u.id = coalesce(e.assigned_staff_id, admin.user_id)
    left join public.user_profiles up on up.id = coalesce(e.assigned_staff_id, admin.user_id)
    where i.status not in ('paid', 'void', 'draft')
      and i.expected_deposit_date is not null
      and i.expected_deposit_date <= current_date
  loop
    if public.is_notification_enabled(r.recipient_user_id, r.workspace_id, 'funds_received_reminder', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
      values (r.workspace_id, 'Email', 'funds-received-reminder', 'funds_received_reminder',
              jsonb_build_object('invoice_number', r.invoice_number, 'expected_deposit_date', r.expected_deposit_date, 'payment_method', coalesce(r.payment_method, 'N/A'), 'amount_due', r.amount_due),
              r.recipient_user_id, r.email, 'funds_received_reminder:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.phone is not null and public.is_notification_enabled(r.recipient_user_id, r.workspace_id, 'funds_received_reminder', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key)
      values (r.workspace_id, 'SMS', 'funds-received-reminder-sms', 'funds_received_reminder',
              jsonb_build_object('invoice_number', r.invoice_number, 'expected_deposit_date', r.expected_deposit_date, 'payment_method', coalesce(r.payment_method, 'N/A'), 'amount_due', r.amount_due),
              r.recipient_user_id, r.phone, 'funds_received_reminder:' || r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select ws.id, ws.workspace_id, ws.current_period_end,
           admin.user_id as recipient_user_id, u.email, up.phone
    from public.workspace_subscriptions ws
    left join lateral (
      select wu.user_id
      from public.workspace_users wu
      join public.roles ro on ro.id = wu.role_id
      where wu.workspace_id = ws.workspace_id
        and wu.status = 'active'
        and (wu.is_owner or ro.slug in ('owner', 'admin'))
      order by wu.is_owner desc, wu.created_at asc
      limit 1
    ) admin on true
    join auth.users u on u.id = admin.user_id
    left join public.user_profiles up on up.id = admin.user_id
    where ws.stripe_status in ('trialing', 'active', 'past_due')
      and ws.current_period_end is not null
      and ws.current_period_end - interval '7 days' between now() and now() + interval '1 day'
  loop
    if public.is_notification_enabled(r.recipient_user_id, r.workspace_id, 'subscription_renewal_reminder', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
      values (r.workspace_id, 'Email', 'subscription-renewal-reminder', 'subscription_renewal_reminder',
              jsonb_build_object('renewal_date', r.current_period_end),
              r.recipient_user_id, r.email, 'subscription_renewal_reminder:' || r.id || ':' || r.current_period_end::text)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.phone is not null and public.is_notification_enabled(r.recipient_user_id, r.workspace_id, 'subscription_renewal_reminder', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key)
      values (r.workspace_id, 'SMS', 'subscription-renewal-reminder-sms', 'subscription_renewal_reminder',
              jsonb_build_object('renewal_date', r.current_period_end),
              r.recipient_user_id, r.phone, 'subscription_renewal_reminder:' || r.id || ':' || r.current_period_end::text)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  for r in
    select dr.id, dr.workspace_id, dr.title, dr.due_date, cpu.user_id, u.email, c.primary_phone
    from public.document_requests dr
    left join public.engagements e on dr.entity_type = 'engagement' and e.id = dr.entity_id
    join public.client_portal_users cpu
      on cpu.client_id = case when dr.entity_type = 'client' then dr.entity_id else e.client_id end
      and cpu.is_primary = true and cpu.status = 'active'
    join auth.users u on u.id = cpu.user_id
    join public.clients c on c.id = cpu.client_id
    where dr.status = 'open'
      and dr.due_date is not null
      and dr.due_date between now() and now() + interval '2 days'
  loop
    if public.is_notification_enabled(r.user_id, r.workspace_id, 'document_request_due', 'Email') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'Email', 'document-request-due-reminder', 'document_request_due',
              jsonb_build_object('title', r.title, 'due_date', r.due_date),
              r.user_id, r.email, 'document_request_due:' || r.id, 'document_request', r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
    if r.primary_phone is not null and public.is_notification_enabled(r.user_id, r.workspace_id, 'document_request_due', 'SMS') then
      insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_phone, dedupe_key, entity_type, entity_id)
      values (r.workspace_id, 'SMS', 'document-request-due-reminder-sms', 'document_request_due',
              jsonb_build_object('title', r.title, 'due_date', r.due_date),
              r.user_id, r.primary_phone, 'document_request_due:' || r.id, 'document_request', r.id)
      on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      if found then v_count := v_count + 1; end if;
    end if;
  end loop;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_default_dashboard(p_workspace_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dashboard_id uuid;
  v_widget_count int;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace';
  end if;

  select id into v_dashboard_id from public.dashboards
  where workspace_id = p_workspace_id and is_default limit 1;

  if v_dashboard_id is null then
    insert into public.dashboards (workspace_id, name, slug, is_default, status, created_by)
    values (p_workspace_id, 'Executive Dashboard', 'executive', true, 'published', auth.uid())
    returning id into v_dashboard_id;
  end if;

  select count(*) into v_widget_count from public.dashboard_widgets where dashboard_id = v_dashboard_id;

  if v_widget_count = 0 then
    insert into public.dashboard_widgets (dashboard_id, widget_type, title, display_order, config)
    values
      (v_dashboard_id, 'revenue', 'Revenue This Month', 1, '{}'::jsonb),
      (v_dashboard_id, 'kpis', 'Engagements & Tasks', 2, '{}'::jsonb),
      (v_dashboard_id, 'collections', 'Outstanding Invoices', 3, '{}'::jsonb),
      (v_dashboard_id, 'missing_documents', 'Missing Documents', 4, '{}'::jsonb),
      (v_dashboard_id, 'messages', 'Open Client Messages', 5, '{}'::jsonb),
      (v_dashboard_id, 'todays_work', 'Today''s Priorities', 6, '{}'::jsonb),
      (v_dashboard_id, 'review_queue', 'Review Queue', 7, '{}'::jsonb),
      (v_dashboard_id, 'quick_actions', 'Quick Actions', 8, '{}'::jsonb),
      (v_dashboard_id, 'calendar', 'Calendar', 9, '{}'::jsonb),
      (v_dashboard_id, 'recent_activity', 'Recent Activity', 10, '{}'::jsonb),
      (v_dashboard_id, 'top_services', 'Top Services', 11, '{}'::jsonb),
      (v_dashboard_id, 'engagement_pipeline', 'Engagement Pipeline', 12, '{}'::jsonb),
      (v_dashboard_id, 'stage_breakdown', 'Stage Breakdown', 13, '{}'::jsonb),
      (v_dashboard_id, 'deadline_risk', 'Deadline Risk', 14, '{}'::jsonb);
  end if;

  return v_dashboard_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_next_tax_year()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_year int;
begin
  v_year := extract(year from now())::int + 1;
  insert into public.tax_years (year)
  values (v_year)
  on conflict (year) do nothing;
  return v_year;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_workspace_security_policy(p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_permission(p_workspace_id, 'security.manage') then
    raise exception 'insufficient permissions to manage security policy for this workspace';
  end if;

  insert into workspace_security_policies (workspace_id)
  values (p_workspace_id)
  on conflict (workspace_id) do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.escape_html(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select replace(replace(replace(replace(replace(
    coalesce(p_text, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$function$
;

CREATE OR REPLACE FUNCTION public.evaluate_automation_conditions(p_conditions jsonb, p_context jsonb, p_workspace_id uuid, p_client_id uuid, p_engagement_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_group jsonb;
  v_group_join text;
  v_group_result boolean;
  v_overall_result boolean;
  v_index int := 0;
begin
  if p_conditions is null or jsonb_array_length(p_conditions) = 0 then
    return true;
  end if;

  if (p_conditions->0) ? 'conditions' then
    for v_group in select * from jsonb_array_elements(p_conditions)
    loop
      v_index := v_index + 1;
      v_group_join := coalesce(v_group->>'join', 'and');
      v_group_result := public._evaluate_condition_list(coalesce(v_group->'conditions', '[]'::jsonb), p_context, p_workspace_id, p_client_id, p_engagement_id);
      if v_index = 1 then
        v_overall_result := v_group_result;
      elsif v_group_join = 'or' then
        v_overall_result := v_overall_result or v_group_result;
      else
        v_overall_result := v_overall_result and v_group_result;
      end if;
    end loop;
    return v_overall_result;
  else
    return public._evaluate_condition_list(p_conditions, p_context, p_workspace_id, p_client_id, p_engagement_id);
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.execute_automation_step(p_run_id uuid, p_step_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run record;
  v_step record;
  v_eng record;
  v_workspace record;
  v_branding record;
  v_context jsonb;
  v_status text := 'completed';
  v_error text;
  v_skip_note text;
  v_response record;
  v_service record;
  v_new_engagement_id uuid;
  v_doc_request_id uuid;
  v_doc_request_entity_type text;
  v_doc_request_entity_id uuid;
  v_target_stage_id uuid;
  v_target_order int;
  v_current_order int;
  v_loop_guard int;
  v_thread_id uuid;
  v_new_client_id uuid;
  v_normalized_email text;
  v_normalized_phone text;
  v_quote_id uuid;
  v_child_run_id uuid;
  v_portal_user_id uuid;
  v_channels text[];
  v_recipient record;
  v_organizer_link text;
  v_base_url text;
  v_resolved_organizer_template_id uuid;
  v_assign_target text;
  v_assignment_mode text;
  v_resolved_staff_id uuid;
  v_appointment_start timestamptz;
  v_appointment_end timestamptz;
  v_dnd_channel text;
  v_resolved_service_id uuid;
  v_target_process_id uuid;
  v_link_template_id_raw text;
  v_pipeline_entity_type text;
  v_pipeline_entity_id uuid;
  v_pipeline_run_id uuid;
  v_pipeline_stage_id uuid;
  v_rendered_message text;
begin
  select * into v_run from public.automation_runs where id = p_run_id;
  select * into v_step from public.automation_steps where id = p_step_id;

  if v_run.engagement_id is not null then
    select e.engagement_number, e.status, e.priority, e.service_id, c.first_name, c.last_name, c.primary_email, c.primary_phone,
      c.sms_opt_out, c.email_opt_out, c.relationship_manager_id
    into v_eng
    from public.engagements e
    left join public.clients c on c.id = e.client_id
    where e.id = v_run.engagement_id;
  elsif v_run.client_id is not null then
    select null::text as engagement_number, null::text as status, null::text as priority, null::uuid as service_id,
      c.first_name, c.last_name, c.primary_email, c.primary_phone, c.sms_opt_out, c.email_opt_out, c.relationship_manager_id
    into v_eng
    from public.clients c
    where c.id = v_run.client_id;
  end if;

  select name, timezone into v_workspace from public.workspaces where id = v_run.workspace_id;
  select support_phone, support_email, custom_domain into v_branding from public.branding where workspace_id = v_run.workspace_id;

  v_context := jsonb_build_object(
    'engagement_number', v_eng.engagement_number,
    'client_name', btrim(coalesce(v_eng.first_name, '') || ' ' || coalesce(v_eng.last_name, '')),
    'first_name', v_eng.first_name,
    'firm_name', v_workspace.name,
    'status', v_eng.status,
    'tax_year', (extract(year from now())::int - 1)::text,
    'office_phone', v_branding.support_phone,
    'office_email', v_branding.support_email,
    'portal_link', 'https://verexahq.com/portal/login'
  );

  begin
    if v_step.action_type = 'delay' then
      null;
    elsif v_step.action_type = 'business_hours_delay' then
      null;
    elsif v_step.action_type = 'condition' then
      null;
    elsif v_step.action_type = 'webhook' then
      if nullif(v_step.action_config->>'url', '') is null then
        raise exception 'No URL configured for this step';
      end if;
      insert into public.automation_webhook_deliveries (workspace_id, run_id, url, payload)
      values (
        v_run.workspace_id, p_run_id, v_step.action_config->>'url',
        v_context || jsonb_build_object('trigger', v_run.trigger_snapshot)
      );
    elsif v_step.action_type = 'send_email' then
      if v_eng.primary_email is null then
        raise exception 'Client has no email on file';
      end if;
      if v_eng.email_opt_out then
        v_skip_note := 'client has opted out of email';
      else
        v_link_template_id_raw := nullif(v_step.action_config->>'organizer_template_id', '');
        if v_link_template_id_raw is not null then
          v_resolved_organizer_template_id := case
            when v_link_template_id_raw = 'current_run' then nullif(v_run.trigger_snapshot->>'last_organizer_template_id', '')::uuid
            else v_link_template_id_raw::uuid
          end;
          v_base_url := 'https://' || coalesce(nullif(v_branding.custom_domain, ''), 'verexahq.com');
          select v_base_url || '/o/' || public_token::text into v_organizer_link
          from public.organizer_templates where id = v_resolved_organizer_template_id;
          v_context := v_context || jsonb_build_object('organizer_link', v_organizer_link);
        end if;
        insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
        values (
          v_run.workspace_id, v_eng.primary_email, 'Email', v_step.action_config->>'template_slug', v_context,
          case when v_run.engagement_id is not null then 'engagement' else 'client' end,
          coalesce(v_run.engagement_id, v_run.client_id),
          'automation', 'automation_step:' || p_step_id || ':' || p_run_id
        )
        on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      end if;
    elsif v_step.action_type = 'send_sms' then
      if v_eng.primary_phone is null then
        raise exception 'Client has no phone on file';
      end if;
      if v_eng.sms_opt_out then
        v_skip_note := 'client has opted out of sms';
      else
        v_link_template_id_raw := nullif(v_step.action_config->>'organizer_template_id', '');
        if v_link_template_id_raw is not null then
          v_resolved_organizer_template_id := case
            when v_link_template_id_raw = 'current_run' then nullif(v_run.trigger_snapshot->>'last_organizer_template_id', '')::uuid
            else v_link_template_id_raw::uuid
          end;
          v_base_url := 'https://' || coalesce(nullif(v_branding.custom_domain, ''), 'verexahq.com');
          select v_base_url || '/o/' || public_token::text into v_organizer_link
          from public.organizer_templates where id = v_resolved_organizer_template_id;
          v_context := v_context || jsonb_build_object('organizer_link', v_organizer_link);
        end if;
        insert into public.notification_queue (workspace_id, recipient_phone, channel, template_key, payload, entity_type, entity_id, event_type, dedupe_key)
        values (
          v_run.workspace_id, v_eng.primary_phone, 'SMS', v_step.action_config->>'template_slug', v_context,
          case when v_run.engagement_id is not null then 'engagement' else 'client' end,
          coalesce(v_run.engagement_id, v_run.client_id),
          'automation', 'automation_step:' || p_step_id || ':' || p_run_id
        )
        on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
      end if;
    elsif v_step.action_type = 'create_task' then
      if v_run.engagement_id is null and v_run.client_id is null then
        raise exception 'This workflow run has no engagement or client to attach a task to';
      end if;
      insert into public.tasks (workspace_id, engagement_id, client_id, title, description, assigned_staff_id, due_date, priority, visibility)
      values (
        v_run.workspace_id, v_run.engagement_id, case when v_run.engagement_id is null then v_run.client_id else null end,
        public.render_merge_fields(coalesce(v_step.action_config->>'title', 'Automated task'), v_context),
        public.render_merge_fields(v_step.action_config->>'description', v_context),
        case when v_step.action_config->>'assigned_staff_id' = 'client_relationship_manager' then v_eng.relationship_manager_id
             else nullif(v_step.action_config->>'assigned_staff_id', '')::uuid end,
        case when v_step.action_config ? 'due_in_days' then now() + make_interval(days => (v_step.action_config->>'due_in_days')::int) else null end,
        coalesce(v_step.action_config->>'priority', 'medium'),
        coalesce(nullif(v_step.action_config->>'visibility', ''), 'internal')
      );
    elsif v_step.action_type = 'create_appointment' then
      if v_run.engagement_id is null and v_run.client_id is null then
        raise exception 'This workflow run has no engagement or client to schedule an appointment for';
      end if;

      v_appointment_start := (
        (current_date + coalesce((v_step.action_config->>'days_from_now')::int, 1))
        + coalesce(nullif(v_step.action_config->>'time_of_day', '')::time, '10:00'::time)
      ) at time zone coalesce(nullif(v_workspace.timezone, ''), 'America/New_York');
      v_appointment_end := v_appointment_start + make_interval(mins => coalesce((v_step.action_config->>'duration_minutes')::int, 30));

      insert into public.appointments (workspace_id, client_id, engagement_id, staff_id, title, description, location, start_at, end_at, status)
      values (
        v_run.workspace_id, v_run.client_id, v_run.engagement_id,
        nullif(v_step.action_config->>'staff_id', '')::uuid,
        public.render_merge_fields(coalesce(v_step.action_config->>'title', 'Appointment'), v_context),
        nullif(public.render_merge_fields(v_step.action_config->>'description', v_context), ''),
        nullif(v_step.action_config->>'location', ''),
        v_appointment_start, v_appointment_end, 'scheduled'
      );
    elsif v_step.action_type = 'add_dnd' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to opt out';
      end if;
      v_dnd_channel := coalesce(nullif(v_step.action_config->>'channel', ''), 'both');
      update public.clients
      set sms_opt_out = case when v_dnd_channel in ('sms', 'both') then true else sms_opt_out end,
          sms_opt_out_at = case when v_dnd_channel in ('sms', 'both') then now() else sms_opt_out_at end,
          email_opt_out = case when v_dnd_channel in ('email', 'both') then true else email_opt_out end,
          email_opt_out_at = case when v_dnd_channel in ('email', 'both') then now() else email_opt_out_at end
      where id = v_run.client_id;
    elsif v_step.action_type = 'remove_dnd' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to opt back in';
      end if;
      v_dnd_channel := coalesce(nullif(v_step.action_config->>'channel', ''), 'both');
      update public.clients
      set sms_opt_out = case when v_dnd_channel in ('sms', 'both') then false else sms_opt_out end,
          sms_opt_out_at = case when v_dnd_channel in ('sms', 'both') then null else sms_opt_out_at end,
          email_opt_out = case when v_dnd_channel in ('email', 'both') then false else email_opt_out end,
          email_opt_out_at = case when v_dnd_channel in ('email', 'both') then null else email_opt_out_at end
      where id = v_run.client_id;
    elsif v_step.action_type = 'send_organizer_template' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to send an organizer to';
      end if;

      v_resolved_service_id := coalesce(
        nullif(v_run.trigger_snapshot->>'service_id', '')::uuid,
        (
          select service_id
          from public.client_service_interests
          where client_id = v_run.client_id
          order by created_at desc
          limit 1
        )
      );

      v_resolved_organizer_template_id := coalesce(
        nullif(v_step.action_config->>'organizer_template_id', '')::uuid,
        (
          select ot.id
          from public.services s
          join public.organizer_templates svc_ot on svc_ot.id = s.organizer_template_id
          join public.organizer_templates ot
            on ot.slug = svc_ot.slug
            and ot.workspace_id = v_run.workspace_id
          where s.id = v_resolved_service_id
          limit 1
        )
      );

      if v_resolved_organizer_template_id is null then
        raise exception 'Could not determine which organizer to send -- no service on file for this client and no organizer template configured on this step';
      end if;

      insert into public.organizer_responses (workspace_id, client_id, engagement_id, organizer_template_id)
      values (v_run.workspace_id, v_run.client_id, v_run.engagement_id, v_resolved_organizer_template_id);

      update public.automation_runs
      set trigger_snapshot = coalesce(trigger_snapshot, '{}'::jsonb) || jsonb_build_object('last_organizer_template_id', v_resolved_organizer_template_id)
      where id = p_run_id;
    elsif v_step.action_type = 'create_engagement' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to create an engagement for';
      end if;
      if v_run.trigger_snapshot->>'response_id' is null then
        raise exception 'This action only works on a run triggered by an organizer submission';
      end if;

      select id, resolved_service_id, needs_service_review into v_response
      from public.organizer_responses where id = (v_run.trigger_snapshot->>'response_id')::uuid;

      if v_response.id is null or v_response.needs_service_review or v_response.resolved_service_id is null then
        raise exception 'The organizer response needs a service manually resolved before an engagement can be created';
      end if;

      select id into v_service from public.services where id = v_response.resolved_service_id;

      insert into public.engagements (workspace_id, client_id, service_id)
      values (v_run.workspace_id, v_run.client_id, v_service.id)
      returning id into v_new_engagement_id;
    elsif v_step.action_type = 'send_engagement_letter' then
      if v_run.engagement_id is null then
        raise exception 'This workflow run has no engagement to send an engagement letter for';
      end if;
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to send an engagement letter to';
      end if;

      v_resolved_organizer_template_id := coalesce(
        nullif(v_step.action_config->>'engagement_letter_template_id', '')::uuid,
        (select engagement_letter_template_id from public.services where id = v_eng.service_id)
      );

      if v_resolved_organizer_template_id is null then
        raise exception 'No engagement letter template configured for this step or its service';
      end if;

      insert into public.pending_engagement_letter_sends (workspace_id, engagement_id, client_id, engagement_letter_template_id, additional_signer_relationship_type)
      values (v_run.workspace_id, v_run.engagement_id, v_run.client_id, v_resolved_organizer_template_id, nullif(v_step.action_config->>'additional_signer_relationship_type', ''));
    elsif v_step.action_type = 'change_stage' then
      if v_run.engagement_id is not null then
        v_pipeline_entity_type := 'engagement';
        v_pipeline_entity_id := v_run.engagement_id;
      elsif v_run.client_id is not null then
        v_pipeline_entity_type := 'client';
        v_pipeline_entity_id := v_run.client_id;
      else
        raise exception 'This workflow run has no engagement or client to advance';
      end if;

      select current_stage_id into v_pipeline_stage_id
      from public.pipeline_runs
      where entity_type = v_pipeline_entity_type and entity_id = v_pipeline_entity_id and status = 'Active'
      order by started_at desc limit 1;

      if v_pipeline_stage_id is null then
        raise exception 'This % has no active pipeline stage to advance', v_pipeline_entity_type;
      end if;

      update public.pipeline_stages set status = 'Completed', completed_at = now() where id = v_pipeline_stage_id;
    elsif v_step.action_type = 'send_document_request' then
      if v_run.engagement_id is null and v_run.client_id is null then
        raise exception 'This workflow run has no engagement or client to attach a document request to';
      end if;
      if nullif(v_step.action_config->>'document_request_template_id', '') is null then
        raise exception 'No document request template configured for this step';
      end if;

      v_doc_request_entity_type := case when v_run.engagement_id is not null then 'engagement' else 'client' end;
      v_doc_request_entity_id := coalesce(v_run.engagement_id, v_run.client_id);

      insert into public.document_requests (workspace_id, entity_type, entity_id, document_request_template_id, title, due_date)
      values (
        v_run.workspace_id, v_doc_request_entity_type, v_doc_request_entity_id,
        (v_step.action_config->>'document_request_template_id')::uuid,
        coalesce(public.render_merge_fields(v_step.action_config->>'title', v_context), 'Requested documents'),
        case when v_step.action_config ? 'due_in_days' then (now() + make_interval(days => (v_step.action_config->>'due_in_days')::int))::date else null end
      )
      returning id into v_doc_request_id;

      insert into public.document_request_item_statuses (document_request_id, document_request_item_id, name, is_required, category, status, fulfilled_by_attachment_id)
      select
        v_doc_request_id, dri.id, dri.name, dri.is_required, dri.category,
        coalesce(prior.status, 'pending'), prior.fulfilled_by_attachment_id
      from public.document_request_items dri
      left join lateral (
        select s.status, s.fulfilled_by_attachment_id
        from public.document_request_item_statuses s
        join public.document_requests r on r.id = s.document_request_id
        where r.entity_type = v_doc_request_entity_type and r.entity_id = v_doc_request_entity_id
          and s.name = dri.name and s.status <> 'pending'
        order by s.updated_at desc
        limit 1
      ) prior on true
      where dri.document_request_template_id = (v_step.action_config->>'document_request_template_id')::uuid;

    elsif v_step.action_type = 'assign_user' then
      v_assign_target := coalesce(v_step.action_config->>'target', case when v_run.engagement_id is not null then 'engagement' else 'client' end);
      v_assignment_mode := coalesce(v_step.action_config->>'assignment_mode', 'fixed');

      if v_assignment_mode = 'round_robin' then
        if v_assign_target = 'client' then
          select wu.user_id into v_resolved_staff_id
          from public.workspace_users wu
          where wu.workspace_id = v_run.workspace_id and wu.status = 'active'
            and (
              not (v_step.action_config ? 'staff_pool') or jsonb_array_length(v_step.action_config->'staff_pool') = 0
              or wu.user_id::text in (select jsonb_array_elements_text(v_step.action_config->'staff_pool'))
            )
          order by (
            select count(*) from public.clients c2
            where c2.relationship_manager_id = wu.user_id and c2.lifecycle_status not in ('archived', 'lost')
          ) asc, random()
          limit 1;
        else
          select wu.user_id into v_resolved_staff_id
          from public.workspace_users wu
          where wu.workspace_id = v_run.workspace_id and wu.status = 'active'
            and (
              not (v_step.action_config ? 'staff_pool') or jsonb_array_length(v_step.action_config->'staff_pool') = 0
              or wu.user_id::text in (select jsonb_array_elements_text(v_step.action_config->'staff_pool'))
            )
          order by (
            select count(*) from public.engagements e2
            where e2.assigned_staff_id = wu.user_id and e2.status not in ('Completed', 'Archived')
          ) asc, random()
          limit 1;
        end if;
        if v_resolved_staff_id is null then
          raise exception 'No eligible staff member found for round-robin assignment';
        end if;
      else
        v_resolved_staff_id := nullif(v_step.action_config->>'staff_id', '')::uuid;
        if v_resolved_staff_id is null then
          raise exception 'No staff member configured for this step';
        end if;
      end if;

      if v_assign_target = 'client' then
        if v_run.client_id is null then
          raise exception 'This workflow run has no client to assign';
        end if;
        update public.clients set relationship_manager_id = v_resolved_staff_id where id = v_run.client_id;
      else
        if v_run.engagement_id is null then
          raise exception 'This workflow run has no engagement to assign';
        end if;
        update public.engagements set assigned_staff_id = v_resolved_staff_id where id = v_run.engagement_id;
      end if;

    elsif v_step.action_type = 'send_notification' then
      v_channels := coalesce(
        (select array_agg(value #>> '{}') from jsonb_array_elements(v_step.action_config->'channels')),
        array['In-App']
      );
      v_rendered_message := public.render_merge_fields(v_step.action_config->>'message', v_context);

      v_resolved_staff_id := coalesce(
        nullif(v_step.action_config->>'staff_id', '')::uuid,
        (select user_id from public.workspace_users where workspace_id = v_run.workspace_id and is_owner = true and status = 'active' limit 1)
      );

      select wu.user_id, u.email into v_recipient
      from public.workspace_users wu
      join auth.users u on u.id = wu.user_id
      where wu.workspace_id = v_run.workspace_id and wu.user_id = v_resolved_staff_id and wu.status = 'active';

      if v_recipient.user_id is not null then
        if 'In-App' = any(v_channels) then
          perform public.create_notification(
            v_run.workspace_id,
            v_recipient.user_id,
            'automation',
            coalesce(nullif(v_step.action_config->>'template_key', ''), 'automation-step'),
            v_context || jsonb_build_object('message', v_rendered_message),
            array['In-App'],
            coalesce(nullif(v_step.action_config->>'priority', ''), 'Medium'),
            case when v_run.engagement_id is not null then 'engagement' else 'client' end,
            coalesce(v_run.engagement_id, v_run.client_id)
          );
        end if;

        if 'Email' = any(v_channels) and v_recipient.email is not null then
          insert into public.notification_queue (workspace_id, recipient_user_id, recipient_email, channel, template_key, payload, priority, entity_type, entity_id)
          values (
            v_run.workspace_id, v_recipient.user_id, v_recipient.email, 'Email', 'automation-staff-notification',
            v_context || jsonb_build_object('message', v_rendered_message),
            coalesce(nullif(v_step.action_config->>'priority', ''), 'Medium'),
            case when v_run.engagement_id is not null then 'engagement' else 'client' end,
            coalesce(v_run.engagement_id, v_run.client_id)
          );
        end if;
      end if;

    elsif v_step.action_type = 'move_pipeline_stage' then
      if v_run.client_id is null and v_run.engagement_id is null then
        raise exception 'This workflow run has no client or engagement to move';
      end if;
      if nullif(v_step.action_config->>'process_id', '') is null or nullif(v_step.action_config->>'process_stage_id', '') is null then
        raise exception 'No target pipeline stage configured for this step';
      end if;

      v_pipeline_entity_type := case when v_run.engagement_id is not null then 'engagement' else 'client' end;
      v_pipeline_entity_id := coalesce(v_run.engagement_id, v_run.client_id);

      select id, current_stage_id into v_pipeline_run_id, v_pipeline_stage_id
      from public.pipeline_runs
      where entity_type = v_pipeline_entity_type and entity_id = v_pipeline_entity_id and status = 'Active'
        and process_id = (v_step.action_config->>'process_id')::uuid
      order by started_at desc limit 1;

      if v_pipeline_run_id is null then
        v_pipeline_run_id := public.start_pipeline_run(v_pipeline_entity_type, v_pipeline_entity_id, (v_step.action_config->>'process_id')::uuid);
        select current_stage_id into v_pipeline_stage_id from public.pipeline_runs where id = v_pipeline_run_id;
        if v_pipeline_entity_type = 'engagement' then
          update public.engagements set workflow_id = (v_step.action_config->>'process_id')::uuid where id = v_pipeline_entity_id;
        end if;
      end if;

      select id into v_target_stage_id from public.pipeline_stages
      where pipeline_run_id = v_pipeline_run_id and process_stage_id = (v_step.action_config->>'process_stage_id')::uuid;

      if v_target_stage_id is null then
        raise exception 'Target stage is not part of this pipeline';
      end if;

      select display_order into v_target_order from public.pipeline_stages where id = v_target_stage_id;
      select display_order into v_current_order from public.pipeline_stages where id = v_pipeline_stage_id;

      if v_target_order < v_current_order then
        raise exception 'Moving backward through pipeline stages is not supported by this action';
      end if;

      v_loop_guard := 0;
      while v_pipeline_stage_id is distinct from v_target_stage_id and v_loop_guard < 100 loop
        update public.pipeline_stages set status = 'Completed', completed_at = now() where id = v_pipeline_stage_id;
        select current_stage_id into v_pipeline_stage_id from public.pipeline_runs where id = v_pipeline_run_id;
        v_loop_guard := v_loop_guard + 1;
      end loop;

    elsif v_step.action_type = 'move_lead_to_service_pipeline' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to move';
      end if;

      v_resolved_service_id := coalesce(
        nullif(v_run.trigger_snapshot->>'service_id', '')::uuid,
        (
          select service_id
          from public.client_service_interests
          where client_id = v_run.client_id
          order by created_at desc
          limit 1
        )
      );

      if v_resolved_service_id is null then
        raise exception 'This client has no service on file to resolve a pipeline from';
      end if;

      select process_id into v_target_process_id from public.services where id = v_resolved_service_id;
      if v_target_process_id is null then
        raise exception 'The client''s selected service has no pipeline configured';
      end if;

      select id into v_pipeline_run_id
      from public.pipeline_runs
      where entity_type = 'client' and entity_id = v_run.client_id and status = 'Active' and process_id = v_target_process_id
      order by started_at desc limit 1;

      if v_pipeline_run_id is null then
        perform public.start_pipeline_run('client', v_run.client_id, v_target_process_id);
      end if;

    elsif v_step.action_type = 'mark_lead_lost' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to mark lost';
      end if;
      update public.clients set lifecycle_status = 'lost', lost_reason = v_step.action_config->>'reason', lost_at = now() where id = v_run.client_id;

    elsif v_step.action_type = 'convert_lead_to_client' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to convert';
      end if;
      update public.clients set lifecycle_status = 'active' where id = v_run.client_id;

    elsif v_step.action_type = 'update_client' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to update';
      end if;
      case v_step.action_config->>'field'
        when 'first_name' then
          update public.clients set first_name = v_step.action_config->>'value' where id = v_run.client_id;
        when 'middle_name' then
          update public.clients set middle_name = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'last_name' then
          update public.clients set last_name = v_step.action_config->>'value' where id = v_run.client_id;
        when 'suffix' then
          update public.clients set suffix = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'business_name' then
          update public.clients set business_name = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'client_type' then
          update public.clients set client_type = v_step.action_config->>'value' where id = v_run.client_id;
        when 'primary_email' then
          update public.clients
          set primary_email = v_step.action_config->>'value',
              normalized_email = nullif(lower(btrim(coalesce(v_step.action_config->>'value', ''))), '')
          where id = v_run.client_id;
        when 'primary_phone' then
          update public.clients
          set primary_phone = v_step.action_config->>'value',
              normalized_phone = nullif(regexp_replace(coalesce(v_step.action_config->>'value', ''), '\D', '', 'g'), '')
          where id = v_run.client_id;
        when 'address_line1' then
          update public.clients set address_line1 = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'address_line2' then
          update public.clients set address_line2 = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'city' then
          update public.clients set city = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'state' then
          update public.clients set state = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'postal_code' then
          update public.clients set postal_code = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'country' then
          update public.clients set country = nullif(v_step.action_config->>'value', '') where id = v_run.client_id;
        when 'relationship_manager_id' then
          update public.clients set relationship_manager_id = nullif(v_step.action_config->>'value', '')::uuid where id = v_run.client_id;
        else
          raise exception 'Unsupported field for update_client: %', v_step.action_config->>'field';
      end case;

    elsif v_step.action_type = 'create_client' then
      v_normalized_email := nullif(lower(btrim(v_step.action_config->>'primary_email')), '');
      v_normalized_phone := nullif(regexp_replace(coalesce(v_step.action_config->>'primary_phone', ''), '\D', '', 'g'), '');

      select id into v_new_client_id
      from public.clients
      where workspace_id = v_run.workspace_id
        and merged_into_client_id is null
        and (
          (v_normalized_email is not null and normalized_email = v_normalized_email)
          or (v_normalized_phone is not null and normalized_phone = v_normalized_phone)
        )
      limit 1;

      if v_new_client_id is null then
        insert into public.clients (workspace_id, client_type, first_name, last_name, primary_email, primary_phone, normalized_email, normalized_phone, lifecycle_status)
        values (
          v_run.workspace_id,
          coalesce(nullif(v_step.action_config->>'client_type', ''), 'individual'),
          v_step.action_config->>'first_name',
          v_step.action_config->>'last_name',
          v_step.action_config->>'primary_email',
          v_step.action_config->>'primary_phone',
          v_normalized_email,
          v_normalized_phone,
          coalesce(nullif(v_step.action_config->>'lifecycle_status', ''), 'lead')
        )
        returning id into v_new_client_id;
      end if;

    elsif v_step.action_type = 'create_quote' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to quote';
      end if;
      insert into public.quotes (workspace_id, client_id, engagement_id, service_id, title, subtotal, tax_amount, discount_amount, total_amount, valid_until, notes)
      values (
        v_run.workspace_id, v_run.client_id, v_run.engagement_id,
        nullif(v_step.action_config->>'service_id', '')::uuid,
        coalesce(public.render_merge_fields(v_step.action_config->>'title', v_context), 'Quote'),
        coalesce((v_step.action_config->>'subtotal')::numeric, 0),
        coalesce((v_step.action_config->>'tax_amount')::numeric, 0),
        coalesce((v_step.action_config->>'discount_amount')::numeric, 0),
        coalesce((v_step.action_config->>'total_amount')::numeric, coalesce((v_step.action_config->>'subtotal')::numeric, 0)),
        nullif(v_step.action_config->>'valid_until', '')::date,
        public.render_merge_fields(v_step.action_config->>'notes', v_context)
      );

    elsif v_step.action_type = 'send_quote' then
      select id into v_quote_id from public.quotes
      where workspace_id = v_run.workspace_id
        and client_id = v_run.client_id
        and status = 'draft'
      order by created_at desc
      limit 1;

      if v_quote_id is null then
        raise exception 'No draft quote found to send for this client';
      end if;

      update public.quotes set status = 'sent' where id = v_quote_id;

    elsif v_step.action_type = 'add_tag' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to tag';
      end if;
      if nullif(v_step.action_config->>'tag', '') is null then
        raise exception 'No tag configured for this step';
      end if;
      update public.clients
      set tags = array(select distinct unnest(coalesce(tags, '{}') || array[v_step.action_config->>'tag']))
      where id = v_run.client_id;

    elsif v_step.action_type = 'remove_tag' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to untag';
      end if;
      if nullif(v_step.action_config->>'tag', '') is null then
        raise exception 'No tag configured for this step';
      end if;
      update public.clients
      set tags = array_remove(coalesce(tags, '{}'), v_step.action_config->>'tag')
      where id = v_run.client_id;

    elsif v_step.action_type = 'add_note' then
      if v_run.engagement_id is null and v_run.client_id is null then
        raise exception 'This workflow run has no entity to attach a note to';
      end if;
      if nullif(v_step.action_config->>'body', '') is null then
        raise exception 'No note text configured for this step';
      end if;
      insert into public.notes (workspace_id, entity_type, entity_id, body, is_internal)
      values (
        v_run.workspace_id,
        case when v_run.engagement_id is not null then 'engagement' else 'client' end,
        coalesce(v_run.engagement_id, v_run.client_id),
        public.render_merge_fields(v_step.action_config->>'body', v_context),
        true
      );

    elsif v_step.action_type = 'send_portal_message' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to message';
      end if;
      if nullif(v_step.action_config->>'body', '') is null then
        raise exception 'No message body configured for this step';
      end if;

      select id into v_thread_id from public.message_threads
      where workspace_id = v_run.workspace_id and entity_type = 'client' and entity_id = v_run.client_id and status = 'open'
      order by coalesce(last_message_at, created_at) desc
      limit 1;

      if v_thread_id is null then
        insert into public.message_threads (workspace_id, entity_type, entity_id, subject, channel)
        values (v_run.workspace_id, 'client', v_run.client_id, coalesce(v_step.action_config->>'subject', 'Message from your accountant'), 'portal')
        returning id into v_thread_id;
      end if;

      insert into public.messages (workspace_id, thread_id, sender_type, is_internal, body)
      values (v_run.workspace_id, v_thread_id, 'staff', false, public.render_merge_fields(v_step.action_config->>'body', v_context));

      update public.message_threads set last_message_at = now() where id = v_thread_id;

    elsif v_step.action_type = 'invite_to_portal' then
      if v_run.client_id is null then
        raise exception 'This workflow run has no client to invite';
      end if;

      if not exists (select 1 from public.client_portal_users where client_id = v_run.client_id) then
        if v_eng.primary_email is null then
          raise exception 'Client has no email on file to invite';
        end if;

        insert into public.client_portal_users (client_id, workspace_id, invited_email, invited_name)
        values (v_run.client_id, v_run.workspace_id, v_eng.primary_email, btrim(coalesce(v_eng.first_name, '') || ' ' || coalesce(v_eng.last_name, '')))
        returning id into v_portal_user_id;

        insert into public.pending_portal_invites (workspace_id, client_id, client_portal_user_id)
        values (v_run.workspace_id, v_run.client_id, v_portal_user_id);
      end if;

    elsif v_step.action_type = 'start_workflow' then
      if nullif(v_step.action_config->>'automation_id', '') is null then
        raise exception 'No automation configured for this step';
      end if;
      if not exists (
        select 1 from public.automations
        where id = (v_step.action_config->>'automation_id')::uuid
          and workspace_id = v_run.workspace_id and is_enabled = true and status = 'published'
      ) then
        raise exception 'Target automation is not available to start';
      end if;

      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (v_run.workspace_id, (v_step.action_config->>'automation_id')::uuid, v_run.engagement_id, v_run.client_id, v_run.trigger_snapshot, 'running')
      returning id into v_child_run_id;
      perform public.start_next_automation_step(v_child_run_id);

    elsif v_step.action_type = 'end_workflow' then
      update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;

    else
      raise exception 'Action type % is not yet supported', v_step.action_type;
    end if;
  exception when others then
    v_status := 'failed';
    v_error := sqlerrm;
  end;

  insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, workflow_run_id, status, execution_data, error_message, executed_at)
  values (
    v_run.workspace_id, v_run.automation_id, v_run.engagement_id, p_run_id, v_status,
    jsonb_build_object('step_id', p_step_id, 'action_type', v_step.action_type, 'run_id', p_run_id)
      || case when v_skip_note is not null then jsonb_build_object('skipped_reason', v_skip_note) else '{}'::jsonb end,
    v_error, now()
  );

  if v_status = 'failed' then
    update public.automation_runs set status = 'failed', completed_at = now() where id = p_run_id;
  else
    perform public.start_next_automation_step(p_run_id);
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.expire_stale_engagement_shares()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with expired as (
    update public.engagement_shares
    set status = 'expired'
    where status = 'pending' and expires_at < now()
    returning id
  )
  select count(*)::integer from expired;
$function$
;

CREATE OR REPLACE FUNCTION public.find_or_create_public_lead(p_workspace_id uuid, p_first_name text, p_last_name text, p_email text, p_phone text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_normalized_email citext;
  v_normalized_phone text;
  v_client_id uuid;
begin
  v_normalized_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_normalized_phone := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');

  select id into v_client_id
  from public.clients
  where workspace_id = p_workspace_id
    and merged_into_client_id is null
    and (
      (v_normalized_email is not null and normalized_email = v_normalized_email)
      or (v_normalized_phone is not null and normalized_phone = v_normalized_phone)
    )
  limit 1;

  if v_client_id is not null then
    return v_client_id;
  end if;

  insert into public.clients (workspace_id, client_type, lifecycle_status, first_name, last_name, primary_email, primary_phone, normalized_email, normalized_phone)
  values (
    p_workspace_id, 'individual', 'lead',
    nullif(btrim(p_first_name), ''), nullif(btrim(p_last_name), ''),
    nullif(btrim(coalesce(p_email, '')), ''), nullif(btrim(coalesce(p_phone, '')), ''),
    v_normalized_email, v_normalized_phone
  )
  returning id into v_client_id;

  return v_client_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_appointment_status_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if not (TG_OP = 'INSERT' or NEW.status is distinct from OLD.status) then
    return NEW;
  end if;

  v_context := jsonb_build_object('status', NEW.status, 'appointment_title', NEW.title);

  for v_automation in
    select * from public.automations
    where workspace_id = NEW.workspace_id
      and is_enabled = true
      and status = 'published'
      and trigger_type = 'appointment.status_changed'
      and trigger_config ->> 'to_status' = NEW.status
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, NEW.engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (NEW.workspace_id, v_automation.id, NEW.engagement_id, NEW.client_id, v_context, 'running')
      returning id into v_run_id;

      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_client_message_received_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
  v_thread record;
begin
  if new.sender_type <> 'client' then
    return new;
  end if;

  select entity_type, entity_id into v_thread from public.message_threads where id = new.thread_id;

  if v_thread.entity_type = 'client' then
    v_client_id := v_thread.entity_id;
  elsif v_thread.entity_type = 'engagement' then
    v_engagement_id := v_thread.entity_id;
    select client_id into v_client_id from public.engagements where id = v_thread.entity_id;
  else
    return new;
  end if;

  v_context := jsonb_build_object('message_id', new.id, 'thread_id', new.thread_id);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'client_message.received'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_client_tag_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_added_tag text;
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
begin
  select id into v_engagement_id from public.engagements
  where client_id = NEW.id and status not in ('Completed', 'Archived')
  order by created_at desc limit 1;

  for v_added_tag in
    select unnest(NEW.tags) except select unnest(coalesce(OLD.tags, array[]::text[]))
  loop
    v_context := jsonb_build_object('tag', v_added_tag, 'client_name', btrim(coalesce(NEW.first_name, '') || ' ' || coalesce(NEW.last_name, '') || coalesce(NEW.business_name, '')));

    for v_automation in
      select * from public.automations
      where workspace_id = NEW.workspace_id
        and is_enabled = true
        and status = 'published'
        and trigger_type = 'client.tag_added'
        and trigger_config ->> 'tag' = v_added_tag
    loop
      if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.id, v_engagement_id) then
        insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
        values (NEW.workspace_id, v_automation.id, v_engagement_id, NEW.id, v_context, 'running')
        returning id into v_run_id;

        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;
  end loop;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_date_reminder_automations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  r record;
  v_target_date date;
  v_context jsonb;
  v_run_id uuid;
  v_count int := 0;
  v_direction text;
  v_days int;
  v_inserted boolean;
begin
  for v_automation in
    select * from public.automations
    where is_enabled = true and status = 'published' and trigger_type = 'engagement.due_date_reminder'
  loop
    v_direction := coalesce(v_automation.trigger_config->>'direction', 'before');
    v_days := coalesce((v_automation.trigger_config->>'days')::int, 0);
    for r in
      select id, workspace_id, client_id, due_date::date as due_date
      from public.engagements
      where workspace_id = v_automation.workspace_id and due_date is not null
        and status not in ('Completed', 'Archived')
    loop
      v_target_date := case when v_direction = 'after' then r.due_date + v_days else r.due_date - v_days end;
      if v_target_date = current_date then
        insert into public.automation_date_reminders_sent (automation_id, entity_type, entity_id, reminder_date)
        values (v_automation.id, 'engagement', r.id, current_date)
        on conflict do nothing;
        get diagnostics v_inserted = row_count;
        if v_inserted then
          v_context := jsonb_build_object('engagement_id', r.id, 'due_date', r.due_date::text);
          if public.evaluate_automation_conditions(v_automation.conditions, v_context, r.workspace_id, r.client_id, r.id) then
            insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
            values (r.workspace_id, v_automation.id, r.id, r.client_id, v_context, 'running')
            returning id into v_run_id;
            perform public.start_next_automation_step(v_run_id);
            v_count := v_count + 1;
          end if;
        end if;
      end if;
    end loop;
  end loop;

  for v_automation in
    select * from public.automations
    where is_enabled = true and status = 'published' and trigger_type = 'quote.expiring_reminder'
  loop
    v_direction := coalesce(v_automation.trigger_config->>'direction', 'before');
    v_days := coalesce((v_automation.trigger_config->>'days')::int, 0);
    for r in
      select id, workspace_id, client_id, engagement_id, valid_until
      from public.quotes
      where workspace_id = v_automation.workspace_id and valid_until is not null
        and status not in ('accepted', 'declined')
    loop
      v_target_date := case when v_direction = 'after' then r.valid_until + v_days else r.valid_until - v_days end;
      if v_target_date = current_date then
        insert into public.automation_date_reminders_sent (automation_id, entity_type, entity_id, reminder_date)
        values (v_automation.id, 'quote', r.id, current_date)
        on conflict do nothing;
        get diagnostics v_inserted = row_count;
        if v_inserted then
          v_context := jsonb_build_object('quote_id', r.id, 'valid_until', r.valid_until::text);
          if public.evaluate_automation_conditions(v_automation.conditions, v_context, r.workspace_id, r.client_id, r.engagement_id) then
            insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
            values (r.workspace_id, v_automation.id, r.engagement_id, r.client_id, v_context, 'running')
            returning id into v_run_id;
            perform public.start_next_automation_step(v_run_id);
            v_count := v_count + 1;
          end if;
        end if;
      end if;
    end loop;
  end loop;

  for v_automation in
    select * from public.automations
    where is_enabled = true and status = 'published' and trigger_type = 'client.birthday_reminder'
  loop
    v_direction := coalesce(v_automation.trigger_config->>'direction', 'before');
    v_days := coalesce((v_automation.trigger_config->>'days')::int, 0);
    for r in
      select id, workspace_id, date_of_birth
      from public.clients
      where workspace_id = v_automation.workspace_id and date_of_birth is not null
        and lifecycle_status not in ('archived', 'lost')
    loop
      begin
        v_target_date := make_date(extract(year from current_date)::int, extract(month from r.date_of_birth)::int, extract(day from r.date_of_birth)::int);
      exception when others then
        continue;
      end;
      v_target_date := case when v_direction = 'after' then v_target_date + v_days else v_target_date - v_days end;
      if v_target_date = current_date then
        insert into public.automation_date_reminders_sent (automation_id, entity_type, entity_id, reminder_date)
        values (v_automation.id, 'client', r.id, current_date)
        on conflict do nothing;
        get diagnostics v_inserted = row_count;
        if v_inserted then
          v_context := jsonb_build_object('client_id', r.id, 'date_of_birth', r.date_of_birth::text);
          if public.evaluate_automation_conditions(v_automation.conditions, v_context, r.workspace_id, r.id, null) then
            insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
            values (r.workspace_id, v_automation.id, r.id, v_context, 'running')
            returning id into v_run_id;
            perform public.start_next_automation_step(v_run_id);
            v_count := v_count + 1;
          end if;
        end if;
      end if;
    end loop;
  end loop;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_document_request_completed_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
  v_client_id uuid;
  v_service_id uuid;
  v_workspace_id uuid;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' then
    return new;
  end if;

  if new.entity_type = 'engagement' then
    select workspace_id, client_id, service_id into v_workspace_id, v_client_id, v_service_id
    from public.engagements where id = new.entity_id;
    v_engagement_id := new.entity_id;
  elsif new.entity_type = 'client' then
    v_client_id := new.entity_id;
    select workspace_id into v_workspace_id from public.clients where id = new.entity_id;
    select service_id into v_service_id
    from public.client_service_interests
    where client_id = new.entity_id
    order by created_at desc limit 1;
  else
    return new;
  end if;

  if v_workspace_id is null then
    return new;
  end if;

  v_context := jsonb_build_object('service_id', v_service_id, 'document_request_id', new.id);

  for v_automation in
    select * from public.automations
    where workspace_id = v_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'document_request.completed'
      and (
        nullif(trigger_config ->> 'service_id', '') is null
        or trigger_config ->> 'service_id' = v_service_id::text
      )
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, v_workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (v_workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_document_request_sent_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
begin
  if new.entity_type = 'client' then
    v_client_id := new.entity_id;
  elsif new.entity_type = 'engagement' then
    v_engagement_id := new.entity_id;
    select client_id into v_client_id from public.engagements where id = new.entity_id;
  else
    return new;
  end if;

  v_context := jsonb_build_object('document_request_id', new.id, 'title', new.title);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'document_request.sent'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_document_uploaded_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
begin
  if new.entity_type = 'client' then
    v_client_id := new.entity_id;
  elsif new.entity_type = 'engagement' then
    v_engagement_id := new.entity_id;
    select client_id into v_client_id from public.engagements where id = new.entity_id;
  else
    return new;
  end if;

  v_context := jsonb_build_object('attachment_id', new.id, 'file_name', new.file_name);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'document.uploaded'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_email_engagement_event_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job record;
  v_client_id uuid;
  v_engagement_id uuid;
  v_trigger_type text;
  v_context jsonb;
  v_automation record;
  v_run_id uuid;
begin
  if new.notification_queue_id is null then
    return new;
  end if;

  if new.opened_at is not null and old.opened_at is null then
    v_trigger_type := 'email.opened';
  elsif new.clicked_at is not null and old.clicked_at is null then
    v_trigger_type := 'email.clicked';
  elsif new.status = 'bounced' and old.status is distinct from 'bounced' then
    v_trigger_type := 'email.bounced';
  else
    return new;
  end if;

  select entity_type, entity_id into v_job from public.notification_queue where id = new.notification_queue_id;

  if v_job.entity_type = 'client' then
    v_client_id := v_job.entity_id;
  elsif v_job.entity_type = 'engagement' then
    v_engagement_id := v_job.entity_id;
    select client_id into v_client_id from public.engagements where id = v_job.entity_id;
  else
    return new;
  end if;

  v_context := jsonb_build_object('email_log_id', new.id, 'template_key', new.template_key, 'recipient_email', new.recipient_email, 'subject', new.subject);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = v_trigger_type
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_engagement_created_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if NEW.service_id is null then
    return NEW;
  end if;

  v_context := jsonb_build_object('service_id', NEW.service_id);

  for v_automation in
    select * from public.automations
    where workspace_id = NEW.workspace_id
      and is_enabled = true
      and status = 'published'
      and trigger_type = 'engagement.created'
      and trigger_config ->> 'service_id' = NEW.service_id::text
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, NEW.id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (NEW.workspace_id, v_automation.id, NEW.id, NEW.client_id, v_context, 'running')
      returning id into v_run_id;

      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_engagement_letter_signed_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
  v_client_id uuid;
  v_service_id uuid;
  v_workspace_id uuid;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' then
    return new;
  end if;
  if new.engagement_letter_template_id is null then
    return new;
  end if;

  select a.entity_id into v_engagement_id
  from public.attachments a
  where a.id = new.attachment_id and a.entity_type = 'engagement';

  if v_engagement_id is null then
    return new;
  end if;

  select workspace_id, client_id, service_id into v_workspace_id, v_client_id, v_service_id
  from public.engagements where id = v_engagement_id;

  if v_workspace_id is null then
    return new;
  end if;

  v_context := jsonb_build_object('service_id', v_service_id, 'engagement_letter_template_id', new.engagement_letter_template_id);

  for v_automation in
    select * from public.automations
    where workspace_id = v_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'engagement_letter.signed'
      and trigger_config ->> 'service_id' = v_service_id::text
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, v_workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (v_workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_engagement_status_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if NEW.status is distinct from OLD.status then
    v_context := jsonb_build_object(
      'priority', NEW.priority,
      'service_id', NEW.service_id,
      'engagement_number', NEW.engagement_number,
      'status', NEW.status
    );

    for v_automation in
      select * from public.automations
      where workspace_id = NEW.workspace_id
        and is_enabled = true
        and status = 'published'
        and trigger_type = 'engagement.status_changed'
        and trigger_config ->> 'to_status' = NEW.status
    loop
      if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, NEW.id) then
        insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
        values (NEW.workspace_id, v_automation.id, NEW.id, NEW.client_id, v_context, 'running')
        returning id into v_run_id;

        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;
  end if;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_invoice_overdue_automations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_count int := 0;
begin
  for r in
    select id, workspace_id, client_id, engagement_id, invoice_number, due_date
    from public.invoices
    where status not in ('draft', 'paid')
      and due_date is not null
      and due_date < current_date
      and overdue_flagged_at is null
  loop
    v_context := jsonb_build_object('invoice_id', r.id, 'invoice_number', r.invoice_number, 'due_date', r.due_date::text);

    for v_automation in
      select * from public.automations
      where workspace_id = r.workspace_id and is_enabled = true and status = 'published'
        and trigger_type = 'invoice.overdue'
    loop
      if public.evaluate_automation_conditions(v_automation.conditions, v_context, r.workspace_id, r.client_id, r.engagement_id) then
        insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
        values (r.workspace_id, v_automation.id, r.engagement_id, r.client_id, v_context, 'running')
        returning id into v_run_id;
        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;

    update public.invoices set overdue_flagged_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_invoice_paid_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if new.status <> 'paid' or old.status is not distinct from 'paid' then
    return new;
  end if;

  v_context := jsonb_build_object('invoice_id', new.id, 'invoice_number', new.invoice_number, 'total_amount', new.total_amount::text);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'invoice.paid'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.client_id, new.engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, new.client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_invoice_sent_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if new.status <> 'sent' or old.status is not distinct from 'sent' then
    return new;
  end if;

  v_context := jsonb_build_object('invoice_id', new.id, 'invoice_number', new.invoice_number, 'total_amount', new.total_amount::text);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'invoice.sent'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.client_id, new.engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, new.client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_lead_assigned_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if new.relationship_manager_id is not distinct from old.relationship_manager_id then
    return new;
  end if;
  if new.lifecycle_status <> 'lead' then
    return new;
  end if;

  v_context := jsonb_build_object('assigned_staff_id', new.relationship_manager_id);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'lead.assigned'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.id, null) then
      insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_lead_created_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_had_portal boolean;
begin
  if new.lifecycle_status <> 'lead' then
    return new;
  end if;

  v_had_portal := exists (select 1 from public.client_portal_users where client_id = new.id);
  v_context := jsonb_build_object('lifecycle_status', new.lifecycle_status, 'lead.portal_exists_at_creation', v_had_portal);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'lead.created'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.id, null) then
      insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_lead_status_changed_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_was_lead_pipeline boolean;
begin
  if new.lifecycle_status is not distinct from old.lifecycle_status then
    return new;
  end if;

  v_context := jsonb_build_object('to_status', new.lifecycle_status, 'from_status', old.lifecycle_status);
  v_was_lead_pipeline := old.lifecycle_status = 'lead';

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and (
        (trigger_type = 'lead.status_changed' and trigger_config ->> 'to_status' = new.lifecycle_status)
        or (v_was_lead_pipeline and new.lifecycle_status = 'active' and trigger_type = 'lead.converted_to_client')
        or (new.lifecycle_status = 'lost' and trigger_type = 'lead.marked_lost')
      )
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.id, null) then
      insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_lead_updated_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if old.lifecycle_status <> 'lead' then
    return new;
  end if;

  v_context := jsonb_build_object('lifecycle_status', new.lifecycle_status);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'lead.updated'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.id, null) then
      insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_organizer_information_request_resolved_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_workspace_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
  v_organizer_template_id uuid;
  v_resolution text;
begin
  if new.status <> 'resolved' or old.status is not distinct from 'resolved' then
    return new;
  end if;

  select r.workspace_id, r.client_id, r.engagement_id, r.organizer_template_id
  into v_workspace_id, v_client_id, v_engagement_id, v_organizer_template_id
  from public.organizer_responses r
  where r.id = new.organizer_response_id;

  if v_workspace_id is null then
    return new;
  end if;

  select case
    when exists (select 1 from public.organizer_information_request_items where request_id = new.id and status = 'rejected') then 'rejected'
    when exists (select 1 from public.organizer_information_request_items where request_id = new.id and status = 'approved') then 'approved'
    else 'completed'
  end into v_resolution;

  v_context := jsonb_build_object(
    'organizer_template_id', v_organizer_template_id,
    'organizer_response_id', new.organizer_response_id,
    'request_id', new.id,
    'resolution', v_resolution
  );

  for v_automation in
    select * from public.automations
    where workspace_id = v_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'organizer_information_request.resolved'
      and (
        nullif(trigger_config ->> 'organizer_template_id', '') is null
        or trigger_config ->> 'organizer_template_id' = v_organizer_template_id::text
      )
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, v_workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (v_workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_organizer_response_review_decided_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if new.review_status is null or new.review_status is not distinct from old.review_status then
    return new;
  end if;

  v_context := jsonb_build_object(
    'organizer_template_id', new.organizer_template_id,
    'organizer_response_id', new.id,
    'review_status', new.review_status::text,
    'review_note', new.review_note
  );

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'organizer_response.review_decided'
      and trigger_config ->> 'to_status' = new.review_status::text
      and (
        nullif(trigger_config ->> 'organizer_template_id', '') is null
        or trigger_config ->> 'organizer_template_id' = new.organizer_template_id::text
      )
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.client_id, new.engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, new.client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_organizer_submitted_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
begin
  if not (
    (TG_OP = 'INSERT' and NEW.status = 'submitted')
    or (TG_OP = 'UPDATE' and NEW.status = 'submitted' and OLD.status is distinct from 'submitted')
  ) then
    return NEW;
  end if;

  v_engagement_id := NEW.engagement_id;
  if v_engagement_id is null then
    select id into v_engagement_id from public.engagements
    where client_id = NEW.client_id and status not in ('Completed', 'Archived')
    order by created_at desc limit 1;
  end if;

  perform public._notify_admins_of_organizer_submitted(NEW.workspace_id, NEW.client_id, NEW.id, NEW.organizer_template_id);

  v_context := jsonb_build_object('organizer_template_id', NEW.organizer_template_id, 'status', NEW.status, 'response_id', NEW.id);

  for v_automation in
    select * from public.automations
    where workspace_id = NEW.workspace_id
      and is_enabled = true
      and status = 'published'
      and trigger_type = 'organizer.submitted'
      and (
        nullif(trigger_config ->> 'organizer_template_id', '') is null
        or trigger_config ->> 'organizer_template_id' = NEW.organizer_template_id::text
      )
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (NEW.workspace_id, v_automation.id, v_engagement_id, NEW.client_id, v_context, 'running')
      returning id into v_run_id;

      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_payment_plan_installment_paid_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
begin
  if new.status <> 'paid' or old.status is not distinct from 'paid' then
    return new;
  end if;

  select client_id, engagement_id into v_client_id, v_engagement_id from public.invoices where id = new.invoice_id;

  v_context := jsonb_build_object('payment_plan_id', new.id, 'invoice_id', new.invoice_id, 'installment_number', new.installment_number, 'amount', new.amount::text);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'payment_plan.installment_paid'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_pipeline_stage_entered_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_workspace_id uuid;
  v_client_id uuid;
begin
  if new.status <> 'In Progress' or old.status is not distinct from 'In Progress' then
    return new;
  end if;

  select pr.entity_type, pr.entity_id, pr.workspace_id into v_entity_type, v_entity_id, v_workspace_id
  from public.pipeline_runs pr where pr.id = new.pipeline_run_id;

  if v_entity_id is null then
    return new;
  end if;

  v_context := jsonb_build_object('process_stage_id', new.process_stage_id);

  if v_entity_type = 'client' then
    v_client_id := v_entity_id;
    for v_automation in
      select * from public.automations
      where workspace_id = v_workspace_id and is_enabled = true and status = 'published'
        and trigger_type = 'lead.stage_entered'
        and trigger_config ->> 'process_stage_id' = new.process_stage_id::text
    loop
      if public.evaluate_automation_conditions(v_automation.conditions, v_context, v_workspace_id, v_client_id, null) then
        insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
        values (v_workspace_id, v_automation.id, v_client_id, v_context, 'running')
        returning id into v_run_id;
        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;
  else
    select client_id into v_client_id from public.engagements where id = v_entity_id;
    for v_automation in
      select * from public.automations
      where workspace_id = v_workspace_id and is_enabled = true and status = 'published'
        and trigger_type = 'engagement.stage_entered'
        and trigger_config ->> 'process_stage_id' = new.process_stage_id::text
    loop
      if public.evaluate_automation_conditions(v_automation.conditions, v_context, v_workspace_id, v_client_id, v_entity_id) then
        insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
        values (v_workspace_id, v_automation.id, v_entity_id, v_client_id, v_context, 'running')
        returning id into v_run_id;
        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_portal_created_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
begin
  if not (NEW.status = 'active' and (TG_OP = 'INSERT' or OLD.status is distinct from NEW.status)) then
    return NEW;
  end if;

  select id into v_engagement_id from public.engagements
  where client_id = NEW.client_id and status not in ('Completed', 'Archived')
  order by created_at desc limit 1;

  v_context := jsonb_build_object('client_id', NEW.client_id);

  for v_automation in
    select * from public.automations
    where workspace_id = NEW.workspace_id
      and is_enabled = true
      and status = 'published'
      and trigger_type = 'client.portal_created'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (NEW.workspace_id, v_automation.id, v_engagement_id, NEW.client_id, v_context, 'running')
      returning id into v_run_id;

      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_quote_created_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  v_context := jsonb_build_object('quote_id', new.id, 'service_id', new.service_id, 'total_amount', new.total_amount);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'quote.created'
      and (trigger_config ->> 'service_id' is null or trigger_config ->> 'service_id' = new.service_id::text)
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.client_id, new.engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, new.client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_quote_status_changed_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_trigger_type text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_trigger_type := case new.status
    when 'sent' then 'quote.sent'
    when 'accepted' then 'quote.accepted'
    when 'declined' then 'quote.declined'
    else null
  end;
  if v_trigger_type is null then
    return new;
  end if;

  v_context := jsonb_build_object('quote_id', new.id, 'service_id', new.service_id, 'total_amount', new.total_amount);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = v_trigger_type
      and (trigger_config ->> 'service_id' is null or trigger_config ->> 'service_id' = new.service_id::text)
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.client_id, new.engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, new.client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_service_interest_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
begin
  select id into v_engagement_id from public.engagements
  where client_id = NEW.client_id and status not in ('Completed', 'Archived')
  order by created_at desc limit 1;

  v_context := jsonb_build_object('service_id', NEW.service_id, 'service_category_id', NEW.service_category_id, 'source', NEW.source);

  for v_automation in
    select * from public.automations
    where workspace_id = NEW.workspace_id
      and is_enabled = true
      and status = 'published'
      and trigger_type = 'client.service_interest_selected'
      and (nullif(trigger_config->>'service_id', '') is null or trigger_config->>'service_id' = NEW.service_id::text)
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (NEW.workspace_id, v_automation.id, v_engagement_id, NEW.client_id, v_context, 'running')
      returning id into v_run_id;

      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_sms_engagement_event_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job record;
  v_client_id uuid;
  v_engagement_id uuid;
  v_trigger_type text;
  v_context jsonb;
  v_automation record;
  v_run_id uuid;
begin
  if new.notification_queue_id is null then
    return new;
  end if;

  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    v_trigger_type := 'sms.delivered';
  elsif new.status in ('failed', 'undelivered') and old.status not in ('failed', 'undelivered') then
    v_trigger_type := 'sms.failed';
  else
    return new;
  end if;

  select entity_type, entity_id into v_job from public.notification_queue where id = new.notification_queue_id;

  if v_job.entity_type = 'client' then
    v_client_id := v_job.entity_id;
  elsif v_job.entity_type = 'engagement' then
    v_engagement_id := v_job.entity_id;
    select client_id into v_client_id from public.engagements where id = v_job.entity_id;
  else
    return new;
  end if;

  v_context := jsonb_build_object('sms_log_id', new.id, 'template_key', new.template_key, 'recipient_phone', new.recipient_phone);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = v_trigger_type
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, v_client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_task_completed_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_client_id uuid;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' then
    return new;
  end if;

  if new.engagement_id is not null then
    select client_id into v_client_id from public.engagements where id = new.engagement_id;
  else
    v_client_id := new.client_id;
  end if;

  v_context := jsonb_build_object('task_id', new.id, 'title', new.title);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'task.completed'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, v_client_id, new.engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_task_created_automations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_client_id uuid;
begin
  if new.engagement_id is not null then
    select client_id into v_client_id from public.engagements where id = new.engagement_id;
  else
    v_client_id := new.client_id;
  end if;

  v_context := jsonb_build_object('task_id', new.id, 'title', new.title, 'priority', new.priority);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'task.created'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, v_client_id, new.engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fire_task_overdue_automations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_count int := 0;
begin
  for r in
    select t.id, t.workspace_id, t.engagement_id, t.title, t.due_date,
      coalesce(e.client_id, t.client_id) as client_id
    from public.tasks t
    left join public.engagements e on e.id = t.engagement_id
    where t.status <> 'completed'
      and t.due_date is not null
      and t.due_date < now()
      and t.overdue_flagged_at is null
  loop
    v_context := jsonb_build_object('task_id', r.id, 'title', r.title, 'due_date', r.due_date);

    for v_automation in
      select * from public.automations
      where workspace_id = r.workspace_id and is_enabled = true and status = 'published'
        and trigger_type = 'task.overdue'
    loop
      if public.evaluate_automation_conditions(v_automation.conditions, v_context, r.workspace_id, r.client_id, r.engagement_id) then
        insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
        values (r.workspace_id, v_automation.id, r.engagement_id, r.client_id, v_context, 'running')
        returning id into v_run_id;
        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;

    update public.tasks set overdue_flagged_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.flag_organizer_field_for_info(p_organizer_response_id uuid, p_organizer_field_id uuid, p_instance_index integer DEFAULT 0, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_request_id uuid;
  v_item_id uuid;
  v_has_answer boolean;
begin
  select workspace_id into v_workspace_id
  from public.organizer_responses where id = p_organizer_response_id;

  if v_workspace_id is null then
    raise exception 'organizer response not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;

  select id into v_request_id
  from public.organizer_information_requests
  where organizer_response_id = p_organizer_response_id and status = 'draft'
  limit 1;

  if v_request_id is null then
    insert into public.organizer_information_requests (workspace_id, organizer_response_id, created_by, status)
    values (v_workspace_id, p_organizer_response_id, auth.uid(), 'draft')
    returning id into v_request_id;
  end if;

  select id into v_item_id
  from public.organizer_information_request_items
  where request_id = v_request_id
    and organizer_field_id = p_organizer_field_id
    and instance_index = p_instance_index
    and status not in ('resolved', 'approved', 'rejected');

  if v_item_id is not null then
    update public.organizer_information_request_items
    set note = p_note
    where id = v_item_id;
    return v_item_id;
  end if;

  select exists (
    select 1 from public.organizer_response_answers
    where organizer_response_id = p_organizer_response_id
      and organizer_field_id = p_organizer_field_id
      and instance_index = p_instance_index
      and value is not null and value not in ('null'::jsonb, '""'::jsonb)
  ) into v_has_answer;

  insert into public.organizer_information_request_items
    (request_id, organizer_field_id, instance_index, note, was_answered_when_flagged)
  values (v_request_id, p_organizer_field_id, p_instance_index, p_note, v_has_answer)
  returning id into v_item_id;

  return v_item_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.flip_lead_on_quote_acceptance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    update public.clients
      set lifecycle_status = 'active'
      where id = new.client_id and lifecycle_status = 'lead';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.format_mailing_address(p_raw text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_json jsonb;
  v_street text;
  v_city_state text;
  v_city_state_zip text;
begin
  if p_raw is null or btrim(p_raw) = '' then
    return null;
  end if;

  begin
    v_json := p_raw::jsonb;
  exception when others then
    return p_raw;
  end;

  if jsonb_typeof(v_json) <> 'object' then
    return p_raw;
  end if;

  v_street := nullif(trim(both ', ' from concat_ws(', ', v_json->>'street', v_json->>'street2')), '');
  v_city_state := nullif(trim(both ', ' from concat_ws(', ', v_json->>'city', v_json->>'state')), '');
  v_city_state_zip := nullif(trim(both ' ' from concat_ws(' ', v_city_state, v_json->>'zip')), '');
  return nullif(trim(both ', ' from concat_ws(', ', v_street, v_city_state_zip)), '');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.format_organizer_answer(p_field_type text, p_value jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_text text;
  v_digits text;
  v_obj jsonb;
  v_street text;
  v_city_state text;
  v_city_state_zip text;
begin
  if p_value is null then
    return '--';
  end if;

  if p_field_type in ('ssn', 'ein') then
    v_digits := regexp_replace(coalesce(p_value #>> '{}', ''), '\D', '', 'g');
    if length(v_digits) >= 4 then
      return '••••' || right(v_digits, 4);
    end if;
    return 'on file';
  end if;

  if p_field_type in ('name', 'address') then
    v_obj := p_value;
    if jsonb_typeof(v_obj) = 'string' then
      begin
        v_obj := (v_obj #>> '{}')::jsonb;
      exception when others then
        v_obj := null;
      end;
    end if;

    if v_obj is not null and jsonb_typeof(v_obj) = 'object' then
      if p_field_type = 'name' then
        v_text := nullif(btrim(
          coalesce(v_obj->>'first', '') || ' ' || coalesce(nullif(v_obj->>'middle', ''), '') || ' ' ||
          coalesce(v_obj->>'last', '') || ' ' || coalesce(nullif(v_obj->>'suffix', ''), '')
        ), '');
        if v_text is not null then
          v_text := regexp_replace(v_text, '\s+', ' ', 'g');
        end if;
        return v_text;
      else
        v_street := nullif(concat_ws(', ', nullif(v_obj->>'street', ''), nullif(v_obj->>'street2', '')), '');
        v_city_state := nullif(concat_ws(', ', nullif(v_obj->>'city', ''), nullif(v_obj->>'state', '')), '');
        v_city_state_zip := nullif(concat_ws(' ', nullif(v_city_state, ''), nullif(v_obj->>'zip', '')), '');
        return nullif(concat_ws(', ', v_street, v_city_state_zip), '');
      end if;
    end if;
  end if;

  if jsonb_typeof(p_value) = 'string' then
    v_text := p_value #>> '{}';
  else
    v_text := p_value::text;
  end if;

  return nullif(v_text, '');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fulfill_document_request_item(p_item_status_id uuid, p_attachment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_folder_name text;
  v_folder_id uuid;
begin
  select r.workspace_id, r.entity_type, r.entity_id, dri.default_folder_name
  into v_workspace_id, v_entity_type, v_entity_id, v_folder_name
  from public.document_request_item_statuses s
  join public.document_requests r on r.id = s.document_request_id
  left join public.document_request_items dri on dri.id = s.document_request_item_id
  where s.id = p_item_status_id;

  if v_workspace_id is null then
    raise exception 'request item not found';
  end if;
  if not (
    public.has_permission(v_workspace_id, 'documents.upload')
    or public.is_portal_user_for_entity(v_entity_type, v_entity_id)
  ) then
    raise exception 'insufficient permissions';
  end if;

  update public.document_request_item_statuses
  set status = 'uploaded', fulfilled_by_attachment_id = p_attachment_id, updated_at = now()
  where id = p_item_status_id;

  -- Best-effort: file into the matching folder if this item has a default
  -- folder and that folder actually exists for this entity (e.g. a client-
  -- level request has no auto-created folders, or an older engagement
  -- predates the folder template system) -- leave folder_id null otherwise.
  if v_folder_name is not null then
    select id into v_folder_id
    from public.document_folders
    where entity_type = v_entity_type and entity_id = v_entity_id and name = v_folder_name
    limit 1;

    if v_folder_id is not null then
      update public.attachments set folder_id = v_folder_id where id = p_attachment_id;
    end if;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_client_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next bigint;
begin
  if new.client_number is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text || v_year || 'client', 0));

  select count(*) + 1 into v_next
  from clients
  where workspace_id = new.workspace_id and to_char(created_at, 'YYYY') = v_year;

  new.client_number := 'CLI-' || v_year || '-' || lpad(v_next::text, 6, '0');
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_engagement_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next bigint;
begin
  if new.engagement_number is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text || v_year, 0));

  select count(*) + 1 into v_next
  from public.engagements
  where workspace_id = new.workspace_id and to_char(open_date, 'YYYY') = v_year;

  new.engagement_number := 'ENG-' || v_year || '-' || lpad(v_next::text, 6, '0');
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
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
$function$
;

CREATE OR REPLACE FUNCTION public.generate_quote_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_config_object_versions(p_table text, p_id uuid)
 RETURNS SETOF config_object_versions
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select v.*
  from public.config_object_versions v
  where v.object_type = p_table and v.object_id = p_id
    and (v.workspace_id is null or public.is_workspace_member(v.workspace_id))
  order by v.version_number desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_ero_connected_partners(p_workspace_id uuid, p_relationship_types text[] DEFAULT ARRAY['ero_ptin'::text])
 RETURNS TABLE(connection_id uuid, child_workspace_id uuid, name text, relationship_type text, status text, phone text, primary_contact_email text, website text, mailing_address text, billing_responsibility text, shares_communications_identity boolean, allows_branding_override boolean, notes text, created_at timestamp with time zone, responded_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only a workspace admin can view connected partners';
  end if;

  return query
    select
      fc.id, fc.child_workspace_id, coalesce(cw.name, 'Pending invite'), fc.relationship_type, fc.status,
      cw.phone, cw.primary_contact_email::text, cw.website, cw.mailing_address,
      fc.billing_responsibility, fc.shares_communications_identity, fc.allows_branding_override,
      fc.notes, fc.created_at, fc.responded_at
    from public.firm_connections fc
    left join public.workspaces cw on cw.id = fc.child_workspace_id
    where fc.parent_workspace_id = p_workspace_id
      and fc.relationship_type = any(p_relationship_types)
    order by (fc.status = 'active') desc, cw.name nulls last;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_ero_extensions(p_workspace_id uuid)
 RETURNS TABLE(source_workspace_id uuid, source_workspace_name text, engagement_id uuid, engagement_number text, tax_year integer, extension_filed_date date, extension_due_date date, client_first_name text, client_last_name text, client_business_name text, client_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only a workspace admin can view this rollup';
  end if;

  return query
    with target_workspaces as (
      select p_workspace_id as workspace_id, w.name as workspace_name
      from public.workspaces w where w.id = p_workspace_id
      union all
      select fc.child_workspace_id, cw.name
      from public.firm_connections fc
      join public.workspaces cw on cw.id = fc.child_workspace_id
      where fc.parent_workspace_id = p_workspace_id
        and fc.relationship_type = 'ero_ptin'
        and fc.status = 'active'
    )
    select
      tw.workspace_id, tw.workspace_name,
      e.id, e.engagement_number,
      etd.tax_year, etd.extension_filed_date, etd.extension_due_date,
      c.first_name, c.last_name, c.business_name, c.client_type
    from public.engagement_tax_details etd
    join target_workspaces tw on tw.workspace_id = etd.workspace_id
    join public.engagements e on e.id = etd.engagement_id
    left join public.clients c on c.id = e.client_id
    where etd.is_extended = true
    order by etd.extension_due_date asc nulls last;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_ero_irs_notices(p_workspace_id uuid)
 RETURNS TABLE(source_workspace_id uuid, source_workspace_name text, notice_id uuid, notice_type text, notice_date date, response_due_date date, status text, entity_label text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only a workspace admin can view this rollup';
  end if;

  return query
    with target_workspaces as (
      select p_workspace_id as workspace_id, w.name as workspace_name
      from public.workspaces w where w.id = p_workspace_id
      union all
      select fc.child_workspace_id, cw.name
      from public.firm_connections fc
      join public.workspaces cw on cw.id = fc.child_workspace_id
      where fc.parent_workspace_id = p_workspace_id
        and fc.relationship_type = 'ero_ptin'
        and fc.status = 'active'
    )
    select
      tw.workspace_id, tw.workspace_name,
      n.id, n.notice_type, n.notice_date, n.response_due_date, n.status,
      coalesce(
        case
          when n.entity_type = 'client' then (
            select case when cc.client_type = 'business' and cc.business_name is not null then cc.business_name
                   else nullif(trim(coalesce(cc.first_name, '') || ' ' || coalesce(cc.last_name, '')), '') end
            from public.clients cc where cc.id = n.entity_id
          )
          when n.entity_type = 'engagement' then (
            select coalesce(ee.engagement_number, 'Engagement') || ' -- ' ||
                   coalesce(
                     case when cc2.client_type = 'business' and cc2.business_name is not null then cc2.business_name
                     else nullif(trim(coalesce(cc2.first_name, '') || ' ' || coalesce(cc2.last_name, '')), '') end,
                     'Unnamed client'
                   )
            from public.engagements ee
            left join public.clients cc2 on cc2.id = ee.client_id
            where ee.id = n.entity_id
          )
        end,
        '--'
      ) as entity_label
    from public.irs_notices n
    join target_workspaces tw on tw.workspace_id = n.workspace_id
    order by n.notice_date desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_ero_return_status(p_workspace_id uuid)
 RETURNS TABLE(source_workspace_id uuid, source_workspace_name text, engagement_id uuid, engagement_number text, status text, due_date timestamp with time zone, tax_year integer, return_type text, return_status text, is_extended boolean, federal_refund_amount numeric, federal_balance_due numeric, client_first_name text, client_last_name text, client_business_name text, client_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only a workspace admin can view this rollup';
  end if;

  return query
    with target_workspaces as (
      select p_workspace_id as workspace_id, w.name as workspace_name
      from public.workspaces w where w.id = p_workspace_id
      union all
      select fc.child_workspace_id, cw.name
      from public.firm_connections fc
      join public.workspaces cw on cw.id = fc.child_workspace_id
      where fc.parent_workspace_id = p_workspace_id
        and fc.relationship_type = 'ero_ptin'
        and fc.status = 'active'
    )
    select
      tw.workspace_id, tw.workspace_name,
      e.id, e.engagement_number, e.status, e.due_date,
      etd.tax_year, etd.return_type, etd.return_status, etd.is_extended,
      etd.federal_refund_amount, etd.federal_balance_due,
      c.first_name, c.last_name, c.business_name, c.client_type
    from public.engagement_tax_details etd
    join target_workspaces tw on tw.workspace_id = etd.workspace_id
    join public.engagements e on e.id = etd.engagement_id
    left join public.clients c on c.id = e.client_id
    order by etd.tax_year desc nulls last;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_ero_tax_year_metrics(p_workspace_id uuid)
 RETURNS TABLE(source_workspace_id uuid, source_workspace_name text, tax_year integer, total_returns bigint, filed bigint, ready_to_file bigint, not_filed bigint, extended bigint, amended bigint, open_irs_notices bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only a workspace admin can view this rollup';
  end if;

  return query
    with target_workspaces as (
      select p_workspace_id as workspace_id, w.name as workspace_name
      from public.workspaces w where w.id = p_workspace_id
      union all
      select fc.child_workspace_id, cw.name
      from public.firm_connections fc
      join public.workspaces cw on cw.id = fc.child_workspace_id
      where fc.parent_workspace_id = p_workspace_id
        and fc.relationship_type = 'ero_ptin'
        and fc.status = 'active'
    )
    select
      tw.workspace_id, tw.workspace_name,
      etd.tax_year,
      count(*) as total_returns,
      count(*) filter (where etd.return_status = 'filed') as filed,
      count(*) filter (where etd.return_status = 'ready_to_file') as ready_to_file,
      count(*) filter (where etd.return_status = 'not_filed') as not_filed,
      count(*) filter (where etd.is_extended) as extended,
      count(*) filter (where etd.is_amended) as amended,
      count(distinct n.id) filter (where n.status = 'open') as open_irs_notices
    from public.engagement_tax_details etd
    join target_workspaces tw on tw.workspace_id = etd.workspace_id
    left join public.irs_notices n on n.entity_type = 'engagement' and n.entity_id = etd.engagement_id
    where etd.tax_year is not null
    group by tw.workspace_id, tw.workspace_name, etd.tax_year
    order by etd.tax_year desc, tw.workspace_name;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_firm_connection_invite_preview(p_token uuid)
 RETURNS TABLE(ero_name text, status text, expires_at timestamp with time zone, relationship_type text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select w.name, fc.status, fc.invite_expires_at, fc.relationship_type
  from public.firm_connections fc
  join public.workspaces w on w.id = fc.parent_workspace_id
  where fc.invite_token = p_token;
$function$
;

CREATE OR REPLACE FUNCTION public.get_invitation_preview(p_token uuid)
 RETURNS TABLE(email text, status text, expires_at timestamp with time zone, workspace_name text, role_name text, account_exists boolean, password_min_length integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    wi.email,
    wi.status,
    wi.expires_at,
    w.name,
    r.name,
    exists (select 1 from auth.users u where lower(u.email) = lower(wi.email)),
    coalesce((select password_min_length from public.workspace_security_policies where workspace_id = wi.workspace_id), 8)
  from public.workspace_invitations wi
  join public.workspaces w on w.id = wi.workspace_id
  join public.roles r on r.id = wi.role_id
  where wi.token = p_token;
$function$
;

CREATE OR REPLACE FUNCTION public.get_learning_completion_rollup(p_owner_workspace_id uuid)
 RETURNS TABLE(source_workspace_id uuid, source_workspace_name text, user_id uuid, user_email text, course_id uuid, course_title text, module_id uuid, module_title text, module_type text, score_percent integer, passed boolean, completed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.has_permission(p_owner_workspace_id, 'learning_hub.manage') then
    raise exception 'insufficient permissions to view this rollup';
  end if;

  return query
    with target_workspaces as (
      select p_owner_workspace_id as workspace_id, w.name as workspace_name
      from public.workspaces w where w.id = p_owner_workspace_id
      union all
      select fc.child_workspace_id, cw.name
      from public.firm_connections fc
      join public.workspaces cw on cw.id = fc.child_workspace_id
      where fc.parent_workspace_id = p_owner_workspace_id
        and fc.status = 'active'
    )
    select
      tw.workspace_id, tw.workspace_name,
      lmc.user_id, u.email,
      c.id, c.title, m.id, m.title, m.module_type,
      lmc.score_percent, lmc.passed, lmc.completed_at
    from public.learning_module_completions lmc
    join target_workspaces tw on tw.workspace_id = lmc.workspace_id
    join public.learning_modules m on m.id = lmc.module_id
    join public.learning_courses c on c.id = m.course_id
    left join auth.users u on u.id = lmc.user_id
    where c.owner_workspace_id = p_owner_workspace_id
    order by lmc.completed_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_messageable_network_workspaces(p_workspace_id uuid)
 RETURNS TABLE(workspace_id uuid, name text, workspace_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_type text;
  v_parent_id uuid;
  v_allow_peer boolean;
begin
  if not public.is_workspace_member(p_workspace_id) then
    return;
  end if;

  select w.workspace_type into v_workspace_type from public.workspaces w where w.id = p_workspace_id;

  if v_workspace_type in ('ero_office', 'service_bureau') then
    return query
      select w.id, w.name, w.workspace_type
      from public.firm_connections fc
      join public.workspaces w on w.id = fc.child_workspace_id
      where fc.parent_workspace_id = p_workspace_id
        and fc.relationship_type = 'ero_ptin'
        and fc.status = 'active';
    return;
  end if;

  select fc.parent_workspace_id into v_parent_id
  from public.firm_connections fc
  where fc.child_workspace_id = p_workspace_id
    and fc.relationship_type = 'ero_ptin'
    and fc.status = 'active'
  limit 1;

  if v_parent_id is null then
    return;
  end if;

  select w.id, w.name, w.workspace_type into workspace_id, name, workspace_type
  from public.workspaces w where w.id = v_parent_id;
  return next;

  select w.allow_connected_ptin_messaging into v_allow_peer from public.workspaces w where w.id = v_parent_id;
  if coalesce(v_allow_peer, false) then
    return query
      select w.id, w.name, w.workspace_type
      from public.firm_connections fc
      join public.workspaces w on w.id = fc.child_workspace_id
      where fc.parent_workspace_id = v_parent_id
        and fc.relationship_type = 'ero_ptin'
        and fc.status = 'active'
        and fc.child_workspace_id <> p_workspace_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_ero_connection(p_workspace_id uuid)
 RETURNS TABLE(connection_id uuid, ero_workspace_id uuid, name text, relationship_type text, phone text, primary_contact_email text, website text, billing_responsibility text, shares_communications_identity boolean, allows_branding_override boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Only a member of this workspace can view its ERO connection';
  end if;

  return query
    select
      fc.id, fc.parent_workspace_id, pw.name, fc.relationship_type, pw.phone, pw.primary_contact_email::text, pw.website,
      fc.billing_responsibility, fc.shares_communications_identity, fc.allows_branding_override
    from public.firm_connections fc
    join public.workspaces pw on pw.id = fc.parent_workspace_id
    where fc.child_workspace_id = p_workspace_id
      and fc.relationship_type in ('ero_ptin', 'service_bureau_ero', 'service_bureau_ptin')
      and fc.status = 'active'
    limit 1;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_workspaces()
 RETURNS TABLE(workspace_id uuid, workspace_name text, workspace_slug text, workspace_type text, role_slug text, role_name text, is_owner boolean, status text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    w.id, w.name, w.slug, w.workspace_type,
    r.slug, r.name,
    wu.is_owner, wu.status
  from public.workspace_users wu
  join public.workspaces w on w.id = wu.workspace_id
  join public.roles r on r.id = wu.role_id
  where wu.user_id = auth.uid()
  order by wu.created_at;
$function$
;

CREATE OR REPLACE FUNCTION public.get_platform_account_holders()
 RETURNS TABLE(workspace_id uuid, workspace_name text, workspace_type text, workspace_status text, workspace_created_at timestamp with time zone, user_id uuid, display_name text, first_name text, last_name text, email text, phone text, plan_name text, stripe_status text, seat_count integer, current_period_end timestamp with time zone, cancel_at_period_end boolean, last_payment_amount_cents integer, last_payment_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    w.id,
    w.name,
    w.workspace_type,
    w.status,
    w.created_at,
    wu.user_id,
    up.display_name,
    up.first_name,
    up.last_name,
    au.email,
    up.phone,
    pp.name,
    ws.stripe_status,
    ws.seat_count,
    ws.current_period_end,
    ws.cancel_at_period_end,
    lp.amount_paid,
    lp.paid_at
  from public.workspaces w
  join public.workspace_users wu on wu.workspace_id = w.id and wu.is_owner = true and wu.status = 'active'
  join public.user_profiles up on up.id = wu.user_id
  join auth.users au on au.id = wu.user_id
  left join public.workspace_subscriptions ws on ws.workspace_id = w.id
  left join public.platform_subscription_plans pp on pp.id = ws.plan_id
  left join lateral (
    select amount_paid, paid_at
    from public.workspace_subscription_invoices wsi
    where wsi.workspace_id = w.id and wsi.status = 'paid'
    order by wsi.paid_at desc nulls last
    limit 1
  ) lp on true
  where w.is_demo = false
    and w.is_platform_home = false
    and public.is_platform_admin()
  order by w.created_at desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_platform_staff_directory()
 RETURNS TABLE(workspace_id uuid, workspace_name text, user_id uuid, display_name text, email text, is_owner boolean, last_sign_in_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    w.id,
    w.name,
    wu.user_id,
    up.display_name,
    au.email,
    wu.is_owner,
    au.last_sign_in_at
  from public.workspace_users wu
  join public.workspaces w on w.id = wu.workspace_id
  join public.user_profiles up on up.id = wu.user_id
  join auth.users au on au.id = wu.user_id
  where wu.status = 'active'
    and public.is_platform_it()
  order by au.last_sign_in_at desc nulls last;
$function$
;

CREATE OR REPLACE FUNCTION public.get_platform_system_credential_secret(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret bytea;
begin
  if not is_platform_it() then
    raise exception 'insufficient permissions to view system credentials';
  end if;

  select secret_encrypted into v_secret from public.platform_system_credentials where id = p_id;
  if v_secret is null then return null; end if;
  return decrypt_firm_secret(v_secret);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_platform_terms_acceptance_status(p_version text)
 RETURNS TABLE(workspace_id uuid, workspace_name text, user_id uuid, display_name text, email text, accepted boolean, accepted_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    w.id,
    w.name,
    wu.user_id,
    up.display_name,
    au.email,
    (cr.id is not null) as accepted,
    cr.accepted_at
  from public.workspaces w
  join public.workspace_users wu on wu.workspace_id = w.id and wu.is_owner = true and wu.status = 'active'
  join public.user_profiles up on up.id = wu.user_id
  join auth.users au on au.id = wu.user_id
  left join public.consent_records cr
    on cr.user_id = wu.user_id and cr.consent_type = 'platform_terms' and cr.version = p_version
  where w.is_demo = false
    and w.is_platform_home = false
    and public.is_platform_admin()
  order by accepted asc, w.created_at desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_portal_client_contact()
 RETURNS TABLE(name text, phone text, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    coalesce(nullif(trim(up.display_name), ''), nullif(trim(coalesce(up.first_name, '') || ' ' || coalesce(up.last_name, '')), ''), u.email) as name,
    up.phone,
    u.email
  from public.clients c
  join auth.users u on u.id = c.relationship_manager_id
  left join public.user_profiles up on up.id = u.id
  where c.id = public.portal_client_id()
    and c.relationship_manager_id is not null;
$function$
;

CREATE OR REPLACE FUNCTION public.get_portal_client_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client_id uuid;
  v_client record;
  v_address record;
  v_service_ids uuid[];
begin
  select client_id into v_client_id from public.client_portal_users where user_id = auth.uid() and status = 'active' limit 1;
  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  select client_type, first_name, middle_name, last_name, suffix, business_name, primary_email, primary_phone, date_of_birth, portal_basic_info_completed_at
  into v_client from public.clients where id = v_client_id;

  select street, city, state, zip into v_address
  from public.client_addresses
  where client_id = v_client_id and address_type = 'mailing'
  order by is_primary desc, created_at asc
  limit 1;

  select coalesce(array_agg(distinct service_id), array[]::uuid[]) into v_service_ids
  from public.client_service_interests
  where client_id = v_client_id and service_id is not null;

  return jsonb_build_object(
    'client_type', v_client.client_type,
    'first_name', v_client.first_name,
    'middle_name', v_client.middle_name,
    'last_name', v_client.last_name,
    'suffix', v_client.suffix,
    'business_name', v_client.business_name,
    'primary_email', v_client.primary_email,
    'primary_phone', v_client.primary_phone,
    'date_of_birth', v_client.date_of_birth,
    'basic_info_completed_at', v_client.portal_basic_info_completed_at,
    'mailing_street', v_address.street,
    'mailing_city', v_address.city,
    'mailing_state', v_address.state,
    'mailing_zip', v_address.zip,
    'service_ids', to_jsonb(v_service_ids)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_portal_invitation_preview(p_token uuid)
 RETURNS TABLE(invited_email citext, invited_name text, status text, token_expires_at timestamp with time zone, client_label text, password_min_length integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select cpu.invited_email, cpu.invited_name, cpu.status, cpu.token_expires_at,
    coalesce(c.business_name, trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,''))),
    coalesce((select password_min_length from public.workspace_security_policies where workspace_id = c.workspace_id), 8)
  from public.client_portal_users cpu
  join public.clients c on c.id = cpu.client_id
  where cpu.invitation_token = p_token;
$function$
;

CREATE OR REPLACE FUNCTION public.get_portal_service_options()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id
  from public.client_portal_users
  where user_id = auth.uid() and status = 'active'
  limit 1;

  if v_workspace_id is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', sc.id,
      'name', sc.name,
      'services', (
        select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.display_order), '[]'::jsonb)
        from public.services s
        where s.service_category_id = sc.id
          and s.status = 'published'
          and s.is_portal_visible = true
          and (s.workspace_id is null or s.workspace_id = v_workspace_id)
      )
    ) order by sc.display_order)
    from public.service_categories sc
    where sc.workspace_id is null or sc.workspace_id = v_workspace_id
  ), '[]'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_engagement_letter_template(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record;
begin
  select elt.id, elt.name, elt.body_html, elt.requires_signature, elt.requires_portal_signup, elt.workspace_id, elt.banner_image_url,
         w.name as workspace_name, w.name as firm_name, w.mailing_address as firm_address, w.phone as firm_phone
  into v_row
  from public.engagement_letter_templates elt
  join public.workspaces w on w.id = elt.workspace_id
  where elt.public_token = p_token and elt.is_public = true and elt.status = 'published';

  if v_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'template', jsonb_build_object('id', v_row.id, 'name', v_row.name, 'body_html', v_row.body_html, 'requires_signature', v_row.requires_signature, 'banner_image_url', v_row.banner_image_url),
    'workspace_name', v_row.workspace_name,
    'firm_name', v_row.firm_name,
    'firm_address', v_row.firm_address,
    'firm_phone', v_row.firm_phone,
    'requires_portal_signup', v_row.requires_portal_signup,
    'password_min_length', coalesce((select password_min_length from public.workspace_security_policies where workspace_id = v_row.workspace_id), 8)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_organizer_template(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_template record;
  v_result jsonb;
begin
  select ot.id, ot.name, ot.description, ot.workspace_id, ot.requires_portal_signup, ot.banner_image_url, w.name as workspace_name
  into v_template
  from public.organizer_templates ot
  join public.workspaces w on w.id = ot.workspace_id
  where ot.public_token = p_token and ot.is_public = true and ot.status = 'published';

  if v_template.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'template', jsonb_build_object('id', v_template.id, 'name', v_template.name, 'description', v_template.description, 'banner_image_url', v_template.banner_image_url),
    'workspace_name', v_template.workspace_name,
    'requires_portal_signup', v_template.requires_portal_signup,
    'password_min_length', coalesce((select password_min_length from public.workspace_security_policies where workspace_id = v_template.workspace_id), 8),
    'branding', (
      select jsonb_build_object(
        'logo_url', coalesce(b.portal_logo_url, b.sidebar_logo_url),
        'primary_color', b.primary_color,
        'secondary_color', b.secondary_color,
        'support_email', b.support_email,
        'support_phone', b.support_phone
      )
      from public.branding b
      where b.workspace_id = v_template.workspace_id
    ),
    'fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'field_type', f.field_type, 'label', f.label, 'help_text', f.help_text,
        'display_order', f.display_order, 'is_required', f.is_required, 'options', f.options,
        'parent_field_id', f.parent_field_id, 'conditional_logic', f.conditional_logic,
        'body_html', f.body_html, 'client_profile_field', f.client_profile_field, 'layout_width', f.layout_width
      ) order by f.display_order)
      from public.organizer_fields f
      where f.organizer_template_id = v_template.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_service_options(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
begin
  select ot.workspace_id into v_workspace_id
  from public.organizer_templates ot
  where ot.public_token = p_token and ot.is_public = true and ot.status = 'published';

  if v_workspace_id is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', sc.id,
      'name', sc.name,
      'services', (
        select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.display_order), '[]'::jsonb)
        from public.services s
        where s.service_category_id = sc.id
          and s.status = 'published'
          and s.is_portal_visible = true
          and (s.workspace_id is null or s.workspace_id = v_workspace_id)
      )
    ) order by sc.display_order)
    from public.service_categories sc
    where sc.workspace_id is null or sc.workspace_id = v_workspace_id
  ), '[]'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_site_page(p_workspace_slug text, p_website_slug text, p_page_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_website record;
  v_page record;
  v_result jsonb;
begin
  select id into v_workspace_id from public.workspaces where slug = p_workspace_slug;
  if v_workspace_id is null then
    return null;
  end if;

  select id, name, favicon_url, head_tracking_code, body_tracking_code, header_background
  into v_website
  from public.site_websites
  where workspace_id = v_workspace_id and slug = p_website_slug;

  if v_website.id is null then
    return null;
  end if;

  select id, title, meta_description, funnel_id, background_color, custom_css, custom_js, schema_markup
  into v_page
  from public.site_pages
  where website_id = v_website.id and slug = p_page_slug and status = 'published';

  if v_page.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'workspace_id', v_workspace_id,
    'website', jsonb_build_object(
      'id', v_website.id, 'name', v_website.name, 'favicon_url', v_website.favicon_url,
      'head_tracking_code', v_website.head_tracking_code, 'body_tracking_code', v_website.body_tracking_code,
      'header_background', v_website.header_background
    ),
    'page', jsonb_build_object(
      'id', v_page.id, 'title', v_page.title, 'meta_description', v_page.meta_description,
      'background_color', v_page.background_color, 'custom_css', v_page.custom_css,
      'custom_js', v_page.custom_js, 'schema_markup', v_page.schema_markup
    ),
    'branding', (
      select jsonb_build_object(
        'logo_url', coalesce(b.portal_logo_url, b.sidebar_logo_url),
        'primary_color', b.primary_color,
        'secondary_color', b.secondary_color,
        'support_email', b.support_email,
        'support_phone', b.support_phone,
        'display_name', b.display_name
      )
      from public.branding b
      where b.workspace_id = v_workspace_id
    ),
    'funnel', (
      case when v_page.funnel_id is null then null else (
        select jsonb_build_object(
          'id', f.id,
          'name', f.name,
          'pages', coalesce((
            select jsonb_agg(jsonb_build_object('id', sp.id, 'slug', sp.slug, 'title', sp.title, 'position', sp.funnel_position) order by sp.funnel_position)
            from public.site_pages sp
            where sp.funnel_id = f.id and sp.status = 'published'
          ), '[]'::jsonb)
        )
        from public.site_funnels f
        where f.id = v_page.funnel_id
      ) end
    ),
    'sections', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', s.id, 'section_type', s.section_type, 'display_order', s.display_order, 'config', s.config)
        order by s.display_order
      )
      from public.site_page_sections s
      where s.page_id = v_page.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_site_page_by_domain(p_domain text, p_page_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_workspace_slug text;
  v_website record;
  v_page record;
  v_result jsonb;
begin
  select sw.id, sw.workspace_id, sw.name, sw.slug, sw.favicon_url, sw.head_tracking_code, sw.body_tracking_code, sw.header_background, w.slug as workspace_slug
  into v_website
  from public.site_websites sw
  join public.workspaces w on w.id = sw.workspace_id
  where lower(sw.custom_domain) = lower(p_domain);

  if v_website.id is null then
    return null;
  end if;

  v_workspace_id := v_website.workspace_id;
  v_workspace_slug := v_website.workspace_slug;

  select id, title, meta_description, funnel_id, background_color, custom_css, custom_js, schema_markup
  into v_page
  from public.site_pages
  where website_id = v_website.id and slug = p_page_slug and status = 'published';

  if v_page.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'workspace_id', v_workspace_id,
    'workspace_slug', v_workspace_slug,
    'website_slug', v_website.slug,
    'website', jsonb_build_object(
      'id', v_website.id, 'name', v_website.name, 'favicon_url', v_website.favicon_url,
      'head_tracking_code', v_website.head_tracking_code, 'body_tracking_code', v_website.body_tracking_code,
      'header_background', v_website.header_background
    ),
    'page', jsonb_build_object(
      'id', v_page.id, 'title', v_page.title, 'meta_description', v_page.meta_description,
      'background_color', v_page.background_color, 'custom_css', v_page.custom_css,
      'custom_js', v_page.custom_js, 'schema_markup', v_page.schema_markup
    ),
    'branding', (
      select jsonb_build_object(
        'logo_url', coalesce(b.portal_logo_url, b.sidebar_logo_url),
        'primary_color', b.primary_color,
        'secondary_color', b.secondary_color,
        'support_email', b.support_email,
        'support_phone', b.support_phone,
        'display_name', b.display_name
      )
      from public.branding b
      where b.workspace_id = v_workspace_id
    ),
    'funnel', (
      case when v_page.funnel_id is null then null else (
        select jsonb_build_object(
          'id', f.id,
          'name', f.name,
          'pages', coalesce((
            select jsonb_agg(jsonb_build_object('id', sp.id, 'slug', sp.slug, 'title', sp.title, 'position', sp.funnel_position) order by sp.funnel_position)
            from public.site_pages sp
            where sp.funnel_id = f.id and sp.status = 'published'
          ), '[]'::jsonb)
        )
        from public.site_funnels f
        where f.id = v_page.funnel_id
      ) end
    ),
    'sections', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', s.id, 'section_type', s.section_type, 'display_order', s.display_order, 'config', s.config)
        order by s.display_order
      )
      from public.site_page_sections s
      where s.page_id = v_page.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_quiz_for_taking(p_module_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_module record;
begin
  select m.id, m.title, m.passing_score_percent, c.owner_workspace_id into v_module
  from public.learning_modules m join public.learning_courses c on c.id = m.course_id
  where m.id = p_module_id and m.module_type = 'quiz';

  if v_module.id is null then
    raise exception 'quiz not found';
  end if;
  if not public.has_learning_hub_access(v_module.owner_workspace_id) then
    raise exception 'insufficient access to this course';
  end if;

  return jsonb_build_object(
    'module_id', v_module.id,
    'title', v_module.title,
    'passing_score_percent', v_module.passing_score_percent,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'question_text', q.question_text,
        'options', (
          select jsonb_agg(jsonb_build_object('id', o.id, 'option_text', o.option_text) order by o.display_order)
          from public.learning_quiz_options o where o.question_id = q.id
        )
      ) order by q.display_order)
      from public.learning_quiz_questions q where q.module_id = v_module.id
    ), '[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_signature_request_by_token(p_token uuid)
 RETURNS TABLE(signer_id uuid, signer_name text, signer_status text, signed_at timestamp with time zone, declined_at timestamp with time zone, decline_reason text, request_title text, request_status text, attachment_id uuid, attachment_file_name text, attachment_mime_type text, workspace_id uuid, workspace_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return query
  select s.id, s.signer_name, s.status, s.signed_at, s.declined_at, s.decline_reason,
         r.title, r.status, a.id, a.file_name, a.mime_type, r.workspace_id, w.name
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  join public.attachments a on a.id = r.attachment_id
  join public.workspaces w on w.id = r.workspace_id
  where s.access_token = p_token;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_billing_admin(p_workspace_id uuid)
 RETURNS TABLE(user_id uuid, email text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select wu.user_id, u.email
  from public.workspace_users wu
  join public.roles ro on ro.id = wu.role_id
  join auth.users u on u.id = wu.user_id
  where wu.workspace_id = p_workspace_id
    and wu.status = 'active'
    and (wu.is_owner or ro.slug in ('owner', 'admin'))
  order by wu.is_owner desc, wu.created_at asc
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_ghl_connection(p_workspace_id uuid)
 RETURNS TABLE(api_key text, location_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to use this workspace''s GoHighLevel connection';
  end if;

  return query
    select public.decrypt_firm_secret(c.api_key_encrypted), c.location_id
    from public.workspace_ghl_connections c
    where c.workspace_id = p_workspace_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_jotform_api_key(p_workspace_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_value text;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to use this workspace''s JotForm connection';
  end if;

  select public.decrypt_firm_secret(api_key_encrypted) into v_value
  from public.workspace_jotform_connections where workspace_id = p_workspace_id;

  return v_value;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_member_emails(p_workspace_id uuid)
 RETURNS TABLE(user_id uuid, email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  return query
  select wu.user_id, au.email::text
  from public.workspace_users wu
  join auth.users au on au.id = wu.user_id
  where wu.workspace_id = p_workspace_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_tags(p_workspace_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace';
  end if;
  return coalesce(
    (select array_agg(distinct t order by t) from public.clients c, unnest(c.tags) as t where c.workspace_id = p_workspace_id),
    '{}'::text[]
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.grant_workspace_usage_meters(p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan record;
begin
  select p.signup_free_emails, p.signup_free_sms, p.signup_free_storage_gb
  into v_plan
  from public.workspace_subscriptions ws
  join public.platform_subscription_plans p on p.id = ws.plan_id
  where ws.workspace_id = p_workspace_id;

  if not found then
    return;
  end if;

  insert into public.workspace_usage_meters (workspace_id, resource_type, free_units_granted)
  values
    (p_workspace_id, 'email', v_plan.signup_free_emails),
    (p_workspace_id, 'sms', v_plan.signup_free_sms),
    (p_workspace_id, 'storage', v_plan.signup_free_storage_gb)
  on conflict (workspace_id, resource_type) do nothing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_client_sensitive_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if (
    new.date_of_birth is distinct from old.date_of_birth
    or new.ssn_encrypted is distinct from old.ssn_encrypted
    or new.ssn_hash is distinct from old.ssn_hash
    or new.ssn_last4 is distinct from old.ssn_last4
    or new.ein_encrypted is distinct from old.ein_encrypted
    or new.ein_hash is distinct from old.ein_hash
    or new.ein_last4 is distinct from old.ein_last4
    or new.itin_encrypted is distinct from old.itin_encrypted
    or new.itin_hash is distinct from old.itin_hash
    or new.itin_last4 is distinct from old.itin_last4
  )
    and not has_permission(new.workspace_id, 'clients.edit_sensitive')
    and coalesce(current_setting('app.bypass_sensitive_field_guard', true), 'off') <> 'on'
  then
    raise exception 'insufficient permissions to edit sensitive client fields (date of birth, SSN, EIN, ITIN)';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_delete_if_wired_to_automation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key text := TG_ARGV[0];
  v_compare_slug boolean := TG_ARGV[1] = 'slug';
  v_value text;
  v_names text;
begin
  if v_compare_slug then
    v_value := old.slug;
  else
    v_value := old.id::text;
  end if;

  select string_agg(distinct a.name, ', ')
    into v_names
  from automations a
  left join automation_steps s on s.automation_id = a.id
  where a.workspace_id = old.workspace_id
    and ((a.trigger_config ->> v_key) = v_value or (s.action_config ->> v_key) = v_value);

  if v_names is not null then
    raise exception 'this is still wired into automation(s): %. update or remove those steps first', v_names;
  end if;

  return old;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_full_name text;
begin
  v_full_name := nullif(btrim(coalesce(new.raw_user_meta_data->>'first_name', '') || ' ' || coalesce(new.raw_user_meta_data->>'last_name', '')), '');

  insert into public.user_profiles (id, first_name, last_name, display_name)
  values (
    new.id,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    coalesce(new.raw_user_meta_data->>'display_name', v_full_name, new.email)
  )
  on conflict (id) do nothing;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_plan_price_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ws record;
  v_effective date;
begin
  if new.base_price_cents is not distinct from old.base_price_cents
     and new.per_seat_price_cents is not distinct from old.per_seat_price_cents
     and new.email_overage_rate_cents is not distinct from old.email_overage_rate_cents
     and new.storage_overage_rate_cents is not distinct from old.storage_overage_rate_cents
     and new.sms_overage_rate_cents is not distinct from old.sms_overage_rate_cents
  then
    return new;
  end if;

  for ws in
    select id, workspace_id, current_period_end
    from public.workspace_subscriptions
    where plan_id = new.id
      and price_change_effective_date is null
      and stripe_status <> 'canceled'
  loop
    v_effective := coalesce(ws.current_period_end, now())::date;
    while v_effective < (current_date + 60) loop
      v_effective := (v_effective + interval '1 month')::date;
    end loop;

    update public.workspace_subscriptions
    set price_change_notice_sent_at = now(),
        price_change_effective_date = v_effective
    where id = ws.id;

    insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, dedupe_key)
    select ws.workspace_id, 'Email', 'plan-price-change-notice', 'plan_price_change',
           jsonb_build_object('effective_date', v_effective, 'new_base_price', (new.base_price_cents::numeric / 100)),
           wu.user_id, u.email,
           'plan_price_change:' || ws.id || ':' || v_effective::text || ':' || wu.user_id::text
    from public.workspace_users wu
    join public.roles ro on ro.id = wu.role_id
    join auth.users u on u.id = wu.user_id
    where wu.workspace_id = ws.workspace_id
      and wu.status = 'active'
      and (wu.is_owner or ro.slug in ('owner', 'admin'))
    on conflict (workspace_id, template_key, dedupe_key) where dedupe_key is not null do nothing;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_accepted_platform_terms(p_version text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.consent_records
    where user_id = auth.uid()
      and consent_type = 'platform_terms'
      and version = p_version
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_completed_portal_basic_info()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.clients c
    join public.client_portal_users cpu on cpu.client_id = c.id
    where cpu.user_id = auth.uid() and cpu.status = 'active' and c.portal_basic_info_completed_at is not null
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_config_object_share_access(p_table text, p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.config_object_shares s
    where s.object_type = p_table and s.object_id = p_id
      and s.status in ('pending', 'accepted')
      and public.is_workspace_member(s.shared_with_workspace_id)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_learning_hub_access(p_owner_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_workspace_member(p_owner_workspace_id)
    or exists (
      select 1 from public.firm_connections fc
      where fc.parent_workspace_id = p_owner_workspace_id
        and fc.status = 'active'
        and fc.child_workspace_id is not null
        and public.is_workspace_member(fc.child_workspace_id)
    );
$function$
;

CREATE OR REPLACE FUNCTION public.has_pending_engagement_share_access(p_engagement_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.engagement_shares es
    where es.engagement_id = p_engagement_id
      and es.status in ('pending', 'corrections_requested')
      and public.is_workspace_member(es.shared_with_workspace_id)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_permission(p_workspace_id uuid, p_permission_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.workspace_users wu
    join public.permissions p on p.key = p_permission_key
    where wu.workspace_id = p_workspace_id
      and wu.user_id = auth.uid()
      and wu.status = 'active'
      and coalesce(
        (select rpo.granted from public.role_permission_overrides rpo
         where rpo.role_id = wu.role_id and rpo.workspace_id = p_workspace_id and rpo.permission_id = p.id),
        exists (select 1 from public.role_permissions rp where rp.role_id = wu.role_id and rp.permission_id = p.id)
      )
  ) or public.is_platform_admin();
$function$
;

CREATE OR REPLACE FUNCTION public.hash_firm_secret(p_plaintext text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select case when p_plaintext is null or btrim(p_plaintext) = '' then null
    else encode(extensions.hmac(regexp_replace(p_plaintext, '\D', '', 'g'), (select decrypted_secret from vault.decrypted_secrets where name = 'firm_tax_profile_key'), 'sha256'), 'hex')
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.invite_portal_user(p_client_id uuid, p_email text, p_name text DEFAULT NULL::text, p_is_primary boolean DEFAULT false)
 RETURNS client_portal_users
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_row public.client_portal_users;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_client_id;
  if v_workspace_id is null then
    raise exception 'client not found';
  end if;
  if not public.has_permission(v_workspace_id, 'portal.manage') then
    raise exception 'insufficient permissions to invite portal users for this client';
  end if;

  insert into public.client_portal_users (client_id, workspace_id, invited_email, invited_name, is_primary, invited_by)
  values (p_client_id, v_workspace_id, lower(p_email), p_name, p_is_primary, auth.uid())
  on conflict (client_id, lower(invited_email)) where status = 'invited'
  do update set invited_name = excluded.invited_name, is_primary = excluded.is_primary,
    invitation_token = gen_random_uuid(), token_expires_at = now() + interval '7 days'
  returning * into v_row;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.invite_workspace_user(p_workspace_id uuid, p_user_id uuid, p_role_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to invite members to this workspace';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id and (workspace_id is null or workspace_id = p_workspace_id)) then
    raise exception 'role does not belong to this workspace';
  end if;

  insert into public.workspace_users (workspace_id, user_id, role_id, status, invited_by, invited_at)
  values (p_workspace_id, p_user_id, p_role_id, 'invited', auth.uid(), now())
  on conflict (workspace_id, user_id) do update
    set role_id = excluded.role_id, status = 'invited', invited_by = excluded.invited_by, invited_at = now()
  returning id into v_id;

  insert into public.notification_queue (workspace_id, recipient_user_id, channel, template_key, payload)
  values (p_workspace_id, p_user_id, 'Portal', 'workspace_invitation',
    jsonb_build_object('workspace_id', p_workspace_id, 'invited_by', auth.uid()));

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_account_locked(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((select locked_until > now() from public.user_profiles where id = p_user_id), false);
$function$
;

CREATE OR REPLACE FUNCTION public.is_ai_sandbox_workspace(p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select is_demo from public.workspaces where id = p_workspace_id), false);
$function$
;

CREATE OR REPLACE FUNCTION public.is_notification_enabled(p_user_id uuid, p_workspace_id uuid, p_event_type text, p_channel text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select enabled from public.notification_preferences
     where user_id = p_user_id and workspace_id = p_workspace_id and event_type = p_event_type and channel = p_channel),
    true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_pending_signer_for_signature_request(p_workspace_id uuid, p_signature_request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_entity_type text;
  v_entity_id uuid;
  v_caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_caller_email = '' then
    return false;
  end if;

  select a.entity_type, a.entity_id
  into v_entity_type, v_entity_id
  from public.signature_requests r
  join public.attachments a on a.id = r.attachment_id
  where r.id = p_signature_request_id and r.workspace_id = p_workspace_id;

  if v_entity_type is null then
    return false;
  end if;

  return public.is_portal_user_for_entity(v_entity_type, v_entity_id)
    and exists (
      select 1 from public.signature_request_signers s
      where s.signature_request_id = p_signature_request_id
        and s.status = 'pending'
        and lower(s.signer_email) = v_caller_email
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select is_platform_admin from public.user_profiles where id = auth.uid()), false);
$function$
;

CREATE OR REPLACE FUNCTION public.is_platform_ai_operator()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select is_platform_ai_operator or is_platform_admin from public.user_profiles where id = auth.uid()), false);
$function$
;

CREATE OR REPLACE FUNCTION public.is_platform_it()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select is_platform_it or is_platform_admin from public.user_profiles where id = auth.uid()),
    false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_portal_accessible_entity_id(p_entity_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_portal_user(p_entity_id)
    or exists (select 1 from public.engagements e where e.id = p_entity_id and public.is_portal_user(e.client_id));
$function$
;

CREATE OR REPLACE FUNCTION public.is_portal_member(p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.client_portal_users
    where user_id = auth.uid() and status = 'active' and workspace_id = p_workspace_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_portal_user(p_client_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.client_portal_users
    where client_id = p_client_id and user_id = auth.uid() and status = 'active'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_portal_user_for_entity(p_entity_type text, p_entity_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when p_entity_type = 'client' then public.is_portal_user(p_entity_id)
    when p_entity_type = 'engagement' then exists (
      select 1 from public.engagements e where e.id = p_entity_id and public.is_portal_user(e.client_id)
    )
    else false
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_valid_config_table(p_table text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select p_table = any(array[
    'service_categories', 'services', 'processes', 'pipelines', 'organizer_templates',
    'document_request_templates', 'document_folder_templates', 'engagement_letter_templates', 'email_templates',
    'sms_templates', 'pricing_rules', 'billing_rules', 'automations', 'dashboards'
  ]);
$function$
;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = p_workspace_id
      and wu.user_id = auth.uid()
      and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  ) or public.is_platform_admin();
$function$
;

CREATE OR REPLACE FUNCTION public.is_workspace_ghl_connected(p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.workspace_ghl_connections where workspace_id = p_workspace_id);
$function$
;

CREATE OR REPLACE FUNCTION public.is_workspace_jotform_connected(p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.workspace_jotform_connections where workspace_id = p_workspace_id);
$function$
;

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.workspace_users
    where workspace_id = p_workspace_id and user_id = auth.uid() and status = 'active'
  ) or public.is_platform_admin();
$function$
;

CREATE OR REPLACE FUNCTION public.ledger_invoice_issued()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_balance numeric(12,2);
begin
  select coalesce(sum(amount), 0) + new.total_amount into v_balance
    from public.client_ledger where client_id = new.client_id;

  insert into public.client_ledger (workspace_id, client_id, entry_type, reference_table, reference_id, amount, balance_after, description)
  values (new.workspace_id, new.client_id, 'invoice', 'invoices', new.id, new.total_amount, v_balance, 'Invoice ' || coalesce(new.invoice_number, '') || ' issued');

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.link_public_portal_account(p_workspace_id uuid, p_client_id uuid, p_auth_user_id uuid, p_email text, p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_auth_email text;
  v_is_primary boolean;
begin
  select email into v_auth_email from auth.users where id = p_auth_user_id;
  if v_auth_email is null or lower(v_auth_email) <> lower(btrim(p_email)) then
    raise exception 'account verification failed';
  end if;

  if exists (select 1 from public.client_portal_users where client_id = p_client_id and user_id = p_auth_user_id) then
    return;
  end if;

  v_is_primary := not exists (
    select 1 from public.client_portal_users where client_id = p_client_id and status = 'active'
  );

  insert into public.client_portal_users (client_id, workspace_id, invited_email, invited_name, is_primary, status, user_id, accepted_at)
  values (p_client_id, p_workspace_id, lower(btrim(p_email)), nullif(btrim(p_name), ''), v_is_primary, 'active', p_auth_user_id, now());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_workspace_tags_with_usage(p_workspace_id uuid)
 RETURNS TABLE(id uuid, name text, client_count bigint, automation_names text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace';
  end if;

  return query
  select
    wt.id,
    wt.name,
    coalesce((select count(*) from public.clients c where c.workspace_id = p_workspace_id and wt.name = any(c.tags)), 0),
    coalesce((
      select array_agg(distinct a.name)
      from public.automations a
      where a.workspace_id = p_workspace_id
        and (
          (a.trigger_type = 'client.tag_added' and a.trigger_config->>'tag' = wt.name)
          or exists (
            select 1 from public.automation_steps s
            where s.automation_id = a.id and s.action_type in ('add_tag', 'remove_tag') and s.action_config->>'tag' = wt.name
          )
          or exists (
            select 1 from public.automation_step_edges e, jsonb_array_elements(coalesce(e.branch_conditions, '[]'::jsonb)) as cond
            where e.automation_id = a.id and cond->>'field' = 'client.tags' and cond->>'value' = wt.name
          )
        )
    ), '{}'::text[])
  from public.workspace_tags wt
  where wt.workspace_id = p_workspace_id
  order by wt.name;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.log_engagement_completed_on_invoice_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'paid' and old.status is distinct from new.status and new.engagement_id is not null then
    update public.engagements
    set completed_date = coalesce(completed_date, now())
    where id = new.engagement_id;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.notification_queue
  set read_at = now()
  where recipient_user_id = auth.uid() and workspace_id = p_workspace_id and read_at is null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_document_request_item_received(p_item_status_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
begin
  select r.workspace_id into v_workspace_id
  from public.document_request_item_statuses s
  join public.document_requests r on r.id = s.document_request_id
  where s.id = p_item_status_id;

  if v_workspace_id is null then
    raise exception 'request item not found';
  end if;
  if not public.has_permission(v_workspace_id, 'documents.upload') then
    raise exception 'insufficient permissions';
  end if;

  update public.document_request_item_statuses
  set status = 'uploaded', updated_at = now()
  where id = p_item_status_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_document_request_reviewed(p_document_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.document_requests where id = p_document_request_id;
  if v_workspace_id is null then
    raise exception 'document request not found';
  end if;
  if not public.has_permission(v_workspace_id, 'documents.view') then
    raise exception 'insufficient permissions';
  end if;

  update public.document_requests
  set reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_document_request_id and status = 'completed';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_lesson_complete(p_module_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_module record;
  v_workspace_id uuid;
begin
  select m.id, m.module_type, c.owner_workspace_id into v_module
  from public.learning_modules m join public.learning_courses c on c.id = m.course_id
  where m.id = p_module_id;

  if v_module.id is null then
    raise exception 'module not found';
  end if;
  if v_module.module_type <> 'lesson' then
    raise exception 'this module is a quiz -- submit it with submit_quiz_attempt instead';
  end if;
  if not public.has_learning_hub_access(v_module.owner_workspace_id) then
    raise exception 'insufficient access to this course';
  end if;

  select workspace_id into v_workspace_id
  from public.workspace_users
  where user_id = auth.uid() and status = 'active'
  order by created_at asc
  limit 1;

  insert into public.learning_module_completions (module_id, user_id, workspace_id, passed, completed_at)
  values (p_module_id, auth.uid(), v_workspace_id, true, now())
  on conflict (module_id, user_id) do update set completed_at = now(), passed = true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.notification_queue
  set read_at = now()
  where id = p_notification_id and recipient_user_id = auth.uid() and read_at is null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_organizer_information_request_responded(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.organizer_information_requests where id = p_request_id;
  if v_workspace_id is null then
    raise exception 'information request not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;

  update public.organizer_information_requests
  set status = 'responded', responded_at = now()
  where id = p_request_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_organizer_information_request_viewed(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client_id uuid;
begin
  select r.client_id into v_client_id
  from public.organizer_information_requests req
  join public.organizer_responses r on r.id = req.organizer_response_id
  where req.id = p_request_id;

  if v_client_id is null then
    raise exception 'information request not found';
  end if;
  if not public.is_portal_user(v_client_id) then
    raise exception 'insufficient permissions';
  end if;

  update public.organizer_information_requests
  set status = 'viewed', viewed_at = coalesce(viewed_at, now())
  where id = p_request_id and status = 'active';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.merge_clients(p_primary_client_id uuid, p_duplicate_client_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_dup_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_primary_client_id;
  select workspace_id into v_dup_workspace_id from public.clients where id = p_duplicate_client_id;

  if v_workspace_id is null or v_dup_workspace_id is null then
    raise exception 'client not found';
  end if;
  if v_workspace_id <> v_dup_workspace_id then
    raise exception 'cannot merge clients from different workspaces';
  end if;
  if not public.has_permission(v_workspace_id, 'clients.merge') then
    raise exception 'insufficient permissions to merge clients in this workspace';
  end if;

  update public.clients
  set merged_into_client_id = p_primary_client_id, lifecycle_status = 'archived'
  where id = p_duplicate_client_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.needs_billing_card(p_workspace_id uuid)
 RETURNS TABLE(needed boolean, urgent boolean, days_until_period_end integer, period_end timestamp with time zone, card_last4 text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sub record;
  v_covered_by_ero boolean;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only a workspace admin can view billing card status';
  end if;

  select ws.stripe_customer_id, ws.default_payment_method_id, ws.current_period_end, ws.card_last4
  into v_sub
  from public.workspace_subscriptions ws
  where ws.workspace_id = p_workspace_id
    and ws.stripe_status in ('active', 'trialing', 'past_due')
  limit 1;

  if v_sub.stripe_customer_id is null then
    return query select false, false, null::int, null::timestamptz, null::text;
    return;
  end if;

  if v_sub.default_payment_method_id is not null then
    return query select false, false, null::int, v_sub.current_period_end, v_sub.card_last4;
    return;
  end if;

  select exists (
    select 1 from public.firm_connections fc
    where fc.child_workspace_id = p_workspace_id
      and fc.relationship_type = 'ero_ptin'
      and fc.status = 'active'
      and fc.billing_responsibility = 'ero'
  ) into v_covered_by_ero;

  if v_covered_by_ero then
    return query select false, false, null::int, v_sub.current_period_end, null::text;
    return;
  end if;

  return query
    select
      true,
      v_sub.current_period_end is not null and v_sub.current_period_end <= now() + interval '5 days',
      case when v_sub.current_period_end is not null then ceil(extract(epoch from (v_sub.current_period_end - now())) / 86400)::int else null end,
      v_sub.current_period_end,
      null::text;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_admins_of_automation_failure()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'failed' then
    perform public.notify_workspace_admins(
      new.workspace_id,
      'AUTOMATION_STEP_FAILED',
      'automation_step_failed',
      jsonb_build_object(
        'error', new.error_message,
        'action_type', new.execution_data->>'action_type',
        'automation_id', new.automation_id
      ),
      array['In-App']::text[],
      'Medium',
      'automation',
      new.automation_id
    );
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_invoice_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_recipient_id uuid;
  v_client_name text;
begin
  if new.status <> 'paid' or old.status is not distinct from 'paid' then
    return new;
  end if;

  select coalesce(nullif(trim(c.first_name || ' ' || c.last_name), ''), c.business_name, 'A client')
  into v_client_name
  from public.clients c where c.id = new.client_id;

  if new.engagement_id is not null then
    select assigned_staff_id into v_recipient_id from public.engagements where id = new.engagement_id;
  end if;
  if v_recipient_id is null then
    select relationship_manager_id into v_recipient_id from public.clients where id = new.client_id;
  end if;
  if v_recipient_id is null then
    select user_id into v_recipient_id
    from public.workspace_users
    where workspace_id = new.workspace_id and is_owner = true and status = 'active'
    limit 1;
  end if;

  if v_recipient_id is null or not public.is_notification_enabled(v_recipient_id, new.workspace_id, 'INVOICE_PAID', 'In-App') then
    return new;
  end if;

  perform public.create_notification(
    new.workspace_id, v_recipient_id, 'INVOICE_PAID', 'invoice_paid',
    jsonb_build_object('client_name', v_client_name, 'invoice_number', new.invoice_number, 'total_amount', new.total_amount::text),
    array['In-App'], 'Medium', 'client', new.client_id
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_organizer_information_request(p_request_id uuid, p_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_send_email boolean;
  v_send_sms boolean;
  v_show_in_portal boolean;
  v_entity_type text;
  v_entity_id uuid;
  v_primary_email text;
  v_primary_phone text;
  v_thread_id uuid;
begin
  select req.workspace_id, r.client_id, req.sent_via_email, req.sent_via_sms, req.shown_in_portal,
    case when r.engagement_id is not null then 'engagement' else 'client' end, coalesce(r.engagement_id, r.client_id)
  into v_workspace_id, v_client_id, v_send_email, v_send_sms, v_show_in_portal, v_entity_type, v_entity_id
  from public.organizer_information_requests req
  join public.organizer_responses r on r.id = req.organizer_response_id
  where req.id = p_request_id;

  if v_workspace_id is null then
    raise exception 'information request not found';
  end if;

  if v_send_email or v_send_sms then
    select primary_email, primary_phone into v_primary_email, v_primary_phone
    from public.clients where id = v_client_id;
  end if;

  if v_send_email and v_primary_email is not null then
    insert into public.notification_queue (workspace_id, recipient_email, channel, template_key, payload, entity_type, entity_id, event_type)
    values (v_workspace_id, v_primary_email, 'Email', 'organizer-information-request',
      jsonb_build_object('message', p_message), v_entity_type, v_entity_id, 'organizer_information_request');
  end if;

  if v_send_sms and v_primary_phone is not null then
    insert into public.notification_queue (workspace_id, recipient_phone, channel, template_key, payload, entity_type, entity_id, event_type)
    values (v_workspace_id, v_primary_phone, 'SMS', 'organizer-information-request',
      jsonb_build_object('message', p_message), v_entity_type, v_entity_id, 'organizer_information_request');
  end if;

  if v_show_in_portal then
    select id into v_thread_id from public.message_threads
    where workspace_id = v_workspace_id and entity_type = 'client' and entity_id = v_client_id and status = 'open'
    order by coalesce(last_message_at, created_at) desc
    limit 1;

    if v_thread_id is null then
      insert into public.message_threads (workspace_id, entity_type, entity_id, subject, channel)
      values (v_workspace_id, 'client', v_client_id, 'Information needed on your organizer', 'portal')
      returning id into v_thread_id;
    end if;

    insert into public.messages (workspace_id, thread_id, sender_type, is_internal, body)
    values (v_workspace_id, v_thread_id, 'staff', false, p_message);

    update public.message_threads set last_message_at = now() where id = v_thread_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_organizer_reviewed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_recipient_id uuid;
  v_client_name text;
begin
  if new.review_status is null or new.review_status is not distinct from old.review_status then
    return new;
  end if;

  select relationship_manager_id,
    coalesce(nullif(trim(first_name || ' ' || last_name), ''), business_name, 'A client')
  into v_recipient_id, v_client_name
  from public.clients where id = new.client_id;

  if v_recipient_id is null then
    select user_id into v_recipient_id
    from public.workspace_users
    where workspace_id = new.workspace_id and is_owner = true and status = 'active'
    limit 1;
  end if;

  if v_recipient_id is null or not public.is_notification_enabled(v_recipient_id, new.workspace_id, 'ORGANIZER_REVIEWED', 'In-App') then
    return new;
  end if;

  perform public.create_notification(
    new.workspace_id, v_recipient_id, 'ORGANIZER_REVIEWED', 'organizer_reviewed',
    jsonb_build_object('client_name', v_client_name, 'review_status', new.review_status::text),
    array['In-App'], 'Medium', 'client', new.client_id
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_payment_received()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_recipient_id uuid;
  v_client_name text;
  v_invoice_number text;
  v_engagement_id uuid;
begin
  select i.engagement_id, i.invoice_number,
    coalesce(nullif(trim(c.first_name || ' ' || c.last_name), ''), c.business_name, 'A client')
  into v_engagement_id, v_invoice_number, v_client_name
  from public.invoices i
  left join public.clients c on c.id = i.client_id
  where i.id = new.invoice_id;

  if v_engagement_id is not null then
    select assigned_staff_id into v_recipient_id from public.engagements where id = v_engagement_id;
  end if;
  if v_recipient_id is null then
    select relationship_manager_id into v_recipient_id from public.clients where id = new.client_id;
  end if;
  if v_recipient_id is null then
    select user_id into v_recipient_id
    from public.workspace_users
    where workspace_id = new.workspace_id and is_owner = true and status = 'active'
    limit 1;
  end if;

  if v_recipient_id is null or not public.is_notification_enabled(v_recipient_id, new.workspace_id, 'PAYMENT_RECEIVED', 'In-App') then
    return new;
  end if;

  perform public.create_notification(
    new.workspace_id, v_recipient_id, 'PAYMENT_RECEIVED', 'payment_received',
    jsonb_build_object('client_name', v_client_name, 'invoice_number', v_invoice_number, 'amount', new.amount::text),
    array['In-App'], 'Medium', 'client', new.client_id
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_staff_document_request_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_recipient_id uuid;
  v_client_name text;
  v_request_title text;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' then
    return new;
  end if;

  if new.entity_type = 'engagement' then
    select e.workspace_id, e.client_id, e.assigned_staff_id,
      coalesce(nullif(trim(c.first_name || ' ' || c.last_name), ''), c.business_name, 'A client')
    into v_workspace_id, v_client_id, v_recipient_id, v_client_name
    from public.engagements e
    left join public.clients c on c.id = e.client_id
    where e.id = new.entity_id;
  elsif new.entity_type = 'client' then
    v_client_id := new.entity_id;
    select workspace_id, relationship_manager_id,
      coalesce(nullif(trim(first_name || ' ' || last_name), ''), business_name, 'A client')
    into v_workspace_id, v_recipient_id, v_client_name
    from public.clients where id = new.entity_id;
  else
    return new;
  end if;

  if v_workspace_id is null then
    return new;
  end if;

  if v_recipient_id is null then
    select user_id into v_recipient_id
    from public.workspace_users
    where workspace_id = v_workspace_id and is_owner = true and status = 'active'
    limit 1;
  end if;

  if v_recipient_id is null or not public.is_notification_enabled(v_recipient_id, v_workspace_id, 'DOCUMENT_REQUEST_COMPLETED', 'In-App') then
    return new;
  end if;

  v_request_title := coalesce(new.title, 'Document request');

  perform public.create_notification(
    v_workspace_id, v_recipient_id, 'DOCUMENT_REQUEST_COMPLETED', 'document_request_completed',
    jsonb_build_object('client_name', v_client_name, 'request_title', v_request_title),
    array['In-App'], 'Medium', new.entity_type, new.entity_id
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_workspace_admins(p_workspace_id uuid, p_type text, p_template_key text, p_payload jsonb, p_channels text[], p_priority text, p_entity_type text, p_entity_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_recipient record;
begin
  for v_recipient in
    select wu.user_id
    from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = p_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    perform public.create_notification(
      p_workspace_id, v_recipient.user_id, p_type, p_template_key, p_payload, p_channels, p_priority, p_entity_type, p_entity_id
    );
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.portal_client_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select client_id from public.client_portal_users
  where user_id = auth.uid() and status = 'active'
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.prefill_engagement_assignments()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_client record;
begin
  if new.assigned_staff_id is null or new.reviewer_id is null or new.compliance_officer_id is null then
    select relationship_manager_id, default_reviewer_id, default_compliance_officer_id
      into v_client
      from public.clients
      where id = new.client_id;

    if v_client is not null then
      new.assigned_staff_id := coalesce(new.assigned_staff_id, v_client.relationship_manager_id);
      new.reviewer_id := coalesce(new.reviewer_id, v_client.default_reviewer_id);
      new.compliance_officer_id := coalesce(new.compliance_officer_id, v_client.default_compliance_officer_id);
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.propose_client_contact_field(p_field text, p_new_value text, p_organizer_response_id uuid DEFAULT NULL::uuid, p_organizer_field_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_portal_user_id uuid;
  v_client_id uuid;
  v_workspace_id uuid;
  v_current text;
  v_decision text;
  v_batch uuid := gen_random_uuid();
  v_source text := case when p_organizer_field_id is not null then 'organizer' else 'basic_info' end;
begin
  select cpu.id, cpu.client_id, cpu.workspace_id into v_portal_user_id, v_client_id, v_workspace_id
  from public.client_portal_users cpu where cpu.user_id = auth.uid() and cpu.status = 'active' limit 1;
  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  if p_field not in ('first_name', 'middle_name', 'last_name', 'suffix', 'business_name', 'primary_email', 'primary_phone') then
    raise exception 'invalid field %', p_field;
  end if;

  execute format('select %I from public.clients where id = $1', p_field) into v_current using v_client_id;

  v_decision := public._decide_client_field_change(
    v_workspace_id, v_client_id, 'clients', p_field, null, v_current, p_new_value,
    v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id
  );

  if v_decision = 'applied' then
    execute format('update public.clients set %I = $1, updated_at = now() where id = $2', p_field) using p_new_value, v_client_id;
  elsif v_decision = 'queued' then
    perform public._notify_admins_of_pending_client_change(v_workspace_id, v_client_id, v_batch);
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.propose_client_date_of_birth(p_new_value date, p_organizer_response_id uuid DEFAULT NULL::uuid, p_organizer_field_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_portal_user_id uuid;
  v_client_id uuid;
  v_workspace_id uuid;
  v_current date;
  v_decision text;
  v_batch uuid := gen_random_uuid();
  v_source text := case when p_organizer_field_id is not null then 'organizer' else 'basic_info' end;
begin
  select cpu.id, cpu.client_id, cpu.workspace_id into v_portal_user_id, v_client_id, v_workspace_id
  from public.client_portal_users cpu where cpu.user_id = auth.uid() and cpu.status = 'active' limit 1;
  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  select date_of_birth into v_current from public.clients where id = v_client_id;

  v_decision := public._decide_client_field_change(
    v_workspace_id, v_client_id, 'clients', 'date_of_birth', null, v_current::text, p_new_value::text,
    v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id
  );

  if v_decision = 'applied' then
    perform set_config('app.bypass_sensitive_field_guard', 'on', true);
    update public.clients set date_of_birth = p_new_value, updated_at = now() where id = v_client_id;
  elsif v_decision = 'queued' then
    perform public._notify_admins_of_pending_client_change(v_workspace_id, v_client_id, v_batch);
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.propose_client_full_name(p_first_name text, p_middle_name text, p_last_name text, p_suffix text, p_organizer_response_id uuid DEFAULT NULL::uuid, p_organizer_field_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_portal_user_id uuid;
  v_client_id uuid;
  v_workspace_id uuid;
  v_cur_first text;
  v_cur_middle text;
  v_cur_last text;
  v_cur_suffix text;
  v_batch uuid := gen_random_uuid();
  v_source text := case when p_organizer_field_id is not null then 'organizer' else 'basic_info' end;
  v_any_queued boolean := false;
  v_decision text;
begin
  select cpu.id, cpu.client_id, cpu.workspace_id into v_portal_user_id, v_client_id, v_workspace_id
  from public.client_portal_users cpu where cpu.user_id = auth.uid() and cpu.status = 'active' limit 1;
  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  select first_name, middle_name, last_name, suffix into v_cur_first, v_cur_middle, v_cur_last, v_cur_suffix
  from public.clients where id = v_client_id;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'clients', 'first_name', null, v_cur_first, p_first_name, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.clients set first_name = p_first_name, updated_at = now() where id = v_client_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'clients', 'middle_name', null, v_cur_middle, p_middle_name, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.clients set middle_name = p_middle_name, updated_at = now() where id = v_client_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'clients', 'last_name', null, v_cur_last, p_last_name, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.clients set last_name = p_last_name, updated_at = now() where id = v_client_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'clients', 'suffix', null, v_cur_suffix, p_suffix, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.clients set suffix = p_suffix, updated_at = now() where id = v_client_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  if v_any_queued then
    perform public._notify_admins_of_pending_client_change(v_workspace_id, v_client_id, v_batch);
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.propose_client_mailing_address(p_street text, p_city text, p_state text, p_zip text, p_organizer_response_id uuid DEFAULT NULL::uuid, p_organizer_field_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_portal_user_id uuid;
  v_client_id uuid;
  v_workspace_id uuid;
  v_address_id uuid;
  v_cur_street text;
  v_cur_city text;
  v_cur_state text;
  v_cur_zip text;
  v_batch uuid := gen_random_uuid();
  v_source text := case when p_organizer_field_id is not null then 'organizer' else 'basic_info' end;
  v_any_queued boolean := false;
  v_decision text;
begin
  select cpu.id, cpu.client_id, cpu.workspace_id into v_portal_user_id, v_client_id, v_workspace_id
  from public.client_portal_users cpu where cpu.user_id = auth.uid() and cpu.status = 'active' limit 1;
  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  select id, street, city, state, zip into v_address_id, v_cur_street, v_cur_city, v_cur_state, v_cur_zip
  from public.client_addresses
  where client_id = v_client_id and address_type = 'mailing'
  order by is_primary desc, created_at asc
  limit 1;

  if v_address_id is null then
    insert into public.client_addresses (client_id, workspace_id, address_type, is_primary, display_order)
    values (v_client_id, v_workspace_id, 'mailing', true, 0)
    returning id into v_address_id;
    v_cur_street := null;
    v_cur_city := null;
    v_cur_state := null;
    v_cur_zip := null;
  end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'client_addresses', 'street', v_address_id, v_cur_street, p_street, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.client_addresses set street = p_street, updated_at = now() where id = v_address_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'client_addresses', 'city', v_address_id, v_cur_city, p_city, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.client_addresses set city = p_city, updated_at = now() where id = v_address_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'client_addresses', 'state', v_address_id, v_cur_state, p_state, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.client_addresses set state = p_state, updated_at = now() where id = v_address_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'client_addresses', 'zip', v_address_id, v_cur_zip, p_zip, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.client_addresses set zip = p_zip, updated_at = now() where id = v_address_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  if v_any_queued then
    perform public._notify_admins_of_pending_client_change(v_workspace_id, v_client_id, v_batch);
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.propose_client_sensitive_field(p_field text, p_new_value text, p_organizer_response_id uuid DEFAULT NULL::uuid, p_organizer_field_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_portal_user_id uuid;
  v_client_id uuid;
  v_workspace_id uuid;
  v_batch uuid := gen_random_uuid();
  v_source text := case when p_organizer_field_id is not null then 'organizer' else 'basic_info' end;
  v_stored_value text;
  v_last4 text;
  v_old_last4 text;
begin
  select cpu.id, cpu.client_id, cpu.workspace_id into v_portal_user_id, v_client_id, v_workspace_id
  from public.client_portal_users cpu where cpu.user_id = auth.uid() and cpu.status = 'active' limit 1;
  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  if p_field not in ('date_of_birth', 'ssn') then
    raise exception 'invalid field %', p_field;
  end if;
  if p_new_value is null or btrim(p_new_value) = '' then
    return;
  end if;

  if p_field = 'ssn' then
    v_stored_value := encode(public.encrypt_client_secret(p_new_value), 'base64');
    v_last4 := nullif(right(regexp_replace(p_new_value, '\D', '', 'g'), 4), '');
    select ssn_last4 into v_old_last4 from public.clients where id = v_client_id;
  else
    v_stored_value := p_new_value;
    v_last4 := null;
    select date_of_birth::text into v_old_last4 from public.clients where id = v_client_id;
  end if;

  insert into public.client_pending_changes (
    workspace_id, client_id, source, organizer_response_id, organizer_field_id,
    target_table, target_column, old_value, new_value, new_value_last4, batch_id, submitted_by_portal_user_id
  ) values (
    v_workspace_id, v_client_id, v_source, p_organizer_response_id, p_organizer_field_id,
    'clients', p_field, v_old_last4, v_stored_value, v_last4, v_batch, v_portal_user_id
  )
  on conflict (client_id, target_table, target_column, coalesce(client_address_id, '00000000-0000-0000-0000-000000000000'))
    where status = 'pending'
    do update set new_value = excluded.new_value, new_value_last4 = excluded.new_value_last4, old_value = excluded.old_value, batch_id = excluded.batch_id, created_at = now();

  perform public._notify_admins_of_pending_client_change(v_workspace_id, v_client_id, v_batch);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.propose_organizer_answer_correction(p_item_id uuid, p_proposed_value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client_id uuid;
  v_request_id uuid;
  v_status text;
  v_was_answered boolean;
begin
  select r.client_id, item.request_id, item.status, item.was_answered_when_flagged
  into v_client_id, v_request_id, v_status, v_was_answered
  from public.organizer_information_request_items item
  join public.organizer_information_requests req on req.id = item.request_id
  join public.organizer_responses r on r.id = req.organizer_response_id
  where item.id = p_item_id;

  if v_client_id is null then
    raise exception 'information request item not found';
  end if;
  if not public.is_portal_user(v_client_id) then
    raise exception 'insufficient permissions';
  end if;
  if not v_was_answered then
    raise exception 'this question was unanswered -- save an answer instead';
  end if;
  if v_status not in ('pending', 'rejected') then
    raise exception 'this item is not awaiting a response';
  end if;

  update public.organizer_information_request_items
  set proposed_value = p_proposed_value, status = 'client_responded'
  where id = p_item_id;

  update public.organizer_information_requests
  set status = 'responded', responded_at = coalesce(responded_at, now())
  where id = v_request_id and status in ('active', 'viewed');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_engagement_current_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.current_stage is distinct from old.current_stage and current_user <> 'postgres' then
    raise exception 'current_stage cannot be set directly; it is derived from the linked workflow run';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_entry_lead_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    if old.is_entry_stage then
      raise exception 'The entry lead stage cannot be deleted.';
    end if;
    -- Don't allow deleting a stage that clients are currently sitting on.
    if exists (select 1 from public.clients where workspace_id = old.workspace_id and lifecycle_status = old.key) then
      raise exception 'Move clients off "%" before deleting this stage.', old.label;
    end if;
    return old;
  end if;

  if old.is_entry_stage and (new.is_entry_stage is not true or new.key <> old.key) then
    raise exception 'The entry lead stage must stay keyed "lead".';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_workspace_users_owner_flag()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.is_owner is distinct from old.is_owner and current_user <> 'postgres' then
    raise exception 'is_owner cannot be changed directly; workspace ownership transfer is not supported yet';
  end if;

  -- Self-service acceptance (RLS lets an invited user flip their own row
  -- from status='invited' to 'active') must not double as a role change --
  -- otherwise an invited user could grant themselves the Owner/Admin role
  -- (global, readable by any authenticated user) in the same update.
  -- Workspace admins performing an actual role reassignment are unaffected.
  if new.role_id is distinct from old.role_id
     and current_user <> 'postgres'
     and not public.is_workspace_admin(old.workspace_id) then
    raise exception 'role_id cannot be changed by the affected user; ask a workspace admin to change roles';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_agent_evidence(p_run_id uuid, p_evidence_type text, p_payload jsonb DEFAULT '{}'::jsonb, p_finding_id uuid DEFAULT NULL::uuid, p_storage_path text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_evidence_id uuid;
begin
  if not public.can_access_admin_ai() then
    raise exception 'insufficient permissions';
  end if;

  insert into public.ai_agent_evidence (run_id, finding_id, evidence_type, payload, storage_path)
  values (p_run_id, p_finding_id, p_evidence_type, p_payload, p_storage_path)
  returning id into v_evidence_id;

  return v_evidence_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_attachment_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record;
  v_verb text;
begin
  v_row := coalesce(new, old);
  v_verb := case
    when TG_OP = 'DELETE' then 'Deleted'
    when TG_OP = 'UPDATE' and new.is_archived and not old.is_archived then 'Archived'
    when TG_OP = 'UPDATE' and not new.is_archived and old.is_archived then 'Restored'
    when TG_OP = 'UPDATE' and new.file_name is distinct from old.file_name then 'Renamed'
    when TG_OP = 'INSERT' then 'Uploaded'
    else null
  end;

  if v_verb is null then
    return coalesce(new, old);
  end if;

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (
    v_row.workspace_id, auth.uid(), v_row.entity_type, v_row.entity_id, 'DOCUMENT_' || upper(v_verb), 'DOCUMENT_' || upper(v_verb),
    v_verb || ' ' || v_row.file_name,
    jsonb_build_object('attachment_id', v_row.id)
  );
  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_automation_executed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.engagement_id is not null then
    insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
    values (
      new.workspace_id, (select auth.uid()), 'engagement', new.engagement_id, 'AUTOMATION_EXECUTED', 'AUTOMATION_EXECUTED',
      'An automation executed with status ' || new.status,
      jsonb_build_object('automation_id', new.automation_id, 'status', new.status)
    );
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_client_service_interest(p_client_id uuid, p_workspace_id uuid, p_service_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.has_permission(p_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to record a service interest in this workspace';
  end if;

  if not exists (select 1 from public.clients where id = p_client_id and workspace_id = p_workspace_id) then
    raise exception 'client not found in this workspace';
  end if;

  if exists (
    select 1 from public.client_service_interests
    where client_id = p_client_id and service_id = p_service_id
  ) then
    return;
  end if;

  insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
  select p_client_id, p_workspace_id, s.service_category_id, s.id, 'manual'
  from public.services s
  where s.id = p_service_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_consent(p_consent_type text, p_version text, p_workspace_id uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if p_client_id is not null then
    if p_workspace_id is null or not public.is_workspace_member(p_workspace_id) then
      raise exception 'insufficient permissions to record consent for this client';
    end if;
  end if;

  insert into public.consent_records (workspace_id, user_id, client_id, consent_type, version, ip_address, user_agent)
  values (p_workspace_id, case when p_client_id is null then auth.uid() else null end, p_client_id, p_consent_type, p_version, p_ip_address, p_user_agent)
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_document_request_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (
    new.workspace_id, auth.uid(), new.entity_type, new.entity_id, 'DOCUMENT_REQUEST_CREATED', 'DOCUMENT_REQUEST_CREATED',
    'Requested documents: ' || new.title,
    jsonb_build_object('document_request_id', new.id)
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_engagement_assignment_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.assigned_staff_id is distinct from old.assigned_staff_id then
    insert into public.engagement_assignment_history (engagement_id, assignment_role, previous_user_id, new_user_id, changed_by)
    values (new.id, 'assigned_staff', old.assigned_staff_id, new.assigned_staff_id, (select auth.uid()));
  end if;
  if new.reviewer_id is distinct from old.reviewer_id then
    insert into public.engagement_assignment_history (engagement_id, assignment_role, previous_user_id, new_user_id, changed_by)
    values (new.id, 'reviewer', old.reviewer_id, new.reviewer_id, (select auth.uid()));
  end if;
  if new.compliance_officer_id is distinct from old.compliance_officer_id then
    insert into public.engagement_assignment_history (engagement_id, assignment_role, previous_user_id, new_user_id, changed_by)
    values (new.id, 'compliance_officer', old.compliance_officer_id, new.compliance_officer_id, (select auth.uid()));
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_engagement_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (
    new.workspace_id, (select auth.uid()), 'engagement', new.id, 'ENGAGEMENT_CREATED', 'ENGAGEMENT_CREATED',
    'Engagement ' || new.engagement_number || ' was created',
    jsonb_build_object('engagement_number', new.engagement_number, 'client_id', new.client_id)
  );

  if new.assigned_staff_id is not null then
    perform public.create_notification(
      new.workspace_id, new.assigned_staff_id, 'ENGAGEMENT_ASSIGNED', 'engagement_assigned',
      jsonb_build_object('engagement_id', new.id, 'engagement_number', new.engagement_number),
      array['In-App'::text], 'Medium', 'engagement', new.id
    );
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_engagement_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status is distinct from old.status then
    insert into public.engagement_status_history (engagement_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, (select auth.uid()));

    insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
    values (
      new.workspace_id, (select auth.uid()), 'engagement', new.id, 'STATUS_CHANGE', 'STATUS_CHANGE',
      'Engagement ' || new.engagement_number || ' status changed from ' || coalesce(old.status, 'NULL') || ' to ' || new.status,
      jsonb_build_object('old_status', old.status, 'new_status', new.status)
    );

    if new.status = 'Waiting On Review' and new.reviewer_id is not null then
      perform public.create_notification(
        new.workspace_id, new.reviewer_id, 'ENGAGEMENT_WAITING_ON_REVIEW', 'engagement_waiting_on_review',
        jsonb_build_object('engagement_id', new.id, 'engagement_number', new.engagement_number),
        array['In-App'::text], 'Medium', 'engagement', new.id
      );
    end if;

    if new.status = 'Completed' and new.completed_date is null then
      new.completed_date := now();
    end if;
    if new.status = 'Archived' and new.archived_date is null then
      new.archived_date := now();
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_irs_notice_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.activity_log (workspace_id, entity_type, entity_id, activity_type, description)
  values (new.workspace_id, new.entity_type, new.entity_id, 'irs_notice_received', 'IRS notice received: ' || new.notice_type);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_login_attempt(p_user_id uuid, p_workspace_id uuid, p_success boolean, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text, p_failure_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_policy record;
begin
  insert into public.login_history (user_id, workspace_id, ip_address, user_agent, success, failure_reason)
  values (p_user_id, p_workspace_id, p_ip_address, p_user_agent, p_success, p_failure_reason);

  if p_success then
    update public.user_profiles set failed_login_count = 0, locked_until = null, last_seen_at = now() where id = p_user_id;
  else
    select * into v_policy from public.workspace_security_policies where workspace_id = p_workspace_id;
    update public.user_profiles
    set failed_login_count = failed_login_count + 1,
        locked_until = case
          when failed_login_count + 1 >= coalesce(v_policy.max_failed_login_attempts, 5)
          then now() + make_interval(mins => coalesce(v_policy.lockout_duration_minutes, 15))
          else locked_until
        end
    where id = p_user_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_login_result(p_email text, p_success boolean, p_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where lower(email) = lower(p_email);
  if v_user_id is null then
    return;
  end if;

  perform public.record_login_attempt(v_user_id, p_workspace_id, p_success);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_organizer_response_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_entity_type text;
  v_entity_id uuid;
  v_verb text;
begin
  v_entity_type := case when new.engagement_id is not null then 'engagement' else 'client' end;
  v_entity_id := coalesce(new.engagement_id, new.client_id);

  v_verb := case
    when TG_OP = 'INSERT' and new.status = 'submitted' then 'Submitted'
    when TG_OP = 'UPDATE' and new.status = 'submitted' and old.status is distinct from 'submitted' then 'Submitted'
    when TG_OP = 'UPDATE' and new.review_status is distinct from old.review_status and new.review_status is not null then 'Reviewed'
    else null
  end;

  if v_verb is null then
    return new;
  end if;

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (
    new.workspace_id, auth.uid(), v_entity_type, v_entity_id,
    'ORGANIZER_' || upper(v_verb), 'ORGANIZER_' || upper(v_verb),
    case when v_verb = 'Reviewed' then 'Organizer marked "' || new.review_status || '"' else 'Organizer submitted' end,
    jsonb_build_object('response_id', new.id)
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_provider_check(p_provider text, p_success boolean, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.provider_status
  set is_configured = true,
      status = case when p_success then 'healthy' else (case when consecutive_failures + 1 >= 3 then 'down' else 'degraded' end) end,
      consecutive_failures = case when p_success then 0 else consecutive_failures + 1 end,
      last_check_at = now(),
      last_success_at = case when p_success then now() else last_success_at end,
      last_failure_at = case when p_success then last_failure_at else now() end,
      last_error = case when p_success then null else p_error end,
      updated_at = now()
  where provider = p_provider;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_signature(p_signer_id uuid, p_signature_type text, p_signature_image_path text DEFAULT NULL::text, p_typed_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
  v_workspace_id uuid;
  v_attachment_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_signer_email text;
  v_caller_email text;
  v_pending_count int;
  v_is_staff boolean;
begin
  if p_typed_name is null or btrim(p_typed_name) = '' then
    raise exception 'A typed signature is required';
  end if;
  if p_signature_type = 'drawn' and (p_signature_image_path is null or btrim(p_signature_image_path) = '') then
    raise exception 'A drawn signature is required';
  end if;

  select s.signature_request_id, r.workspace_id, r.attachment_id, a.entity_type, a.entity_id, s.signer_email
  into v_request_id, v_workspace_id, v_attachment_id, v_entity_type, v_entity_id, v_signer_email
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  join public.attachments a on a.id = r.attachment_id
  where s.id = p_signer_id;

  if v_request_id is null then
    raise exception 'signer not found';
  end if;

  select email into v_caller_email from auth.users where id = auth.uid();

  v_is_staff := public.has_permission(v_workspace_id, 'signatures.request');

  if not (
    v_is_staff
    or (
      v_signer_email is not null and lower(v_caller_email) = lower(v_signer_email)
      and public.is_portal_user_for_entity(v_entity_type, v_entity_id)
    )
  ) then
    raise exception 'insufficient permissions';
  end if;

  if v_is_staff and not exists (
    select 1 from public.signature_request_signers where id = p_signer_id and attested_by is not null
  ) then
    raise exception 'Please confirm you are present and have verified this signer''s identity before recording their signature.';
  end if;

  update public.signature_request_signers
  set status = 'signed', signature_type = p_signature_type, signature_image_path = p_signature_image_path,
      typed_name = btrim(p_typed_name), signed_at = now()
  where id = p_signer_id and status = 'pending';

  if not found then
    raise exception 'this signing request is no longer pending';
  end if;

  select count(*) into v_pending_count from public.signature_request_signers
  where signature_request_id = v_request_id and status = 'pending';

  if v_pending_count = 0 then
    update public.signature_requests set status = 'completed', updated_at = now() where id = v_request_id;
    update public.attachments set is_locked = true where id = v_attachment_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_signature_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_title text;
begin
  select r.workspace_id, a.entity_type, a.entity_id, r.title
  into v_workspace_id, v_entity_type, v_entity_id, v_title
  from public.signature_requests r
  join public.attachments a on a.id = r.attachment_id
  where r.id = new.signature_request_id;

  if v_workspace_id is null then
    return new;
  end if;

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (
    v_workspace_id, auth.uid(), v_entity_type, v_entity_id,
    case new.status when 'signed' then 'SIGNATURE_SIGNED' when 'declined' then 'SIGNATURE_DECLINED' else 'SIGNATURE_UPDATED' end,
    case new.status when 'signed' then 'SIGNATURE_SIGNED' when 'declined' then 'SIGNATURE_DECLINED' else 'SIGNATURE_UPDATED' end,
    new.signer_name || ' ' || new.status || ' -- ' || v_title,
    jsonb_build_object('signature_request_id', new.signature_request_id)
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_signature_by_token(p_token uuid, p_signature_type text, p_typed_name text DEFAULT NULL::text, p_signature_image_path text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_signer_id uuid;
  v_request_id uuid;
  v_attachment_id uuid;
  v_pending_count int;
begin
  if p_typed_name is null or btrim(p_typed_name) = '' then
    raise exception 'A typed signature is required';
  end if;
  if p_signature_image_path is null or btrim(p_signature_image_path) = '' then
    raise exception 'A drawn signature is required';
  end if;

  select s.id, s.signature_request_id, r.attachment_id
  into v_signer_id, v_request_id, v_attachment_id
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  where s.access_token = p_token;

  if v_signer_id is null then
    raise exception 'invalid signing link';
  end if;

  update public.signature_request_signers
  set status = 'signed', signature_type = 'drawn', signature_image_path = p_signature_image_path,
      typed_name = btrim(p_typed_name), signed_at = now()
  where id = v_signer_id and status = 'pending';

  if not found then
    raise exception 'this signing request is no longer pending';
  end if;

  select count(*) into v_pending_count from public.signature_request_signers
  where signature_request_id = v_request_id and status = 'pending';

  if v_pending_count = 0 then
    update public.signature_requests set status = 'completed', updated_at = now() where id = v_request_id;
    update public.attachments set is_locked = true where id = v_attachment_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_task_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
    values (
      new.workspace_id, (select auth.uid()), 'task', new.id, 'TASK_COMPLETED', 'TASK_COMPLETED',
      'Task "' || new.title || '" was completed',
      jsonb_build_object('engagement_id', new.engagement_id)
    );
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.redeem_firm_connection_invite(p_token uuid, p_workspace_id uuid)
 RETURNS firm_connections
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.firm_connections;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to redeem this invite';
  end if;

  select * into v_row from public.firm_connections
  where invite_token = p_token and status = 'pending' and child_workspace_id is null
  for update;

  if v_row.id is null then
    raise exception 'This invite is invalid or has already been used.';
  end if;
  if v_row.invite_expires_at < now() then
    raise exception 'This invite has expired.';
  end if;
  if v_row.parent_workspace_id = p_workspace_id then
    raise exception 'A workspace cannot connect to itself.';
  end if;
  if exists (
    select 1 from public.firm_connections
    where child_workspace_id = p_workspace_id
      and relationship_type = v_row.relationship_type
      and status = 'active'
  ) then
    raise exception 'This workspace is already connected to an ERO.';
  end if;

  update public.firm_connections
  set child_workspace_id = p_workspace_id,
      status = 'active',
      responded_by = auth.uid(),
      responded_at = now(),
      invite_token = null,
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  perform public.create_notification(
    v_row.parent_workspace_id, v_row.invited_by, 'FIRM_CONNECTION_ACCEPTED',
    'firm_connection_accepted', jsonb_build_object('firm_connection_id', v_row.id),
    array['In-App'::text], 'Medium', 'firm_connection', v_row.id
  );

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refund_usage_unit(p_workspace_id uuid, p_resource_type text, p_source text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_source = 'free' then
    update public.workspace_usage_meters
    set free_units_consumed = greatest(0, free_units_consumed - 1), updated_at = now()
    where workspace_id = p_workspace_id and resource_type = p_resource_type;
  elsif p_source = 'prepaid' then
    update public.workspace_usage_meters
    set prepaid_balance = prepaid_balance + 1, updated_at = now()
    where workspace_id = p_workspace_id and resource_type = p_resource_type;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_automation_step(p_pending_step_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pending record;
  v_step record;
  v_authorized boolean;
begin
  select * into v_pending from public.automation_pending_steps where id = p_pending_step_id and status = 'pending_approval';
  if v_pending.id is null then
    raise exception 'Pending approval not found';
  end if;

  select * into v_step from public.automation_steps where id = v_pending.automation_step_id;

  if v_step.approver_role_id is not null then
    select exists (
      select 1 from public.workspace_users wu
      where wu.workspace_id = v_pending.workspace_id and wu.user_id = auth.uid() and wu.status = 'active' and wu.role_id = v_step.approver_role_id
    ) or public.is_workspace_admin(v_pending.workspace_id) into v_authorized;
  else
    v_authorized := public.is_workspace_admin(v_pending.workspace_id);
  end if;

  if not v_authorized then
    raise exception 'You are not authorized to reject this step';
  end if;

  update public.automation_pending_steps set status = 'rejected', rejected_reason = p_reason, approved_by = auth.uid(), approved_at = now() where id = p_pending_step_id;
  update public.automation_runs set status = 'cancelled', completed_at = now() where id = v_pending.run_id;

  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_client_pending_change(p_pending_change_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.client_pending_changes;
begin
  select * into v_row from public.client_pending_changes where id = p_pending_change_id;
  if v_row.id is null then
    raise exception 'pending change not found';
  end if;
  if not public.has_permission(v_row.workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'this change has already been reviewed';
  end if;

  update public.client_pending_changes
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), decision_notes = p_notes
  where id = p_pending_change_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_organizer_information_request_item(p_item_id uuid, p_decision_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_request_id uuid;
  v_status text;
  v_was_answered boolean;
begin
  select req.workspace_id, item.request_id, item.status, item.was_answered_when_flagged
  into v_workspace_id, v_request_id, v_status, v_was_answered
  from public.organizer_information_request_items item
  join public.organizer_information_requests req on req.id = item.request_id
  where item.id = p_item_id;

  if v_workspace_id is null then
    raise exception 'information request item not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;
  if not v_was_answered or v_status <> 'client_responded' then
    raise exception 'this item has no pending correction to reject';
  end if;
  if nullif(btrim(p_decision_note), '') is null then
    raise exception 'a reason is required';
  end if;

  update public.organizer_information_request_items
  set status = 'rejected', decision_note = p_decision_note, resolved_by = auth.uid(), resolved_at = now()
  where id = p_item_id;

  perform public.notify_organizer_information_request(v_request_id, 'One of your submitted corrections was not accepted: ' || p_decision_note);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.release_firm_connection_billing(p_connection_id uuid)
 RETURNS firm_connections
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.firm_connections;
begin
  select * into v_row from public.firm_connections where id = p_connection_id for update;
  if v_row.id is null then
    raise exception 'connection not found';
  end if;
  if not public.is_workspace_admin(v_row.parent_workspace_id) then
    raise exception 'Only the ERO can release billing for this connection.';
  end if;
  if v_row.billing_responsibility <> 'ero' then
    return v_row;
  end if;

  update public.firm_connections set billing_responsibility = 'ptin_self', updated_at = now() where id = p_connection_id returning * into v_row;
  update public.workspace_subscriptions set seat_count = greatest(coalesce(seat_count, 1) - 1, 0), updated_at = now() where workspace_id = v_row.parent_workspace_id;

  if v_row.responded_by is not null then
    perform public.create_notification(
      v_row.child_workspace_id, v_row.responded_by, 'FIRM_CONNECTION_BILLING_RELEASED',
      'firm_connection_billing_released', jsonb_build_object('firm_connection_id', p_connection_id),
      array['In-App'::text], 'Medium', 'firm_connection', p_connection_id
    );
  end if;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rename_process_stage(p_stage_id uuid, p_new_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage record;
  v_process record;
begin
  select ps.id, ps.process_id, ps.name into v_stage from process_stages ps where ps.id = p_stage_id;
  if v_stage.id is null then
    raise exception 'stage % not found', p_stage_id;
  end if;

  select p.id, p.workspace_id into v_process from processes p where p.id = v_stage.process_id;
  if v_process.workspace_id is null then
    raise exception 'cannot edit a system default workflow -- clone the service first';
  end if;
  if not is_workspace_admin(v_process.workspace_id) then
    raise exception 'insufficient permissions to edit this workflow';
  end if;

  if p_new_name = v_stage.name then
    return;
  end if;

  update process_stages set name = p_new_name, updated_at = now() where id = p_stage_id;

  update engagements set current_stage = p_new_name
  where workflow_id = v_process.id and current_stage = v_stage.name;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rename_workspace_tag(p_workspace_id uuid, p_tag_id uuid, p_new_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old_name text;
  v_new_name text := btrim(p_new_name);
begin
  if not public.has_permission(p_workspace_id, 'automations.manage') then
    raise exception 'insufficient permissions to rename a tag in this workspace';
  end if;
  if v_new_name = '' then
    raise exception 'Tag name cannot be empty';
  end if;

  select name into v_old_name from public.workspace_tags where id = p_tag_id and workspace_id = p_workspace_id;
  if v_old_name is null then
    raise exception 'Tag not found in this workspace';
  end if;
  if v_old_name = v_new_name then
    return;
  end if;
  if exists (select 1 from public.workspace_tags where workspace_id = p_workspace_id and name = v_new_name) then
    raise exception 'A tag named "%" already exists', v_new_name;
  end if;

  update public.workspace_tags set name = v_new_name, updated_at = now() where id = p_tag_id;

  update public.clients
  set tags = array_replace(tags, v_old_name, v_new_name)
  where workspace_id = p_workspace_id and v_old_name = any(tags);

  update public.automations
  set trigger_config = jsonb_set(trigger_config, '{tag}', to_jsonb(v_new_name))
  where workspace_id = p_workspace_id and trigger_type = 'client.tag_added' and trigger_config->>'tag' = v_old_name;

  update public.automation_steps s
  set action_config = jsonb_set(s.action_config, '{tag}', to_jsonb(v_new_name))
  from public.automations a
  where a.id = s.automation_id and a.workspace_id = p_workspace_id
    and s.action_type in ('add_tag', 'remove_tag') and s.action_config->>'tag' = v_old_name;

  update public.automation_step_edges e
  set branch_conditions = (
    select jsonb_agg(
      case
        when cond->>'field' = 'client.tags' and cond->>'value' = v_old_name
          then jsonb_set(cond, '{value}', to_jsonb(v_new_name))
        else cond
      end
    )
    from jsonb_array_elements(e.branch_conditions) as cond
  )
  from public.automations a
  where a.id = e.automation_id and a.workspace_id = p_workspace_id
    and e.branch_conditions is not null
    and exists (
      select 1 from jsonb_array_elements(e.branch_conditions) as c2
      where c2->>'field' = 'client.tags' and c2->>'value' = v_old_name
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.render_engagement_letter_merge_fields(p_body text, p_client_name text, p_firm_name text, p_firm_address text, p_firm_phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select regexp_replace(
    replace(replace(replace(replace(
      p_body,
      '{{client_name}}', coalesce(p_client_name, '')),
      '{{firm_name}}', coalesce(p_firm_name, '')),
      '{{firm_address}}', coalesce(p_firm_address, '')),
      '{{firm_phone}}', coalesce(p_firm_phone, '')),
    '\{\{\s*[\w.]+\s*\}\}', '', 'g'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.render_merge_fields(p_text text, p_context jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_result text := coalesce(p_text, '');
  v_key text;
  v_value text;
begin
  if v_result = '' then
    return v_result;
  end if;

  for v_key, v_value in select key, value from jsonb_each_text(coalesce(p_context, '{}'::jsonb))
  loop
    v_result := regexp_replace(
      v_result,
      '\{\{\s*' || v_key || '\s*\}\}',
      replace(coalesce(v_value, ''), '\', '\\'),
      'g'
    );
  end loop;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reorder_automation_step(p_step_id uuid, p_direction text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_step record;
  v_neighbor record;
  v_workspace_id uuid;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'direction must be up or down';
  end if;

  select s.*, a.workspace_id into v_step
  from public.automation_steps s
  join public.automations a on a.id = s.automation_id
  where s.id = p_step_id;

  if v_step.id is null then
    raise exception 'step not found';
  end if;

  v_workspace_id := v_step.workspace_id;
  if v_workspace_id is null or not public.is_workspace_admin(v_workspace_id) then
    raise exception 'insufficient permissions to reorder this workflow''s steps';
  end if;

  if p_direction = 'up' then
    select * into v_neighbor from public.automation_steps
    where automation_id = v_step.automation_id and display_order < v_step.display_order
    order by display_order desc limit 1;
  else
    select * into v_neighbor from public.automation_steps
    where automation_id = v_step.automation_id and display_order > v_step.display_order
    order by display_order asc limit 1;
  end if;

  if v_neighbor.id is null then
    return;
  end if;

  update public.automation_steps set display_order = v_neighbor.display_order where id = v_step.id;
  update public.automation_steps set display_order = v_step.display_order where id = v_neighbor.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reorder_funnel_pages(p_funnel_id uuid, p_page_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_page_id uuid;
  v_idx int := 0;
  v_total int;
  v_matched int;
begin
  select workspace_id into v_workspace_id from public.site_funnels where id = p_funnel_id;
  if v_workspace_id is null then
    raise exception 'funnel not found';
  end if;
  if not public.has_permission(v_workspace_id, 'site_pages.manage') then
    raise exception 'insufficient permissions to edit this funnel';
  end if;

  select count(*) into v_total from public.site_pages where funnel_id = p_funnel_id;
  if coalesce(array_length(p_page_ids, 1), 0) <> v_total then
    raise exception 'reorder list must include every page in this funnel exactly once';
  end if;

  select count(*) into v_matched from public.site_pages where funnel_id = p_funnel_id and id = any(p_page_ids);
  if v_matched <> v_total then
    raise exception 'reorder list must include every page in this funnel exactly once';
  end if;

  foreach v_page_id in array p_page_ids loop
    update public.site_pages set funnel_position = v_idx, updated_at = now() where id = v_page_id;
    v_idx := v_idx + 1;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reorder_organizer_fields(p_template_id uuid, p_field_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_field_id uuid;
  v_idx int := 0;
  v_total int;
  v_matched int;
begin
  select workspace_id into v_workspace_id from organizer_templates where id = p_template_id;
  if v_workspace_id is null then
    raise exception 'cannot edit a system default organizer -- clone it first';
  end if;
  if not is_workspace_admin(v_workspace_id) then
    raise exception 'insufficient permissions to edit this organizer';
  end if;

  select count(*) into v_total from organizer_fields where organizer_template_id = p_template_id;
  if coalesce(array_length(p_field_ids, 1), 0) <> v_total then
    raise exception 'reorder list must include every field on this organizer exactly once';
  end if;

  select count(*) into v_matched
  from organizer_fields
  where organizer_template_id = p_template_id and id = any(p_field_ids);
  if v_matched <> v_total then
    raise exception 'reorder list must include every field on this organizer exactly once';
  end if;

  foreach v_field_id in array p_field_ids loop
    update organizer_fields set display_order = v_idx where id = v_field_id;
    v_idx := v_idx + 1;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reorder_process_stage(p_stage_id uuid, p_direction text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage record;
  v_process record;
  v_neighbor record;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'direction must be up or down';
  end if;

  select ps.id, ps.process_id, ps.display_order into v_stage from process_stages ps where ps.id = p_stage_id;
  if v_stage.id is null then
    raise exception 'stage % not found', p_stage_id;
  end if;

  select p.id, p.workspace_id into v_process from processes p where p.id = v_stage.process_id;
  if v_process.workspace_id is null then
    raise exception 'cannot edit a system default workflow -- clone the service first';
  end if;
  if not is_workspace_admin(v_process.workspace_id) then
    raise exception 'insufficient permissions to edit this workflow';
  end if;

  if p_direction = 'up' then
    select * into v_neighbor from public.process_stages
    where process_id = v_stage.process_id and display_order < v_stage.display_order
    order by display_order desc limit 1;
  else
    select * into v_neighbor from public.process_stages
    where process_id = v_stage.process_id and display_order > v_stage.display_order
    order by display_order asc limit 1;
  end if;

  if v_neighbor.id is null then
    return;
  end if;

  update public.process_stages set display_order = v_neighbor.display_order, updated_at = now() where id = v_stage.id;
  update public.process_stages set display_order = v_stage.display_order, updated_at = now() where id = v_neighbor.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reorder_site_page_sections(p_page_id uuid, p_section_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_section_id uuid;
  v_idx int := 0;
  v_total int;
  v_matched int;
begin
  select workspace_id into v_workspace_id from public.site_pages where id = p_page_id;
  if v_workspace_id is null then
    raise exception 'page not found';
  end if;
  if not public.has_permission(v_workspace_id, 'site_pages.manage') then
    raise exception 'insufficient permissions to edit this page';
  end if;

  select count(*) into v_total from public.site_page_sections where page_id = p_page_id;
  if coalesce(array_length(p_section_ids, 1), 0) <> v_total then
    raise exception 'reorder list must include every section on this page exactly once';
  end if;

  select count(*) into v_matched from public.site_page_sections where page_id = p_page_id and id = any(p_section_ids);
  if v_matched <> v_total then
    raise exception 'reorder list must include every section on this page exactly once';
  end if;

  foreach v_section_id in array p_section_ids loop
    update public.site_page_sections set display_order = v_idx, updated_at = now() where id = v_section_id;
    v_idx := v_idx + 1;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.request_portal_service(p_service_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client_id uuid;
  v_workspace_id uuid;
  v_service record;
  v_already_requested boolean;
begin
  select client_id, workspace_id into v_client_id, v_workspace_id
  from public.client_portal_users
  where user_id = auth.uid() and status = 'active'
  limit 1;

  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  -- Trust nothing from the client but the id -- re-resolve category and
  -- confirm this service is actually one they're allowed to see (published,
  -- portal-visible, and either a shared template or scoped to their own
  -- workspace) rather than accepting whatever uuid was posted.
  select id, service_category_id into v_service
  from public.services
  where id = p_service_id
    and status = 'published'
    and is_portal_visible = true
    and (workspace_id is null or workspace_id = v_workspace_id);

  if v_service.id is null then
    raise exception 'That service is not available to request.';
  end if;

  select exists(
    select 1 from public.client_service_interests
    where client_id = v_client_id and service_id = p_service_id
  ) into v_already_requested;

  if v_already_requested then
    return;
  end if;

  insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
  values (v_client_id, v_workspace_id, v_service.service_category_id, p_service_id, 'portal_add_service');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reserve_usage_unit(p_workspace_id uuid, p_resource_type text)
 RETURNS TABLE(allowed boolean, source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_meter public.workspace_usage_meters%rowtype;
begin
  if p_resource_type not in ('email', 'sms') then
    raise exception 'reserve_usage_unit only applies to email/sms -- storage uses check_storage_capacity';
  end if;

  select * into v_meter
  from public.workspace_usage_meters
  where workspace_id = p_workspace_id and resource_type = p_resource_type
  for update;

  if not found then
    return query select true, null::text;
    return;
  end if;

  if v_meter.free_units_consumed < v_meter.free_units_granted then
    update public.workspace_usage_meters
    set free_units_consumed = free_units_consumed + 1, updated_at = now()
    where id = v_meter.id;
    return query select true, 'free'::text;
    return;
  end if;

  if v_meter.prepaid_balance >= 1 then
    update public.workspace_usage_meters
    set prepaid_balance = prepaid_balance - 1, updated_at = now()
    where id = v_meter.id;
    return query select true, 'prepaid'::text;
    return;
  end if;

  return query select false, null::text;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_and_sign_organizer_response(p_response_id uuid, p_workspace_id uuid, p_template_id uuid, p_client_name text, p_client_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_signature_answer jsonb;
  v_typed_name text;
  v_signature_image_path text;
  v_signed_at timestamptz;
  v_firm_name text;
  v_firm_address text;
  v_firm_phone text;
  v_template_name text;
  v_html text := '';
  v_field record;
  v_answer_value jsonb;
  v_max_instance int;
  v_i int;
  v_child record;
  v_request_id uuid;
begin
  select a.value into v_signature_answer
  from public.organizer_fields f
  join public.organizer_response_answers a
    on a.organizer_field_id = f.id and a.organizer_response_id = p_response_id
  where f.organizer_template_id = p_template_id and f.field_type = 'signature'
  limit 1;

  if v_signature_answer is null then
    return null;
  end if;

  if jsonb_typeof(v_signature_answer) = 'string' then
    begin
      v_signature_answer := (v_signature_answer #>> '{}')::jsonb;
    exception when others then
      v_signature_answer := null;
    end;
  end if;

  if v_signature_answer is null
     or jsonb_typeof(v_signature_answer) <> 'object'
     or nullif(btrim(coalesce(v_signature_answer->>'typed_name', '')), '') is null then
    return null;
  end if;

  v_typed_name := btrim(v_signature_answer->>'typed_name');
  v_signature_image_path := nullif(btrim(coalesce(v_signature_answer->>'signature_image_path', '')), '');
  if v_signature_image_path is null then
    raise exception 'A drawn signature is required';
  end if;

  v_signed_at := coalesce((v_signature_answer->>'signed_at')::timestamptz, now());

  select ot.name into v_template_name from public.organizer_templates ot where ot.id = p_template_id;
  select w.name, public.format_mailing_address(w.mailing_address), w.phone
    into v_firm_name, v_firm_address, v_firm_phone
    from public.workspaces w where w.id = p_workspace_id;

  for v_field in
    select f.id, f.field_type, f.label, f.body_html
    from public.organizer_fields f
    where f.organizer_template_id = p_template_id and f.parent_field_id is null
    order by f.display_order
  loop
    if v_field.field_type = 'page_break' then
      continue;

    elsif v_field.field_type = 'rich_text' then
      v_html := v_html || public.render_engagement_letter_merge_fields(
        coalesce(v_field.body_html, ''), p_client_name, v_firm_name, v_firm_address, v_firm_phone
      );

    elsif v_field.field_type = 'signature' then
      v_html := v_html || '<p><strong>Signed by:</strong> ' || public.escape_html(v_typed_name)
        || ' on ' || to_char(v_signed_at, 'FMMonth FMDD, YYYY') || '</p>';

    elsif v_field.field_type = 'repeating_section' then
      select coalesce(max(a.instance_index), -1) into v_max_instance
      from public.organizer_response_answers a
      join public.organizer_fields cf on cf.id = a.organizer_field_id
      where cf.parent_field_id = v_field.id and a.organizer_response_id = p_response_id;

      if v_max_instance >= 0 then
        v_html := v_html || '<p><strong>' || public.escape_html(v_field.label) || '</strong></p>';
        for v_i in 0..v_max_instance loop
          v_html := v_html || '<ul>';
          for v_child in
            select cf.id, cf.label, cf.field_type
            from public.organizer_fields cf
            where cf.parent_field_id = v_field.id
            order by cf.display_order
          loop
            select a.value into v_answer_value
            from public.organizer_response_answers a
            where a.organizer_field_id = v_child.id and a.organizer_response_id = p_response_id and a.instance_index = v_i;

            v_html := v_html || '<li>' || public.escape_html(v_child.label) || ': '
              || public.escape_html(coalesce(public.format_organizer_answer(v_child.field_type, v_answer_value), '--')) || '</li>';
          end loop;
          v_html := v_html || '</ul>';
        end loop;
      end if;

    else
      select a.value into v_answer_value
      from public.organizer_response_answers a
      where a.organizer_field_id = v_field.id and a.organizer_response_id = p_response_id
      limit 1;

      v_html := v_html || '<p><strong>' || public.escape_html(v_field.label) || ':</strong> '
        || public.escape_html(coalesce(public.format_organizer_answer(v_field.field_type, v_answer_value), '--')) || '</p>';
    end if;
  end loop;

  insert into public.signature_requests (workspace_id, attachment_id, organizer_template_id, title, status)
  values (p_workspace_id, null, p_template_id, coalesce(v_template_name, 'Signed document'), 'completed')
  returning id into v_request_id;

  insert into public.signature_request_signers (
    signature_request_id, signer_name, signer_email, sign_order, status,
    signature_type, signature_image_path, typed_name, signed_at, resolved_document_html
  ) values (
    v_request_id, p_client_name, nullif(btrim(coalesce(p_client_email, '')), ''), 1, 'signed',
    'drawn', v_signature_image_path, v_typed_name, v_signed_at, v_html
  );

  update public.organizer_responses set signature_request_id = v_request_id where id = p_response_id;

  return v_request_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_client_relationship_manager(p_workspace_id uuid, p_creator_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mode text;
  v_pool uuid[];
  v_owner_id uuid;
  v_resolved uuid;
  v_creator_is_active_staff boolean;
begin
  select client_assignment_mode, client_assignment_staff_pool into v_mode, v_pool
  from public.workspaces where id = p_workspace_id;

  select user_id into v_owner_id from public.workspace_users
  where workspace_id = p_workspace_id and is_owner = true and status = 'active'
  limit 1;

  -- A staff member (not the owner) creating a client on their own behalf
  -- becomes that client's relationship manager automatically -- their own
  -- client base, no pool logic involved.
  if p_creator_user_id is not null and p_creator_user_id is distinct from v_owner_id then
    select exists(
      select 1 from public.workspace_users
      where workspace_id = p_workspace_id and user_id = p_creator_user_id and status = 'active'
    ) into v_creator_is_active_staff;
    if v_creator_is_active_staff then
      return p_creator_user_id;
    end if;
  end if;

  -- Otherwise (the owner creating a client themself, or no creator at all
  -- -- an automated/public-source client) falls through to the workspace's
  -- configured assignment mode.
  if coalesce(v_mode, 'owner') = 'round_robin' and v_pool is not null and array_length(v_pool, 1) > 0 then
    select wu.user_id into v_resolved
    from public.workspace_users wu
    where wu.workspace_id = p_workspace_id and wu.status = 'active' and wu.user_id = any(v_pool)
    order by (
      select count(*) from public.clients c2
      where c2.relationship_manager_id = wu.user_id and c2.lifecycle_status not in ('archived', 'lost')
    ) asc, random()
    limit 1;
    if v_resolved is not null then
      return v_resolved;
    end if;
  end if;

  return v_owner_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_organizer_information_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_response_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
  v_entity_type text;
  v_entity_id uuid;
begin
  select req.workspace_id, req.organizer_response_id, r.client_id, r.engagement_id
  into v_workspace_id, v_response_id, v_client_id, v_engagement_id
  from public.organizer_information_requests req
  join public.organizer_responses r on r.id = req.organizer_response_id
  where req.id = p_request_id;

  if v_workspace_id is null then
    raise exception 'information request not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;

  update public.organizer_information_requests
  set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
  where id = p_request_id;

  v_entity_type := case when v_engagement_id is not null then 'engagement' else 'client' end;
  v_entity_id := coalesce(v_engagement_id, v_client_id);

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), v_entity_type, v_entity_id, 'ORGANIZER_INFO_RESOLVED', 'ORGANIZER_INFO_RESOLVED',
    'Resolved an organizer information request', jsonb_build_object('request_id', p_request_id, 'response_id', v_response_id));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_organizer_information_request_if_done()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_open_count int;
begin
  select count(*) into v_open_count
  from public.organizer_information_request_items
  where request_id = new.request_id
    and status not in ('resolved', 'approved', 'rejected');

  if v_open_count = 0 then
    update public.organizer_information_requests
    set status = 'resolved', resolved_at = now()
    where id = new.request_id and status <> 'resolved';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_organizer_response_service(p_response_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_response record;
  v_routing_field_id uuid;
  v_given_value text;
  v_matched_service_id uuid;
  v_candidate_count int;
  v_single_service_id uuid;
begin
  select id, workspace_id, organizer_template_id, engagement_id into v_response
  from organizer_responses where id = p_response_id;

  if v_response.id is null or v_response.engagement_id is not null then
    return;
  end if;

  select routing_field_id into v_routing_field_id
  from organizer_service_routes
  where organizer_template_id = v_response.organizer_template_id
  limit 1;

  if v_routing_field_id is not null then
    select value #>> '{}' into v_given_value
    from organizer_response_answers
    where organizer_response_id = v_response.id and organizer_field_id = v_routing_field_id
    order by instance_index
    limit 1;

    v_matched_service_id := null;
    if v_given_value is not null then
      select service_id into v_matched_service_id
      from organizer_service_routes
      where organizer_template_id = v_response.organizer_template_id
        and answer_value = v_given_value;
    end if;

    update organizer_responses
    set resolved_service_id = v_matched_service_id,
        needs_service_review = (v_matched_service_id is null)
    where id = v_response.id;
    return;
  end if;

  select count(*), min(id::text)::uuid into v_candidate_count, v_single_service_id
  from services
  where organizer_template_id = v_response.organizer_template_id
    and workspace_id = v_response.workspace_id;

  if v_candidate_count = 1 then
    update organizer_responses set resolved_service_id = v_single_service_id, needs_service_review = false where id = v_response.id;
  elsif v_candidate_count > 1 then
    update organizer_responses set resolved_service_id = null, needs_service_review = true where id = v_response.id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.respond_to_engagement_share(p_engagement_share_id uuid, p_approve boolean, p_decision_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ero_workspace_id uuid;
  v_shared_by_workspace_id uuid;
  v_shared_by uuid;
  v_engagement_id uuid;
begin
  select shared_with_workspace_id, workspace_id, shared_by, engagement_id
    into v_ero_workspace_id, v_shared_by_workspace_id, v_shared_by, v_engagement_id
  from public.engagement_shares where id = p_engagement_share_id;
  if v_ero_workspace_id is null then
    raise exception 'engagement share not found';
  end if;
  if not public.is_workspace_member(v_ero_workspace_id) then
    raise exception 'insufficient permissions to respond to this engagement share';
  end if;
  if not public.has_permission(v_ero_workspace_id, 'engagements.approve_review') then
    raise exception 'insufficient permissions to approve or reject engagement reviews';
  end if;

  update public.engagement_shares set
    status = case when p_approve then 'approved' else 'rejected' end,
    decision_notes = p_decision_notes,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_engagement_share_id;

  insert into public.engagement_review_actions (engagement_share_id, action, actor_id, comment)
  values (p_engagement_share_id, case when p_approve then 'approve' else 'reject' end, auth.uid(), p_decision_notes);

  if v_shared_by is not null then
    perform public.create_notification(
      v_shared_by_workspace_id, v_shared_by, 'ENGAGEMENT_SHARE_' || upper(case when p_approve then 'approved' else 'rejected' end),
      'engagement_share_decision', jsonb_build_object('engagement_share_id', p_engagement_share_id, 'approved', p_approve),
      array['In-App'::text], 'Medium', 'engagement', v_engagement_id
    );
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.respond_to_firm_connection(p_connection_id uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_child_workspace_id uuid;
begin
  select child_workspace_id into v_child_workspace_id
  from public.firm_connections where id = p_connection_id;

  if v_child_workspace_id is null then
    raise exception 'connection not found';
  end if;
  if not public.is_workspace_admin(v_child_workspace_id) then
    raise exception 'insufficient permissions to respond to this connection';
  end if;

  update public.firm_connections
  set status = case when p_accept then 'active' else 'revoked' end,
      responded_by = auth.uid(),
      responded_at = now()
  where id = p_connection_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resubmit_engagement_share(p_engagement_share_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.engagement_shares;
  v_recipient record;
begin
  select * into v_row from public.engagement_shares where id = p_engagement_share_id;
  if v_row.id is null then
    raise exception 'engagement share not found';
  end if;
  if not public.has_permission(v_row.workspace_id, 'engagements.share') then
    raise exception 'insufficient permissions to resubmit this engagement share';
  end if;
  if v_row.status <> 'corrections_requested' then
    raise exception 'only a share with corrections requested can be resubmitted';
  end if;

  update public.engagement_shares
  set status = 'pending', decision_notes = null, reviewed_by = null, reviewed_at = null, updated_at = now()
  where id = p_engagement_share_id;

  insert into public.engagement_review_actions (engagement_share_id, action, actor_id)
  values (p_engagement_share_id, 'resubmit', auth.uid());

  for v_recipient in
    select wu.user_id from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    where wu.workspace_id = v_row.shared_with_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    perform public.create_notification(
      v_row.shared_with_workspace_id, v_recipient.user_id, 'ENGAGEMENT_SHARE_RESUBMITTED',
      'engagement_share_resubmitted', jsonb_build_object('engagement_share_id', p_engagement_share_id),
      array['In-App'::text], 'Medium', 'engagement', v_row.engagement_id
    );
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reveal_client_ein(p_client_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_value text;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_client_id;
  if v_workspace_id is null then
    raise exception 'client not found';
  end if;
  if not public.has_permission(v_workspace_id, 'identity.ein_reveal') then
    raise exception 'insufficient permissions to reveal this client''s EIN';
  end if;

  select public.decrypt_client_secret(ein_encrypted) into v_value from public.clients where id = p_client_id;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (v_workspace_id, auth.uid(), 'clients', p_client_id, 'reveal_ein', 'warning');

  return v_value;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reveal_client_itin(p_client_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_value text;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_client_id;
  if v_workspace_id is null then
    raise exception 'client not found';
  end if;
  if not public.has_permission(v_workspace_id, 'identity.itin_reveal') then
    raise exception 'insufficient permissions to reveal this client''s ITIN';
  end if;

  select public.decrypt_client_secret(itin_encrypted) into v_value from public.clients where id = p_client_id;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (v_workspace_id, auth.uid(), 'clients', p_client_id, 'reveal_itin', 'warning');

  return v_value;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reveal_client_pending_change_value(p_pending_change_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record;
  v_value text;
begin
  select id, workspace_id, client_id, target_column, new_value into v_row
  from public.client_pending_changes where id = p_pending_change_id;

  if v_row.id is null then
    raise exception 'pending change not found';
  end if;
  if v_row.target_column <> 'ssn' then
    raise exception 'this field cannot be revealed';
  end if;
  if not public.has_permission(v_row.workspace_id, 'identity.ssn_reveal') then
    raise exception 'insufficient permissions to reveal this value';
  end if;

  v_value := public.decrypt_client_secret(decode(v_row.new_value, 'base64'));

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (v_row.workspace_id, auth.uid(), 'clients', v_row.client_id, 'reveal_pending_ssn_change', 'warning');

  return v_value;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reveal_client_relationship_ssn(p_relationship_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_value text;
begin
  select workspace_id into v_workspace_id from public.client_relationships where id = p_relationship_id;
  if v_workspace_id is null then
    raise exception 'relationship not found';
  end if;
  if not public.has_permission(v_workspace_id, 'identity.ssn_reveal') then
    raise exception 'insufficient permissions to reveal this SSN';
  end if;

  select public.decrypt_client_secret(related_ssn_encrypted) into v_value from public.client_relationships where id = p_relationship_id;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (v_workspace_id, auth.uid(), 'client_relationships', p_relationship_id, 'reveal_ssn', 'warning');

  return v_value;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reveal_client_ssn(p_client_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_value text;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_client_id;
  if v_workspace_id is null then
    raise exception 'client not found';
  end if;
  if not public.has_permission(v_workspace_id, 'identity.ssn_reveal') then
    raise exception 'insufficient permissions to reveal this client''s SSN';
  end if;

  select public.decrypt_client_secret(ssn_encrypted) into v_value from public.clients where id = p_client_id;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (v_workspace_id, auth.uid(), 'clients', p_client_id, 'reveal_ssn', 'warning');

  return v_value;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reveal_firm_efin(p_workspace_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_value text;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to reveal this workspace''s EFIN';
  end if;

  select public.decrypt_firm_secret(efin_encrypted) into v_value
  from public.firm_tax_profile where workspace_id = p_workspace_id;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (p_workspace_id, auth.uid(), 'firm_tax_profile', p_workspace_id, 'reveal_efin', 'warning');

  return v_value;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reveal_firm_ein(p_workspace_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_value text;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to reveal this workspace''s EIN';
  end if;

  select public.decrypt_firm_secret(ein_encrypted) into v_value
  from public.firm_tax_profile where workspace_id = p_workspace_id;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (p_workspace_id, auth.uid(), 'firm_tax_profile', p_workspace_id, 'reveal_ein', 'warning');

  return v_value;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reveal_firm_ptin(p_workspace_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_value text;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to reveal this workspace''s PTIN';
  end if;

  select public.decrypt_firm_secret(ptin_encrypted) into v_value
  from public.firm_tax_profile where workspace_id = p_workspace_id;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (p_workspace_id, auth.uid(), 'firm_tax_profile', p_workspace_id, 'reveal_ptin', 'warning');

  return v_value;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reveal_my_ptin()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_value text;
  v_workspace_id uuid;
begin
  select public.decrypt_firm_secret(ptin_encrypted) into v_value from public.user_profiles where id = auth.uid();

  select workspace_id into v_workspace_id from public.workspace_users where user_id = auth.uid() and status = 'active' limit 1;
  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (v_workspace_id, auth.uid(), 'user_profiles', auth.uid(), 'reveal_ptin', 'warning');

  return v_value;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reveal_organizer_answer(p_answer_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_value jsonb;
  v_field_type text;
  v_permission_key text;
begin
  select r.workspace_id, a.value, f.field_type
  into v_workspace_id, v_value, v_field_type
  from organizer_response_answers a
  join organizer_responses r on r.id = a.organizer_response_id
  join organizer_fields f on f.id = a.organizer_field_id
  where a.id = p_answer_id;

  if v_workspace_id is null then
    raise exception 'answer not found';
  end if;
  if v_field_type not in ('ssn', 'ein') then
    raise exception 'this field is not a maskable identity field';
  end if;

  v_permission_key := case v_field_type when 'ssn' then 'identity.ssn_reveal' else 'identity.ein_reveal' end;
  if not has_permission(v_workspace_id, v_permission_key) then
    raise exception 'insufficient permissions to reveal this value';
  end if;

  insert into audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (v_workspace_id, auth.uid(), 'organizer_response_answers', p_answer_id, 'reveal_organizer_' || v_field_type, 'warning');

  return v_value #>> '{}';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.review_comment(p_engagement_share_id uuid, p_comment text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ero_workspace_id uuid;
  v_shared_by_workspace_id uuid;
begin
  select shared_with_workspace_id, workspace_id into v_ero_workspace_id, v_shared_by_workspace_id
  from public.engagement_shares where id = p_engagement_share_id;
  if v_ero_workspace_id is null then
    raise exception 'engagement share not found';
  end if;
  if not public.is_workspace_member(v_ero_workspace_id) and not public.is_workspace_member(v_shared_by_workspace_id) then
    raise exception 'insufficient permissions to comment on this engagement review';
  end if;

  insert into public.engagement_review_actions (engagement_share_id, action, actor_id, comment)
  values (p_engagement_share_id, 'comment', auth.uid(), p_comment);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.review_request_corrections(p_engagement_share_id uuid, p_comment text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ero_workspace_id uuid;
  v_shared_by_workspace_id uuid;
  v_shared_by uuid;
  v_engagement_id uuid;
begin
  select shared_with_workspace_id, workspace_id, shared_by, engagement_id
    into v_ero_workspace_id, v_shared_by_workspace_id, v_shared_by, v_engagement_id
  from public.engagement_shares where id = p_engagement_share_id;
  if v_ero_workspace_id is null then
    raise exception 'engagement share not found';
  end if;
  if not public.has_permission(v_ero_workspace_id, 'engagements.approve_review') then
    raise exception 'insufficient permissions to request corrections on this engagement review';
  end if;

  update public.engagement_shares set
    status = 'corrections_requested', decision_notes = p_comment, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_engagement_share_id;

  insert into public.engagement_review_actions (engagement_share_id, action, actor_id, comment)
  values (p_engagement_share_id, 'request_corrections', auth.uid(), p_comment);

  if v_shared_by is not null then
    perform public.create_notification(
      v_shared_by_workspace_id, v_shared_by, 'ENGAGEMENT_SHARE_CORRECTIONS_REQUESTED',
      'engagement_share_decision', jsonb_build_object('engagement_share_id', p_engagement_share_id),
      array['In-App'::text], 'Medium', 'engagement', v_engagement_id
    );
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.revoke_expired_portal_access()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer;
begin
  with expired as (
    select cpu.id, cpu.workspace_id, cpu.client_id, cpu.invited_at
    from public.client_portal_users cpu
    where cpu.status = 'invited'
      and cpu.accepted_at is null
      and cpu.invited_at <= now() - interval '30 days'
  ),
  revoked as (
    update public.client_portal_users cpu
    set status = 'revoked'
    from expired
    where cpu.id = expired.id
    returning cpu.id, cpu.workspace_id, cpu.client_id, expired.invited_at
  )
  insert into public.audit_log (workspace_id, entity_type, entity_id, action, severity, before_data, after_data, metadata)
  select workspace_id, 'client_portal_users', id, 'update', 'info',
    jsonb_build_object('status', 'invited'),
    jsonb_build_object('status', 'revoked'),
    jsonb_build_object('reason', 'Portal invite not activated within 30 days of being sent', 'client_id', client_id, 'invited_at', invited_at)
  from revoked;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.revoke_workspace_user(p_workspace_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to remove members from this workspace';
  end if;
  update public.workspace_users
  set status = 'removed'
  where workspace_id = p_workspace_id and user_id = p_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_critical_path_smoke_tests()
 RETURNS TABLE(check_name text, passed boolean, error_detail text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_owner_id uuid;
  v_client_id uuid;
  v_other_client_id uuid;
  v_attachment_id uuid;
  v_invoice_id uuid;
  v_plan_id uuid;
  v_payment_id uuid;
  v_request_id uuid;
  v_signer_id uuid;
  v_token uuid;
  v_result record;
  v_has_perm boolean;
begin
  -- Prefer a workspace that actually has a client to attach fixtures to;
  -- fall back to any owner-having workspace only if none do (in which case
  -- checks 2 and 3 below correctly report "no client available").
  select w.id, wu.user_id into v_workspace_id, v_owner_id
  from workspaces w
  join workspace_users wu on wu.workspace_id = w.id and wu.is_owner = true
  where exists (select 1 from clients c where c.workspace_id = w.id)
  order by w.created_at
  limit 1;

  if v_workspace_id is null then
    select w.id, wu.user_id into v_workspace_id, v_owner_id
    from workspaces w join workspace_users wu on wu.workspace_id = w.id and wu.is_owner = true
    order by w.created_at
    limit 1;
  end if;

  if v_workspace_id is null then
    check_name := 'fixtures'; passed := false; error_detail := 'no workspace with an owner found to run tests against';
    return next;
    return;
  end if;

  select id into v_client_id from clients where workspace_id = v_workspace_id order by created_at limit 1;
  select id into v_other_client_id from clients where workspace_id = v_workspace_id and id <> v_client_id order by created_at limit 1;

  -- 1. Auth/permissions: workspace owner has_permission on a representative key.
  -- Note: SECURITY DEFINER functions can't SET/RESET ROLE, so this only
  -- swaps request.jwt.claims (what auth.uid() reads) -- sufficient since
  -- has_permission/is_portal_user compute from auth.uid(), not from the
  -- calling Postgres role.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner_id)::text, true);
    select has_permission(v_workspace_id, 'documents.view') into v_has_perm;
    perform set_config('request.jwt.claims', '', true);
    if v_has_perm is not true then
      raise exception 'owner should have documents.view permission';
    end if;
    check_name := 'auth_permission_check'; passed := true; error_detail := null;
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    check_name := 'auth_permission_check'; passed := false; error_detail := sqlerrm;
  end;
  return next;

  -- 2. Billing/payments: payment plan installment paid via trigger-backed payment insert.
  begin
    if v_client_id is null then
      raise exception 'no client available to attach an invoice to';
    end if;
    insert into invoices (workspace_id, client_id, invoice_number, status, issue_date, total_amount, subtotal)
    values (v_workspace_id, v_client_id, 'SMOKE-CPT-' || substr(gen_random_uuid()::text, 1, 8), 'sent', now(), 100, 100)
    returning id into v_invoice_id;

    insert into payment_plans (workspace_id, invoice_id, installment_number, amount, due_date)
    values (v_workspace_id, v_invoice_id, 1, 100, now())
    returning id into v_plan_id;

    insert into payments (workspace_id, client_id, invoice_id, amount, status, payment_date)
    values (v_workspace_id, v_client_id, v_invoice_id, 100, 'succeeded', now())
    returning id into v_payment_id;

    update payment_plans set status = 'paid', paid_payment_id = v_payment_id where id = v_plan_id;

    select status into v_result from invoices where id = v_invoice_id;
    if v_result.status <> 'paid' then
      raise exception 'apply_payment_to_invoice trigger did not mark invoice paid, status=%', v_result.status;
    end if;

    delete from payments where id = v_payment_id;
    delete from payment_plans where id = v_plan_id;
    delete from invoices where id = v_invoice_id;
    check_name := 'billing_payment_plan_check'; passed := true; error_detail := null;
  exception when others then
    check_name := 'billing_payment_plan_check'; passed := false; error_detail := sqlerrm;
    delete from payments where id = v_payment_id;
    delete from payment_plans where id = v_plan_id;
    delete from invoices where id = v_invoice_id;
  end;
  return next;

  -- 3. Document upload + public signing link: attachment, signature request, token sign.
  -- record_signature_by_token requires both a typed name and a drawn
  -- signature image path on every call (see
  -- require_both_typed_and_drawn_signature) -- the image path itself
  -- doesn't need to point at a real stored file for this check, since the
  -- function only validates that it's non-blank before recording the
  -- signature.
  begin
    if v_client_id is null then
      raise exception 'no client available to attach a document to';
    end if;
    insert into attachments (workspace_id, entity_type, entity_id, file_name, storage_path)
    values (v_workspace_id, 'client', v_client_id, 'smoke-cpt.pdf', v_workspace_id || '/smoke-cpt.pdf')
    returning id into v_attachment_id;

    insert into signature_requests (workspace_id, attachment_id, title)
    values (v_workspace_id, v_attachment_id, 'SMOKE-CPT signature')
    returning id into v_request_id;

    insert into signature_request_signers (signature_request_id, signer_name, signer_email, sign_order)
    values (v_request_id, 'Smoke Tester', 'smoke-cpt@example.com', 1)
    returning id, access_token into v_signer_id, v_token;

    select signer_status into v_result from get_signature_request_by_token(v_token);
    if v_result.signer_status <> 'pending' then
      raise exception 'public token read did not return pending status';
    end if;

    perform record_signature_by_token(v_token, 'typed', 'Smoke Tester', v_workspace_id || '/smoke-cpt-signature.png');

    select status into v_result from signature_request_signers where id = v_signer_id;
    if v_result.status <> 'signed' then
      raise exception 'record_signature_by_token did not mark signer signed';
    end if;

    delete from signature_request_signers where id = v_signer_id;
    delete from signature_requests where id = v_request_id;
    delete from attachments where id = v_attachment_id;
    check_name := 'document_signing_check'; passed := true; error_detail := null;
  exception when others then
    check_name := 'document_signing_check'; passed := false; error_detail := sqlerrm;
    delete from signature_request_signers where id = v_signer_id;
    delete from signature_requests where id = v_request_id;
    delete from attachments where id = v_attachment_id;
  end;
  return next;

  -- 4. Portal access isolation: a client's primary portal user can see their
  -- own client via is_portal_user, and (if a second client exists) cannot
  -- see the other client.
  begin
    declare
      v_portal_user_id uuid;
    begin
      select cpu.user_id into v_portal_user_id
      from client_portal_users cpu
      where cpu.client_id = v_client_id and cpu.status = 'active'
      limit 1;

      if v_portal_user_id is null then
        check_name := 'portal_access_check'; passed := true;
        error_detail := 'skipped -- no active portal user exists for the test client yet';
        return next;
      else
        perform set_config('request.jwt.claims', json_build_object('sub', v_portal_user_id)::text, true);

        if not is_portal_user(v_client_id) then
          raise exception 'portal user should see their own client';
        end if;
        if v_other_client_id is not null and is_portal_user(v_other_client_id) then
          raise exception 'portal user incorrectly sees an unrelated client';
        end if;

        perform set_config('request.jwt.claims', '', true);
        check_name := 'portal_access_check'; passed := true; error_detail := null;
        return next;
      end if;
    end;
  exception when others then
    perform set_config('request.jwt.claims', '', true);
    check_name := 'portal_access_check'; passed := false; error_detail := sqlerrm;
    return next;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_organizer_reopened_field_answer(p_item_id uuid, p_value jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client_id uuid;
  v_response_id uuid;
  v_field_id uuid;
  v_instance_index int;
  v_status text;
  v_was_answered boolean;
begin
  select r.client_id, req.organizer_response_id, item.organizer_field_id, item.instance_index, item.status, item.was_answered_when_flagged
  into v_client_id, v_response_id, v_field_id, v_instance_index, v_status, v_was_answered
  from public.organizer_information_request_items item
  join public.organizer_information_requests req on req.id = item.request_id
  join public.organizer_responses r on r.id = req.organizer_response_id
  where item.id = p_item_id;

  if v_client_id is null then
    raise exception 'information request item not found';
  end if;
  if not public.is_portal_user(v_client_id) then
    raise exception 'insufficient permissions';
  end if;
  if v_was_answered then
    raise exception 'this question already has an answer -- propose a correction instead';
  end if;
  if v_status not in ('pending', 'client_responded') then
    raise exception 'this item is no longer open';
  end if;

  insert into public.organizer_response_answers (organizer_response_id, organizer_field_id, instance_index, value)
  values (v_response_id, v_field_id, v_instance_index, p_value)
  on conflict (organizer_response_id, organizer_field_id, instance_index)
  do update set value = excluded.value, updated_at = now();

  update public.organizer_information_request_items
  set status = 'resolved', resolved_at = now()
  where id = p_item_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.send_organizer_information_request(p_request_id uuid, p_message text, p_due_date date DEFAULT NULL::date, p_tags text[] DEFAULT '{}'::text[], p_send_email boolean DEFAULT false, p_send_sms boolean DEFAULT false, p_show_in_portal boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_response_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_engagement_id uuid;
  v_client_id uuid;
begin
  select req.workspace_id, req.organizer_response_id
  into v_workspace_id, v_response_id
  from public.organizer_information_requests req
  where req.id = p_request_id and req.status = 'draft';

  if v_workspace_id is null then
    raise exception 'draft information request not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;
  if nullif(btrim(p_message), '') is null then
    raise exception 'a message is required';
  end if;
  if not exists (select 1 from public.organizer_information_request_items where request_id = p_request_id) then
    raise exception 'add at least one item before sending';
  end if;

  select client_id, engagement_id into v_client_id, v_engagement_id
  from public.organizer_responses where id = v_response_id;
  v_entity_type := case when v_engagement_id is not null then 'engagement' else 'client' end;
  v_entity_id := coalesce(v_engagement_id, v_client_id);

  update public.organizer_information_requests
  set status = 'active', message = p_message, due_date = p_due_date, tags = coalesce(p_tags, '{}'),
    sent_via_email = p_send_email, sent_via_sms = p_send_sms, shown_in_portal = p_show_in_portal
  where id = p_request_id;

  perform public.set_organizer_response_review_status(v_response_id, 'Corrections Requested', p_message);
  perform public.notify_organizer_information_request(p_request_id, p_message);

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), v_entity_type, v_entity_id, 'ORGANIZER_INFO_REQUESTED', 'ORGANIZER_INFO_REQUESTED',
    'Requested information on an organizer', jsonb_build_object('request_id', p_request_id, 'response_id', v_response_id));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_client_address_primary(p_address_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client_id uuid;
  v_workspace_id uuid;
  v_address_type text;
begin
  select client_id, workspace_id, address_type into v_client_id, v_workspace_id, v_address_type from public.client_addresses where id = p_address_id;
  if v_client_id is null then
    raise exception 'address not found';
  end if;
  if not has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;

  update public.client_addresses set is_primary = false where client_id = v_client_id and address_type = v_address_type and is_primary and id <> p_address_id;
  update public.client_addresses set is_primary = true where id = p_address_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_client_email_primary(p_email_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client_id uuid;
  v_workspace_id uuid;
begin
  select client_id, workspace_id into v_client_id, v_workspace_id from public.client_emails where id = p_email_id;
  if v_client_id is null then
    raise exception 'email not found';
  end if;
  if not has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;

  update public.client_emails set is_primary = false where client_id = v_client_id and is_primary and id <> p_email_id;
  update public.client_emails set is_primary = true where id = p_email_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_client_phone_primary(p_phone_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client_id uuid;
  v_workspace_id uuid;
begin
  select client_id, workspace_id into v_client_id, v_workspace_id from public.client_phones where id = p_phone_id;
  if v_client_id is null then
    raise exception 'phone not found';
  end if;
  if not has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions to edit this client';
  end if;

  update public.client_phones set is_primary = false where client_id = v_client_id and is_primary and id <> p_phone_id;
  update public.client_phones set is_primary = true where id = p_phone_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_client_task_completed(p_task_id uuid, p_completed boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_task public.tasks;
  v_authorized boolean;
begin
  select * into v_task from public.tasks where id = p_task_id;
  if v_task.id is null then
    raise exception 'task not found';
  end if;
  if v_task.visibility <> 'client' then
    raise exception 'not authorized to update this task';
  end if;

  v_authorized := (v_task.client_id is not null and public.is_portal_user(v_task.client_id))
    or (v_task.engagement_id is not null and public.is_portal_accessible_entity_id(v_task.engagement_id));

  if not v_authorized then
    raise exception 'not authorized to update this task';
  end if;

  update public.tasks
  set status = case when p_completed then 'completed' else 'pending' end,
      completed_at = case when p_completed then now() else null end
  where id = p_task_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_config_object_status(p_table text, p_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
begin
  if not public.is_valid_config_table(p_table) then
    raise exception 'unsupported config table: %', p_table;
  end if;
  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'invalid status: %', p_status;
  end if;

  execute format('select workspace_id from public.%I where id = $1', p_table) into v_workspace_id using p_id;

  if v_workspace_id is null then
    raise exception 'Verexa system objects are read-only; duplicate it into your workspace first';
  end if;
  if not public.is_workspace_admin(v_workspace_id) then
    raise exception 'insufficient permissions to change this object''s status';
  end if;

  execute format('update public.%I set status = $1 where id = $2', p_table) using p_status, p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_feature_flag(p_workspace_id uuid, p_flag_key text, p_enabled boolean, p_config jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_flag_id uuid;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to manage feature flags for this workspace';
  end if;

  select id into v_flag_id from public.feature_flags where key = p_flag_key;
  if v_flag_id is null then
    raise exception 'unknown feature flag key: %', p_flag_key;
  end if;

  insert into public.workspace_feature_flags (workspace_id, feature_flag_id, is_enabled, config, updated_by)
  values (p_workspace_id, v_flag_id, p_enabled, p_config, auth.uid())
  on conflict (workspace_id, feature_flag_id) do update
    set is_enabled = excluded.is_enabled, config = excluded.config, updated_by = excluded.updated_by, updated_at = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_firm_tax_profile(p_workspace_id uuid, p_ein text DEFAULT NULL::text, p_efin text DEFAULT NULL::text, p_ptin text DEFAULT NULL::text, p_clear_ein boolean DEFAULT false, p_clear_efin boolean DEFAULT false, p_clear_ptin boolean DEFAULT false, p_supported_filing_states text[] DEFAULT NULL::text[], p_regular_office_hours jsonb DEFAULT NULL::jsonb, p_tax_season_hours jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to manage this workspace''s tax profile';
  end if;

  if p_efin is not null and exists (
    select 1 from public.firm_tax_profile
    where efin_hash = public.hash_firm_secret(p_efin) and workspace_id <> p_workspace_id
  ) then
    raise exception 'This EFIN is already registered to another Verexa account.';
  end if;

  if p_ptin is not null and (
    exists (select 1 from public.firm_tax_profile where ptin_hash = public.hash_firm_secret(p_ptin) and workspace_id <> p_workspace_id)
    or exists (select 1 from public.user_profiles where ptin_hash = public.hash_firm_secret(p_ptin))
  ) then
    raise exception 'This PTIN is already registered to another Verexa account.';
  end if;

  insert into public.firm_tax_profile (workspace_id)
  values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  update public.firm_tax_profile set
    ein_encrypted = case when p_clear_ein then null when p_ein is not null then public.encrypt_firm_secret(p_ein) else ein_encrypted end,
    ein_last4 = case when p_clear_ein then null when p_ein is not null then right(regexp_replace(p_ein, '\D', '', 'g'), 4) else ein_last4 end,
    efin_encrypted = case when p_clear_efin then null when p_efin is not null then public.encrypt_firm_secret(p_efin) else efin_encrypted end,
    efin_last4 = case when p_clear_efin then null when p_efin is not null then right(regexp_replace(p_efin, '\D', '', 'g'), 4) else efin_last4 end,
    efin_hash = case when p_clear_efin then null when p_efin is not null then public.hash_firm_secret(p_efin) else efin_hash end,
    ptin_encrypted = case when p_clear_ptin then null when p_ptin is not null then public.encrypt_firm_secret(p_ptin) else ptin_encrypted end,
    ptin_last4 = case when p_clear_ptin then null when p_ptin is not null then right(regexp_replace(p_ptin, '\D', '', 'g'), 4) else ptin_last4 end,
    ptin_hash = case when p_clear_ptin then null when p_ptin is not null then public.hash_firm_secret(p_ptin) else ptin_hash end,
    supported_filing_states = coalesce(p_supported_filing_states, supported_filing_states),
    regular_office_hours = coalesce(p_regular_office_hours, regular_office_hours),
    tax_season_hours = coalesce(p_tax_season_hours, tax_season_hours),
    updated_by = auth.uid(),
    updated_at = now()
  where workspace_id = p_workspace_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_my_ptin(p_ptin text, p_clear boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hash text;
begin
  if p_ptin is not null then
    v_hash := public.hash_firm_secret(p_ptin);
    if exists (select 1 from public.user_profiles where ptin_hash = v_hash and id <> auth.uid())
       or exists (select 1 from public.firm_tax_profile where ptin_hash = v_hash) then
      raise exception 'This PTIN is already registered to another Verexa account.';
    end if;
  end if;

  update public.user_profiles set
    ptin_encrypted = case when p_clear then null when p_ptin is not null then public.encrypt_firm_secret(p_ptin) else ptin_encrypted end,
    ptin_last4 = case when p_clear then null when p_ptin is not null then right(regexp_replace(p_ptin, '\D', '', 'g'), 4) else ptin_last4 end,
    ptin_hash = case when p_clear then null when p_ptin is not null then public.hash_firm_secret(p_ptin) else ptin_hash end
  where id = auth.uid();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_organizer_answer_review_status(p_answer_id uuid, p_status review_status, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_entity_type text;
  v_entity_id uuid;
begin
  select r.workspace_id, case when r.engagement_id is not null then 'engagement' else 'client' end, coalesce(r.engagement_id, r.client_id)
  into v_workspace_id, v_entity_type, v_entity_id
  from public.organizer_response_answers a
  join public.organizer_responses r on r.id = a.organizer_response_id
  where a.id = p_answer_id;

  if v_workspace_id is null then
    raise exception 'organizer answer not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;

  update public.organizer_response_answers
  set review_status = p_status, review_note = p_note
  where id = p_answer_id;

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), v_entity_type, v_entity_id, 'ORGANIZER_ANSWER_REVIEWED', 'ORGANIZER_ANSWER_REVIEWED',
    'Marked an organizer answer "' || p_status || '"', jsonb_build_object('answer_id', p_answer_id));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_organizer_response_review_status(p_response_id uuid, p_status review_status, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_status text;
begin
  select workspace_id, status into v_workspace_id, v_status
  from public.organizer_responses where id = p_response_id;

  if v_workspace_id is null then
    raise exception 'organizer response not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;
  if v_status not in ('submitted', 'reviewed') then
    raise exception 'this organizer has not been submitted yet';
  end if;

  update public.organizer_responses
  set review_status = p_status,
      review_note = p_note,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      status = 'reviewed'
  where id = p_response_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_platform_admin(p_user_email text, p_is_platform_admin boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to change platform admin status';
  end if;

  select id into v_user_id from auth.users where email = p_user_email;
  if v_user_id is null then
    raise exception 'no user found with email %', p_user_email;
  end if;

  update public.user_profiles set is_platform_admin = p_is_platform_admin, updated_at = now() where id = v_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_platform_admin_by_id(p_user_id uuid, p_is_platform_admin boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to change platform admin status';
  end if;
  if p_user_id = auth.uid() and not p_is_platform_admin then
    raise exception 'cannot revoke your own platform admin access';
  end if;

  update public.user_profiles set is_platform_admin = p_is_platform_admin, updated_at = now() where id = p_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_platform_ai_operator(p_user_email text, p_is_platform_ai_operator boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to change Admin AI access';
  end if;

  select id into v_user_id from auth.users where email = p_user_email;
  if v_user_id is null then
    raise exception 'no user found with email %', p_user_email;
  end if;

  update public.user_profiles set is_platform_ai_operator = p_is_platform_ai_operator, updated_at = now() where id = v_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_platform_ai_operator_by_id(p_user_id uuid, p_is_platform_ai_operator boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to change Admin AI access';
  end if;

  update public.user_profiles set is_platform_ai_operator = p_is_platform_ai_operator, updated_at = now() where id = p_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_platform_it(p_user_email text, p_is_platform_it boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to change platform IT status';
  end if;

  select id into v_user_id from auth.users where email = p_user_email;
  if v_user_id is null then
    raise exception 'no user found with email %', p_user_email;
  end if;

  update public.user_profiles set is_platform_it = p_is_platform_it, updated_at = now() where id = v_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_platform_it_by_id(p_user_id uuid, p_is_platform_it boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to change platform IT status';
  end if;

  update public.user_profiles set is_platform_it = p_is_platform_it, updated_at = now() where id = p_user_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_platform_system_credential(p_id uuid, p_system_name text, p_username text, p_secret text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if not is_platform_it() then
    raise exception 'insufficient permissions to manage system credentials';
  end if;

  if p_id is null then
    insert into public.platform_system_credentials (system_name, username, secret_encrypted, notes, created_by)
    values (p_system_name, nullif(btrim(p_username), ''), encrypt_firm_secret(p_secret), nullif(btrim(p_notes), ''), auth.uid())
    returning id into v_id;
  else
    update public.platform_system_credentials
    set system_name = p_system_name,
        username = nullif(btrim(p_username), ''),
        secret_encrypted = case when p_secret is null or btrim(p_secret) = '' then secret_encrypted else encrypt_firm_secret(p_secret) end,
        notes = nullif(btrim(p_notes), ''),
        updated_at = now()
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_workspace_ghl_connection(p_workspace_id uuid, p_api_key text, p_location_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to connect GoHighLevel for this workspace';
  end if;
  if p_api_key is null or btrim(p_api_key) = '' then
    raise exception 'API token is required';
  end if;
  if p_location_id is null or btrim(p_location_id) = '' then
    raise exception 'Location ID is required';
  end if;

  insert into public.workspace_ghl_connections (workspace_id, api_key_encrypted, location_id, connected_by)
  values (p_workspace_id, public.encrypt_firm_secret(p_api_key), btrim(p_location_id), auth.uid())
  on conflict (workspace_id) do update
    set api_key_encrypted = excluded.api_key_encrypted,
        location_id = excluded.location_id,
        connected_by = excluded.connected_by,
        connected_at = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_workspace_jotform_api_key(p_workspace_id uuid, p_api_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to connect JotForm for this workspace';
  end if;
  if p_api_key is null or btrim(p_api_key) = '' then
    raise exception 'API key is required';
  end if;

  insert into public.workspace_jotform_connections (workspace_id, api_key_encrypted, connected_by)
  values (p_workspace_id, public.encrypt_firm_secret(p_api_key), auth.uid())
  on conflict (workspace_id) do update
    set api_key_encrypted = excluded.api_key_encrypted,
        connected_by = excluded.connected_by,
        connected_at = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_workspace_status(p_workspace_id uuid, p_status text, p_suspension_reason text DEFAULT NULL::text)
 RETURNS workspaces
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.workspaces;
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to change workspace status';
  end if;
  if p_status not in ('active', 'suspended', 'archived') then
    raise exception 'invalid status: %', p_status;
  end if;
  if p_suspension_reason is not null and p_suspension_reason not in ('billing_past_due', 'subscription_canceled') then
    raise exception 'invalid suspension reason: %', p_suspension_reason;
  end if;

  update public.workspaces
  set status = p_status,
      suspension_reason = case when p_status = 'suspended' then p_suspension_reason else null end,
      updated_at = now()
  where id = p_workspace_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'workspace % not found', p_workspace_id;
  end if;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.share_config_object(p_table text, p_id uuid, p_shared_with_workspace_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner_workspace_id uuid;
  v_share_id uuid;
begin
  if not public.is_valid_config_table(p_table) then
    raise exception 'unsupported config table: %', p_table;
  end if;

  execute format('select workspace_id from public.%I where id = $1', p_table) into v_owner_workspace_id using p_id;
  if v_owner_workspace_id is null then
    raise exception 'Verexa system objects are already visible to everyone and cannot be shared; only workspace-owned objects can be';
  end if;
  if not public.is_workspace_admin(v_owner_workspace_id) then
    raise exception 'insufficient permissions to share this object';
  end if;
  if not exists (
    select 1 from public.firm_connections
    where status = 'active'
      and ((parent_workspace_id = v_owner_workspace_id and child_workspace_id = p_shared_with_workspace_id)
        or (parent_workspace_id = p_shared_with_workspace_id and child_workspace_id = v_owner_workspace_id))
  ) then
    raise exception 'no active firm connection to share with this workspace';
  end if;

  insert into public.config_object_shares (object_type, object_id, shared_by_workspace_id, shared_with_workspace_id, shared_by)
  values (p_table, p_id, v_owner_workspace_id, p_shared_with_workspace_id, auth.uid())
  returning id into v_share_id;

  return v_share_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.share_engagement_with_ero(p_engagement_id uuid, p_workspace_id uuid, p_shared_with_workspace_id uuid, p_shared_items jsonb DEFAULT '{}'::jsonb, p_expires_in_days integer DEFAULT 30)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions to share an engagement from this workspace';
  end if;
  if not public.has_permission(p_workspace_id, 'engagements.share') then
    raise exception 'insufficient permissions to share engagements from this workspace';
  end if;
  if not exists (
    select 1 from public.firm_connections
    where relationship_type = 'ero_ptin' and status = 'active'
      and child_workspace_id = p_workspace_id and parent_workspace_id = p_shared_with_workspace_id
  ) then
    raise exception 'no active ERO connection to share this engagement with';
  end if;

  insert into public.engagement_shares (engagement_id, workspace_id, shared_with_workspace_id, shared_items, shared_by, expires_at)
  values (p_engagement_id, p_workspace_id, p_shared_with_workspace_id, coalesce(p_shared_items, '{}'::jsonb), auth.uid(), now() + make_interval(days => p_expires_in_days))
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.should_advance_wait_until_step(p_pending_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pending record;
  v_step record;
  v_run record;
  v_wait_mode text;
  v_timeout_days int;
begin
  select * into v_pending from public.automation_pending_steps where id = p_pending_id;
  if v_pending.id is null then
    return true;
  end if;

  select * into v_step from public.automation_steps where id = v_pending.automation_step_id;
  v_wait_mode := case when v_step.action_type = 'delay' then coalesce(v_step.action_config->>'wait_mode', 'duration') else 'duration' end;

  if v_wait_mode <> 'until_condition' then
    return true;
  end if;

  v_timeout_days := coalesce(nullif(v_step.action_config->>'wait_timeout_days', '')::int, 30);
  if v_pending.created_at < now() - make_interval(days => v_timeout_days) then
    return true;
  end if;

  select * into v_run from public.automation_runs where id = v_pending.run_id;

  return public.evaluate_automation_conditions(
    v_step.action_config->'wait_conditions',
    v_run.trigger_snapshot,
    v_run.workspace_id,
    v_run.client_id,
    v_run.engagement_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sign_public_engagement_letter(p_token uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_typed_name text, p_signature_type text DEFAULT 'typed'::text, p_signature_image_path text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_template record;
  v_client_id uuid;
  v_client_name text;
  v_resolved_html text;
  v_signature_id uuid;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;
  if p_typed_name is null or btrim(p_typed_name) = '' then
    raise exception 'A typed signature is required';
  end if;
  if p_signature_image_path is null or btrim(p_signature_image_path) = '' then
    raise exception 'A drawn signature is required';
  end if;

  select elt.id, elt.workspace_id, elt.body_html, w.name as firm_name, public.format_mailing_address(w.mailing_address) as firm_address, w.phone as firm_phone
  into v_template
  from public.engagement_letter_templates elt
  join public.workspaces w on w.id = elt.workspace_id
  where elt.public_token = p_token and elt.is_public = true and elt.status = 'published';

  if v_template.id is null then
    raise exception 'This link is no longer available';
  end if;

  v_client_id := public.find_or_create_public_lead(v_template.workspace_id, p_first_name, p_last_name, p_email, p_phone);
  v_client_name := btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));
  v_resolved_html := public.render_engagement_letter_merge_fields(v_template.body_html, v_client_name, v_template.firm_name, v_template.firm_address, v_template.firm_phone);

  insert into public.engagement_letter_public_signatures (
    workspace_id, engagement_letter_template_id, client_id,
    signer_name, signer_email, signer_phone, resolved_body_html, typed_name,
    signature_type, signature_image_path
  ) values (
    v_template.workspace_id, v_template.id, v_client_id,
    v_client_name, btrim(p_email), nullif(btrim(coalesce(p_phone, '')), ''), v_resolved_html, btrim(p_typed_name),
    'drawn', p_signature_image_path
  )
  returning id into v_signature_id;

  return jsonb_build_object('ok', true, 'signature_id', v_signature_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sign_public_engagement_letter_with_signup(p_token uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_typed_name text, p_auth_user_id uuid, p_signature_type text DEFAULT 'typed'::text, p_signature_image_path text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_template record;
  v_client_id uuid;
  v_client_name text;
  v_resolved_html text;
  v_signature_id uuid;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;
  if p_typed_name is null or btrim(p_typed_name) = '' then
    raise exception 'A typed signature is required';
  end if;
  if p_signature_image_path is null or btrim(p_signature_image_path) = '' then
    raise exception 'A drawn signature is required';
  end if;
  if p_auth_user_id is null then
    raise exception 'A portal account is required for this link';
  end if;

  select elt.id, elt.workspace_id, elt.body_html, elt.requires_portal_signup,
         w.name as firm_name, public.format_mailing_address(w.mailing_address) as firm_address, w.phone as firm_phone
  into v_template
  from public.engagement_letter_templates elt
  join public.workspaces w on w.id = elt.workspace_id
  where elt.public_token = p_token and elt.is_public = true and elt.status = 'published';

  if v_template.id is null then
    raise exception 'This link is no longer available';
  end if;
  if not v_template.requires_portal_signup then
    raise exception 'This engagement letter does not use portal signup';
  end if;

  v_client_id := public.find_or_create_public_lead(v_template.workspace_id, p_first_name, p_last_name, p_email, p_phone);
  v_client_name := btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));
  v_resolved_html := public.render_engagement_letter_merge_fields(v_template.body_html, v_client_name, v_template.firm_name, v_template.firm_address, v_template.firm_phone);

  insert into public.engagement_letter_public_signatures (
    workspace_id, engagement_letter_template_id, client_id,
    signer_name, signer_email, signer_phone, resolved_body_html, typed_name,
    signature_type, signature_image_path
  ) values (
    v_template.workspace_id, v_template.id, v_client_id,
    v_client_name, btrim(p_email), nullif(btrim(coalesce(p_phone, '')), ''), v_resolved_html, btrim(p_typed_name),
    'drawn', p_signature_image_path
  )
  returning id into v_signature_id;

  perform public.link_public_portal_account(v_template.workspace_id, v_client_id, p_auth_user_id, p_email, v_client_name);

  return jsonb_build_object('ok', true, 'signature_id', v_signature_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.skip_duplicate_active_automation_run()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'running'
     and coalesce(new.engagement_id, new.client_id) is not null
     and exists (
       select 1 from public.automation_runs
       where automation_id = new.automation_id
         and status = 'running'
         and coalesce(engagement_id, client_id) = coalesce(new.engagement_id, new.client_id)
     )
  then
    return null;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.snapshot_config_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_next_version integer;
begin
  select coalesce(max(version_number), 0) + 1 into v_next_version
  from public.config_object_versions
  where object_type = TG_TABLE_NAME and object_id = old.id;

  insert into public.config_object_versions (object_type, object_id, workspace_id, version_number, snapshot, changed_by)
  values (TG_TABLE_NAME, old.id, old.workspace_id, v_next_version, to_jsonb(old), auth.uid());

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_agent_run(p_agent_key text, p_workspace_id uuid, p_run_type text, p_scope jsonb DEFAULT '{}'::jsonb, p_objective text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agent record;
  v_run_id uuid;
begin
  if not public.can_access_admin_ai() then
    raise exception 'insufficient permissions';
  end if;

  if not public.is_ai_sandbox_workspace(p_workspace_id) then
    raise exception 'Admin AI agents may only run against workspaces flagged is_demo -- this is a hard safety boundary, not a preference';
  end if;

  select * into v_agent from public.ai_agents where agent_key = p_agent_key;
  if v_agent.id is null then
    raise exception 'unknown agent: %', p_agent_key;
  end if;
  if not v_agent.is_enabled then
    raise exception '% is not yet enabled', v_agent.name;
  end if;

  insert into public.ai_agent_runs (agent_id, workspace_id, initiated_by, run_type, scope, objective)
  values (v_agent.id, p_workspace_id, auth.uid(), p_run_type, p_scope, p_objective)
  returning id into v_run_id;

  insert into public.ai_agent_run_budgets (run_id) values (v_run_id);

  update public.ai_agents set last_run_id = v_run_id, last_run_at = now(), updated_at = now() where id = v_agent.id;

  return v_run_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_internal_message_thread(p_workspace_id uuid, p_other_user_id uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_thread_id uuid;
  v_a uuid := least(auth.uid(), p_other_user_id);
  v_b uuid := greatest(auth.uid(), p_other_user_id);
begin
  if auth.uid() = p_other_user_id then
    raise exception 'Cannot start a conversation with yourself';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Not a member of this workspace';
  end if;
  if not exists (
    select 1 from public.workspace_users wu
    where wu.workspace_id = p_workspace_id and wu.user_id = p_other_user_id and wu.status = 'active'
  ) then
    raise exception 'That person is not an active member of this workspace';
  end if;

  select id into v_thread_id
  from public.internal_message_threads
  where workspace_id = p_workspace_id and user_a_id = v_a and user_b_id = v_b;

  if v_thread_id is null then
    insert into public.internal_message_threads (workspace_id, user_a_id, user_b_id, created_by, last_message_at)
    values (p_workspace_id, v_a, v_b, auth.uid(), now())
    returning id into v_thread_id;
  else
    update public.internal_message_threads set last_message_at = now() where id = v_thread_id;
  end if;

  insert into public.internal_messages (thread_id, sender_id, body)
  values (v_thread_id, auth.uid(), p_body);

  return v_thread_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_network_message_thread(p_workspace_id uuid, p_other_workspace_id uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ero_workspace_id uuid;
  v_thread_id uuid;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of this workspace';
  end if;
  if nullif(btrim(p_body), '') is null then
    raise exception 'message body is required';
  end if;

  if not exists (
    select 1 from public.get_messageable_network_workspaces(p_workspace_id) m
    where m.workspace_id = p_other_workspace_id
  ) then
    raise exception 'this workspace is not reachable for network messaging';
  end if;

  select case when w.workspace_type in ('ero_office', 'service_bureau') then p_workspace_id else p_other_workspace_id end
  into v_ero_workspace_id
  from public.workspaces w where w.id = p_workspace_id;

  select id into v_thread_id
  from public.network_message_threads
  where ero_workspace_id = v_ero_workspace_id
    and least(workspace_a_id, workspace_b_id) = least(p_workspace_id, p_other_workspace_id)
    and greatest(workspace_a_id, workspace_b_id) = greatest(p_workspace_id, p_other_workspace_id);

  if v_thread_id is null then
    insert into public.network_message_threads (ero_workspace_id, workspace_a_id, workspace_b_id, created_by)
    values (v_ero_workspace_id, p_workspace_id, p_other_workspace_id, auth.uid())
    returning id into v_thread_id;
  end if;

  insert into public.network_messages (thread_id, sender_workspace_id, sender_user_id, body)
  values (v_thread_id, p_workspace_id, auth.uid(), p_body);

  update public.network_message_threads set last_message_at = now() where id = v_thread_id;

  return v_thread_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_next_automation_step(p_run_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run record;
  v_edge record;
  v_next_step_id uuid;
  v_next record;
  v_matched boolean;
  v_has_edges boolean;
  v_current_step_id uuid;
  v_loop_guard int := 0;
  v_wait_mode text;
  v_scheduled_for timestamptz;
  v_approver record;
  v_approval_message text;
begin
  select * into v_run from public.automation_runs where id = p_run_id;
  if v_run.status <> 'running' then
    return;
  end if;

  v_current_step_id := v_run.current_step_id;

  loop
    v_loop_guard := v_loop_guard + 1;
    if v_loop_guard > 200 then
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, error_message, executed_at)
      values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'failed',
        jsonb_build_object('run_id', p_run_id, 'step_id', v_current_step_id),
        'This workflow''s branches form a loop that never reaches an action step (possible cycle). Stopped after 200 steps to avoid running forever.',
        now());
      update public.automation_runs set status = 'failed', completed_at = now() where id = p_run_id;
      return;
    end if;

    if v_current_step_id is null then
      select s.id into v_next_step_id
      from public.automation_steps s
      where s.automation_id = v_run.automation_id
        and not exists (select 1 from public.automation_step_edges e where e.to_step_id = s.id)
      order by s.display_order asc
      limit 1;

      if v_next_step_id is null then
        update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;
        return;
      end if;
    else
      v_matched := false;
      v_next_step_id := null;
      for v_edge in
        select * from public.automation_step_edges
        where from_step_id = v_current_step_id
        order by sort_order asc
      loop
        if v_edge.branch_conditions is null
           or public.evaluate_automation_conditions(v_edge.branch_conditions, v_run.trigger_snapshot, v_run.workspace_id, v_run.client_id, v_run.engagement_id)
        then
          v_next_step_id := v_edge.to_step_id;
          v_matched := true;
          exit;
        end if;
      end loop;

      if not v_matched then
        select exists(select 1 from public.automation_step_edges where from_step_id = v_current_step_id) into v_has_edges;
        if v_has_edges then
          insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
          values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
            jsonb_build_object('run_id', p_run_id, 'step_id', v_current_step_id, 'dead_end', true, 'reason', 'no branch matched and no default edge'),
            now());
        end if;
        update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;
        return;
      end if;

      if v_next_step_id is null then
        insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
        values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
          jsonb_build_object('run_id', p_run_id, 'step_id', v_current_step_id, 'unwired_branch', true, 'reason', 'the matching branch has not been connected to a next step yet'),
          now());
        update public.automation_runs set status = 'completed', completed_at = now() where id = p_run_id;
        return;
      end if;
    end if;

    select * into v_next from public.automation_steps where id = v_next_step_id;
    update public.automation_runs set current_step_id = v_next_step_id where id = p_run_id;

    if v_next.action_type <> 'condition' and v_next.is_enabled = false then
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
      values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
        jsonb_build_object('run_id', p_run_id, 'step_id', v_next.id, 'action_type', v_next.action_type, 'skipped_disabled', true), now());
      v_current_step_id := v_next_step_id;
      continue;
    end if;

    if v_next.action_type = 'condition' and v_next.delay_minutes = 0 then
      insert into public.automation_execution_logs (workspace_id, automation_id, engagement_id, status, execution_data, executed_at)
      values (v_run.workspace_id, v_run.automation_id, v_run.engagement_id, 'completed',
        jsonb_build_object('run_id', p_run_id, 'step_id', v_next.id, 'action_type', 'condition'), now());
      v_current_step_id := v_next_step_id;
      continue;
    end if;

    v_wait_mode := case when v_next.action_type = 'delay' then coalesce(v_next.action_config->>'wait_mode', 'duration') else 'duration' end;

    if v_next.requires_approval then
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_approval');

      v_approval_message := coalesce(nullif(v_next.display_name, ''), initcap(replace(v_next.action_type, '_', ' '))) || ' needs your approval before it runs';

      for v_approver in
        select wu.user_id
        from public.workspace_users wu
        left join public.roles r on r.id = wu.role_id
        where wu.workspace_id = v_run.workspace_id and wu.status = 'active'
          and (
            (v_next.approver_role_id is not null and wu.role_id = v_next.approver_role_id)
            or (v_next.approver_role_id is null and (wu.is_owner or r.slug in ('owner', 'admin')))
          )
      loop
        perform public.create_notification(
          v_run.workspace_id,
          v_approver.user_id,
          'automation',
          'automation-approval-needed',
          jsonb_build_object('message', v_approval_message),
          array['In-App'],
          'High',
          'automation',
          v_run.automation_id
        );
      end loop;
    elsif v_next.action_type = 'business_hours_delay' then
      v_scheduled_for := public.compute_business_hours_deadline(v_run.workspace_id, now(), coalesce(nullif(v_next.action_config->>'hours', '')::numeric, 24));
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_delay', v_scheduled_for);
    elsif v_wait_mode = 'until_date' then
      v_scheduled_for := nullif(v_next.action_config->>'wait_until_at', '')::timestamptz;
      if v_scheduled_for is null then
        perform public.execute_automation_step(p_run_id, v_next.id);
      else
        insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
        values (v_run.workspace_id, p_run_id, v_next.id, 'pending_delay', v_scheduled_for);
      end if;
    elsif v_wait_mode = 'until_condition' then
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_delay', now());
    elsif v_next.delay_minutes > 0 then
      insert into public.automation_pending_steps (workspace_id, run_id, automation_step_id, status, scheduled_for)
      values (v_run.workspace_id, p_run_id, v_next.id, 'pending_delay', now() + make_interval(mins => v_next.delay_minutes));
    else
      perform public.execute_automation_step(p_run_id, v_next.id);
    end if;
    return;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_pipeline_run(p_entity_type text, p_entity_id uuid, p_process_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_id uuid;
  v_workspace_id uuid;
begin
  if p_entity_type = 'client' then
    select workspace_id into v_workspace_id from public.clients where id = p_entity_id;
  elsif p_entity_type = 'engagement' then
    select workspace_id into v_workspace_id from public.engagements where id = p_entity_id;
  else
    raise exception 'unsupported entity_type: %', p_entity_type;
  end if;

  if v_workspace_id is null then
    raise exception '% not found', p_entity_type;
  end if;

  insert into public.pipeline_runs (workspace_id, entity_type, entity_id, process_id, status, started_at)
  values (v_workspace_id, p_entity_type, p_entity_id, p_process_id, 'Active', now())
  returning id into v_run_id;

  insert into public.pipeline_stages (workspace_id, pipeline_run_id, entity_type, process_stage_id, stage_name, display_order)
  select v_workspace_id, v_run_id, p_entity_type, id, name, display_order
  from public.process_stages
  where process_id = p_process_id
  order by display_order asc;

  update public.pipeline_runs
  set current_stage_id = (select id from public.pipeline_stages where pipeline_run_id = v_run_id order by display_order asc limit 1)
  where id = v_run_id;

  update public.pipeline_stages
  set status = 'In Progress', started_at = now()
  where id = (select current_stage_id from public.pipeline_runs where id = v_run_id);

  return v_run_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_organizer_response(p_response_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_template_id uuid;
  v_client_name text;
  v_client_email text;
begin
  select workspace_id, client_id, organizer_template_id
    into v_workspace_id, v_client_id, v_template_id
    from public.organizer_responses where id = p_response_id;
  if v_workspace_id is null then
    raise exception 'organizer response not found';
  end if;
  if not (public.has_permission(v_workspace_id, 'engagements.manage') or public.is_portal_user(v_client_id)) then
    raise exception 'insufficient permissions';
  end if;

  update public.organizer_responses
  set status = 'submitted', submitted_at = now(), updated_at = now()
  where id = p_response_id;

  insert into public.activity_log (workspace_id, entity_type, entity_id, activity_type, description)
  values (v_workspace_id, 'client', v_client_id, 'organizer_submitted', 'Tax organizer submitted');

  select coalesce(nullif(btrim(coalesce(business_name, '')), ''), nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')),
         primary_email
    into v_client_name, v_client_email
    from public.clients where id = v_client_id;

  perform public.resolve_and_sign_organizer_response(p_response_id, v_workspace_id, v_template_id, coalesce(v_client_name, ''), v_client_email);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_portal_basic_info(p_first_name text DEFAULT NULL::text, p_last_name text DEFAULT NULL::text, p_business_name text DEFAULT NULL::text, p_primary_email text DEFAULT NULL::text, p_primary_phone text DEFAULT NULL::text, p_mailing_street text DEFAULT NULL::text, p_mailing_city text DEFAULT NULL::text, p_mailing_state text DEFAULT NULL::text, p_mailing_zip text DEFAULT NULL::text, p_middle_name text DEFAULT NULL::text, p_suffix text DEFAULT NULL::text, p_service_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client_id uuid;
  v_workspace_id uuid;
  v_service_id uuid;
begin
  select client_id, workspace_id into v_client_id, v_workspace_id
  from public.client_portal_users where user_id = auth.uid() and status = 'active' limit 1;
  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  if p_first_name is not null then perform public.propose_client_contact_field('first_name', p_first_name); end if;
  if p_middle_name is not null then perform public.propose_client_contact_field('middle_name', p_middle_name); end if;
  if p_last_name is not null then perform public.propose_client_contact_field('last_name', p_last_name); end if;
  if p_suffix is not null then perform public.propose_client_contact_field('suffix', p_suffix); end if;
  if p_business_name is not null then perform public.propose_client_contact_field('business_name', p_business_name); end if;
  if p_primary_email is not null then perform public.propose_client_contact_field('primary_email', p_primary_email); end if;
  if p_primary_phone is not null then perform public.propose_client_contact_field('primary_phone', p_primary_phone); end if;

  if p_mailing_street is not null or p_mailing_city is not null or p_mailing_state is not null or p_mailing_zip is not null then
    perform public.propose_client_mailing_address(p_mailing_street, p_mailing_city, p_mailing_state, p_mailing_zip);
  end if;

  foreach v_service_id in array coalesce(p_service_ids, array[]::uuid[])
  loop
    insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
    select v_client_id, v_workspace_id, s.service_category_id, s.id, 'portal_basic_info'
    from public.services s
    where s.id = v_service_id;
  end loop;

  update public.clients set portal_basic_info_completed_at = coalesce(portal_basic_info_completed_at, now())
  where id = v_client_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_public_organizer_response(p_token uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_answers jsonb, p_client_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_template_id uuid;
  v_client_id uuid;
  v_client_name text;
  v_response_id uuid;
  v_answer jsonb;
  v_signature_request_id uuid;
  v_field record;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;

  select id, workspace_id into v_template_id, v_workspace_id
  from public.organizer_templates
  where public_token = p_token and is_public = true and status = 'published';

  if v_template_id is null then
    raise exception 'This link is no longer available';
  end if;

  if p_client_id is not null and not exists (
    select 1 from public.clients where id = p_client_id and workspace_id = v_workspace_id
  ) then
    raise exception 'invalid client for this organizer link';
  end if;

  v_client_id := coalesce(p_client_id, public.find_or_create_public_lead(v_workspace_id, p_first_name, p_last_name, p_email, p_phone));
  v_client_name := btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));

  insert into public.organizer_responses (workspace_id, client_id, organizer_template_id, status, submitted_at, is_public_submission)
  values (v_workspace_id, v_client_id, v_template_id, 'submitted', now(), true)
  returning id into v_response_id;

  for v_answer in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    insert into public.organizer_response_answers (organizer_response_id, organizer_field_id, value, instance_index)
    select v_response_id, (v_answer->>'field_id')::uuid, v_answer->'value', coalesce((v_answer->>'instance_index')::int, 0)
    where exists (
      select 1 from public.organizer_fields f where f.id = (v_answer->>'field_id')::uuid and f.organizer_template_id = v_template_id
    );
  end loop;

  for v_field in
    select f.id, f.client_profile_field
    from public.organizer_fields f
    where f.organizer_template_id = v_template_id and f.client_profile_field is not null and f.parent_field_id is null
  loop
    perform public._propose_client_field_from_organizer_answer(
      v_workspace_id, v_client_id, v_response_id, v_field.id, v_field.client_profile_field,
      (select a.value from public.organizer_response_answers a where a.organizer_response_id = v_response_id and a.organizer_field_id = v_field.id and a.instance_index = 0)
    );
  end loop;

  perform public.resolve_organizer_response_service(v_response_id);
  v_signature_request_id := public.resolve_and_sign_organizer_response(v_response_id, v_workspace_id, v_template_id, v_client_name, p_email);

  return jsonb_build_object('ok', true, 'client_id', v_client_id, 'response_id', v_response_id, 'signature_request_id', v_signature_request_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_public_organizer_response_with_signup(p_token uuid, p_first_name text, p_last_name text, p_email text, p_phone text, p_answers jsonb, p_auth_user_id uuid, p_client_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_template_id uuid;
  v_requires_signup boolean;
  v_client_id uuid;
  v_client_name text;
  v_response_id uuid;
  v_answer jsonb;
  v_signature_request_id uuid;
  v_field record;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;
  if p_auth_user_id is null then
    raise exception 'A portal account is required for this link';
  end if;

  select id, workspace_id, requires_portal_signup into v_template_id, v_workspace_id, v_requires_signup
  from public.organizer_templates
  where public_token = p_token and is_public = true and status = 'published';

  if v_template_id is null then
    raise exception 'This link is no longer available';
  end if;
  if not v_requires_signup then
    raise exception 'This organizer does not use portal signup';
  end if;

  if p_client_id is not null and not exists (
    select 1 from public.clients where id = p_client_id and workspace_id = v_workspace_id
  ) then
    raise exception 'invalid client for this organizer link';
  end if;

  v_client_id := coalesce(p_client_id, public.find_or_create_public_lead(v_workspace_id, p_first_name, p_last_name, p_email, p_phone));
  v_client_name := btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));

  insert into public.organizer_responses (workspace_id, client_id, organizer_template_id, status, submitted_at, is_public_submission)
  values (v_workspace_id, v_client_id, v_template_id, 'submitted', now(), true)
  returning id into v_response_id;

  for v_answer in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    insert into public.organizer_response_answers (organizer_response_id, organizer_field_id, value, instance_index)
    select v_response_id, (v_answer->>'field_id')::uuid, v_answer->'value', coalesce((v_answer->>'instance_index')::int, 0)
    where exists (
      select 1 from public.organizer_fields f where f.id = (v_answer->>'field_id')::uuid and f.organizer_template_id = v_template_id
    );
  end loop;

  perform public.resolve_organizer_response_service(v_response_id);
  perform public.link_public_portal_account(v_workspace_id, v_client_id, p_auth_user_id, p_email, v_client_name);

  for v_field in
    select f.id, f.client_profile_field
    from public.organizer_fields f
    where f.organizer_template_id = v_template_id and f.client_profile_field is not null and f.parent_field_id is null
  loop
    perform public._propose_client_field_from_organizer_answer(
      v_workspace_id, v_client_id, v_response_id, v_field.id, v_field.client_profile_field,
      (select a.value from public.organizer_response_answers a where a.organizer_response_id = v_response_id and a.organizer_field_id = v_field.id and a.instance_index = 0)
    );
  end loop;

  v_signature_request_id := public.resolve_and_sign_organizer_response(v_response_id, v_workspace_id, v_template_id, v_client_name, p_email);

  return jsonb_build_object('ok', true, 'client_id', v_client_id, 'response_id', v_response_id, 'signature_request_id', v_signature_request_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(p_module_id uuid, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_module record;
  v_workspace_id uuid;
  v_total int;
  v_correct int := 0;
  v_answer record;
  v_score int;
  v_passed boolean;
begin
  select m.id, m.passing_score_percent, c.owner_workspace_id into v_module
  from public.learning_modules m join public.learning_courses c on c.id = m.course_id
  where m.id = p_module_id and m.module_type = 'quiz';

  if v_module.id is null then
    raise exception 'quiz not found';
  end if;
  if not public.has_learning_hub_access(v_module.owner_workspace_id) then
    raise exception 'insufficient access to this course';
  end if;

  select count(*) into v_total from public.learning_quiz_questions where module_id = p_module_id;
  if v_total = 0 then
    raise exception 'this quiz has no questions yet';
  end if;

  for v_answer in select * from jsonb_to_recordset(p_answers) as x(question_id uuid, selected_option_id uuid)
  loop
    if exists (
      select 1 from public.learning_quiz_options o
      where o.id = v_answer.selected_option_id and o.question_id = v_answer.question_id and o.is_correct
    ) then
      v_correct := v_correct + 1;
    end if;
  end loop;

  v_score := round((v_correct::numeric / v_total::numeric) * 100);
  v_passed := v_score >= v_module.passing_score_percent;

  select workspace_id into v_workspace_id
  from public.workspace_users
  where user_id = auth.uid() and status = 'active'
  order by created_at asc
  limit 1;

  insert into public.learning_module_completions (module_id, user_id, workspace_id, score_percent, passed, completed_at)
  values (p_module_id, auth.uid(), v_workspace_id, v_score, v_passed, now())
  on conflict (module_id, user_id) do update set score_percent = v_score, passed = v_passed, completed_at = now();

  return jsonb_build_object('score_percent', v_score, 'passed', v_passed, 'correct', v_correct, 'total', v_total);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_automation_step_edges()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_incoming_edge public.automation_step_edges%rowtype;
  v_outgoing_edge public.automation_step_edges%rowtype;
begin
  if old.action_type = 'condition' then
    return old;
  end if;

  select * into v_incoming_edge
  from public.automation_step_edges
  where to_step_id = old.id and branch_conditions is null and label is null
  limit 1;

  select * into v_outgoing_edge
  from public.automation_step_edges
  where from_step_id = old.id and branch_conditions is null and label is null
  limit 1;

  if v_incoming_edge.id is not null and v_outgoing_edge.id is not null then
    update public.automation_step_edges
    set to_step_id = v_outgoing_edge.to_step_id
    where id = v_incoming_edge.id;
  end if;

  return old;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_client_emails_forward()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.primary_email is null then
    return new;
  end if;
  if exists (select 1 from public.client_emails where client_id = new.id and is_primary and email = new.primary_email) then
    return new;
  end if;

  update public.client_emails set is_primary = false where client_id = new.id and is_primary;

  insert into public.client_emails (client_id, workspace_id, email_type, email, is_primary, display_order)
  select new.id, new.workspace_id, 'personal', new.primary_email, true, coalesce((select max(display_order) from public.client_emails where client_id = new.id), -1) + 1;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_client_phones_forward()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.primary_phone is null then
    return new;
  end if;
  if exists (select 1 from public.client_phones where client_id = new.id and is_primary and phone_number = new.primary_phone) then
    return new;
  end if;

  update public.client_phones set is_primary = false where client_id = new.id and is_primary;

  insert into public.client_phones (client_id, workspace_id, phone_type, phone_number, is_primary, display_order)
  select new.id, new.workspace_id, 'mobile', new.primary_phone, true, coalesce((select max(display_order) from public.client_phones where client_id = new.id), -1) + 1;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_client_primary_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if new.is_primary then
    update public.clients
    set primary_email = new.email, normalized_email = lower(btrim(new.email::text))::citext, updated_at = now()
    where id = new.client_id;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_client_primary_phone()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.is_primary then
    update public.clients
    set primary_phone = new.phone_number, normalized_phone = nullif(regexp_replace(coalesce(new.phone_number, ''), '\D', '', 'g'), ''), updated_at = now()
    where id = new.client_id;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_client_relationships_from_organizer_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_spouse_name text;
  v_spouse_dob text;
  v_spouse_ssn text;
  r record;
begin
  if new.status <> 'submitted' or old.status is not distinct from 'submitted' or new.client_id is null then
    return new;
  end if;

  select
    max(case when of_.relationship_role = 'spouse_full_name' then public._organizer_name_text(ora.value) end),
    max(case when of_.relationship_role = 'spouse_dob' then public._organizer_scalar_text(ora.value) end),
    max(case when of_.relationship_role = 'spouse_ssn' then public._organizer_scalar_text(ora.value) end)
  into v_spouse_name, v_spouse_dob, v_spouse_ssn
  from public.organizer_response_answers ora
  join public.organizer_fields of_ on of_.id = ora.organizer_field_id
  where ora.organizer_response_id = new.id
    and of_.relationship_role in ('spouse_full_name', 'spouse_dob', 'spouse_ssn');

  if v_spouse_name is not null and btrim(v_spouse_name) <> '' then
    insert into public.client_relationships (
      client_id, workspace_id, relationship_type, related_name, related_dob,
      related_ssn_encrypted, related_ssn_last4, source_organizer_response_id, source_instance_index
    ) values (
      new.client_id, new.workspace_id, 'spouse', v_spouse_name,
      nullif(v_spouse_dob, '')::date,
      case when v_spouse_ssn is not null and btrim(v_spouse_ssn) <> '' then public.encrypt_client_secret(v_spouse_ssn) end,
      nullif(right(regexp_replace(coalesce(v_spouse_ssn, ''), '\D', '', 'g'), 4), ''),
      new.id, null
    )
    on conflict (client_id, source_organizer_response_id, coalesce(source_instance_index, -1)) where source_organizer_response_id is not null
    do update set
      related_name = excluded.related_name,
      related_dob = excluded.related_dob,
      related_ssn_encrypted = excluded.related_ssn_encrypted,
      related_ssn_last4 = excluded.related_ssn_last4,
      updated_at = now();
  end if;

  for r in
    select
      ora.instance_index,
      max(case when of_.relationship_role = 'dependent_full_name' then public._organizer_name_text(ora.value) end) as dep_name,
      max(case when of_.relationship_role = 'dependent_dob' then public._organizer_scalar_text(ora.value) end) as dep_dob,
      max(case when of_.relationship_role = 'dependent_ssn' then public._organizer_scalar_text(ora.value) end) as dep_ssn,
      max(case when of_.relationship_role = 'dependent_relationship_type' then public._organizer_scalar_text(ora.value) end) as dep_reltype,
      max(case when of_.relationship_role = 'dependent_relationship_other' then public._organizer_scalar_text(ora.value) end) as dep_relother
    from public.organizer_response_answers ora
    join public.organizer_fields of_ on of_.id = ora.organizer_field_id
    where ora.organizer_response_id = new.id
      and of_.relationship_role in ('dependent_full_name', 'dependent_dob', 'dependent_ssn', 'dependent_relationship_type', 'dependent_relationship_other')
    group by ora.instance_index
  loop
    if r.dep_name is null or btrim(r.dep_name) = '' then
      continue;
    end if;
    insert into public.client_relationships (
      client_id, workspace_id, relationship_type, related_name, related_dob,
      related_ssn_encrypted, related_ssn_last4, custom_relationship_title,
      source_organizer_response_id, source_instance_index
    ) values (
      new.client_id, new.workspace_id, 'dependent', r.dep_name,
      nullif(r.dep_dob, '')::date,
      case when r.dep_ssn is not null and btrim(r.dep_ssn) <> '' then public.encrypt_client_secret(r.dep_ssn) end,
      nullif(right(regexp_replace(coalesce(r.dep_ssn, ''), '\D', '', 'g'), 4), ''),
      case when r.dep_reltype = 'Other' then nullif(r.dep_relother, '') else r.dep_reltype end,
      new.id, r.instance_index
    )
    on conflict (client_id, source_organizer_response_id, coalesce(source_instance_index, -1)) where source_organizer_response_id is not null
    do update set
      related_name = excluded.related_name,
      related_dob = excluded.related_dob,
      related_ssn_encrypted = excluded.related_ssn_encrypted,
      related_ssn_last4 = excluded.related_ssn_last4,
      custom_relationship_title = excluded.custom_relationship_title,
      updated_at = now();
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_engagement_current_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_name text;
begin
  if new.entity_type <> 'engagement' or new.current_stage_id is null then
    return new;
  end if;

  select stage_name into v_stage_name from public.pipeline_stages where id = new.current_stage_id;
  if v_stage_name is not null then
    update public.engagements set current_stage = v_stage_name where id = new.entity_id;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_sent_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'sent' and new.sent_at is null then
    new.sent_at := now();
  elsif new.status = 'draft' then
    new.sent_at := null;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tag_client_on_invoice_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client_id uuid;
begin
  if new.status <> 'paid' or old.status is not distinct from new.status then
    return new;
  end if;
  v_client_id := coalesce(new.client_id, (select client_id from public.engagements where id = new.engagement_id));
  if v_client_id is null then
    return new;
  end if;
  update public.clients
  set tags = array(select distinct unnest(coalesce(tags, '{}') || array['payment:received']))
  where id = v_client_id;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tag_client_on_invoice_sent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client_id uuid;
begin
  if new.status <> 'sent' then
    return new;
  end if;
  v_client_id := coalesce(new.client_id, (select client_id from public.engagements where id = new.engagement_id));
  if v_client_id is null then
    return new;
  end if;
  update public.clients
  set tags = array(select distinct unnest(coalesce(tags, '{}') || array['invoice:ready-to-send']))
  where id = v_client_id;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_message_thread()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.message_threads set last_message_at = new.created_at where id = new.thread_id;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_resolve_organizer_response_service()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status in ('submitted', 'reviewed')
     and (old.status is null or old.status not in ('submitted', 'reviewed')) then
    perform resolve_organizer_response_service(new.id);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.turn_on_service(p_service_id uuid, p_workspace_id uuid, p_new_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row jsonb;
  v_source_workspace_id uuid;
  v_new_id uuid := gen_random_uuid();
  v_new_slug text;
  v_source_process_id uuid;
  v_new_process_id uuid;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to turn on a service in this workspace';
  end if;

  select to_jsonb(t) into v_row from public.services t where t.id = p_service_id;
  if v_row is null then
    raise exception 'service % not found', p_service_id;
  end if;

  v_source_workspace_id := nullif(v_row->>'workspace_id', '')::uuid;
  if v_source_workspace_id is not null and v_source_workspace_id <> p_workspace_id then
    raise exception 'cannot turn on another workspace''s service directly';
  end if;

  v_new_slug := coalesce(v_row->>'slug', 'service') || '-copy-' || left(replace(v_new_id::text, '-', ''), 8);

  v_row := v_row || jsonb_build_object(
    'id', v_new_id,
    'workspace_id', p_workspace_id,
    'slug', v_new_slug,
    'status', 'draft',
    'created_at', now(),
    'updated_at', now(),
    'cloned_from_service_id', p_service_id
  );
  if p_new_name is not null then
    v_row := v_row || jsonb_build_object('name', p_new_name);
  end if;

  insert into public.services select * from jsonb_populate_record(null::public.services, v_row);

  v_source_process_id := nullif(v_row->>'process_id', '')::uuid;
  if v_source_process_id is not null then
    v_new_process_id := gen_random_uuid();

    insert into public.processes (id, workspace_id, name, slug, description, status, created_by, created_at, updated_at)
    select v_new_process_id, p_workspace_id, name,
           slug || '-copy-' || left(replace(v_new_process_id::text, '-', ''), 8),
           description, 'draft', auth.uid(), now(), now()
    from public.processes where id = v_source_process_id;

    create temporary table if not exists tmp_turn_on_stage_map (old_id uuid primary key, new_id uuid) on commit drop;
    delete from tmp_turn_on_stage_map where true;

    insert into tmp_turn_on_stage_map (old_id, new_id)
    select id, gen_random_uuid() from public.process_stages where process_id = v_source_process_id;

    insert into public.process_stages (id, process_id, name, display_order, reviewer_role_id, completion_rule, due_date_rule, entry_conditions, notify_on_entry, expected_duration, warning_threshold, critical_threshold)
    select m.new_id, v_new_process_id, s.name, s.display_order, s.reviewer_role_id, s.completion_rule, s.due_date_rule, s.entry_conditions, s.notify_on_entry, s.expected_duration, s.warning_threshold, s.critical_threshold
    from public.process_stages s
    join tmp_turn_on_stage_map m on m.old_id = s.id
    where s.process_id = v_source_process_id;

    insert into public.process_tasks (id, process_stage_id, name, description, display_order, assignee_role_id, is_required, due_date_rule, automation_trigger)
    select gen_random_uuid(), m.new_id, t.name, t.description, t.display_order, t.assignee_role_id, t.is_required, t.due_date_rule, t.automation_trigger
    from public.process_tasks t
    join tmp_turn_on_stage_map m on m.old_id = t.process_stage_id;

    update public.services set process_id = v_new_process_id where id = v_new_id;
  end if;

  return v_new_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.unflag_organizer_information_request_item(p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_request_id uuid;
  v_request_status text;
begin
  select req.workspace_id, req.id, req.status
  into v_workspace_id, v_request_id, v_request_status
  from public.organizer_information_request_items item
  join public.organizer_information_requests req on req.id = item.request_id
  where item.id = p_item_id;

  if v_workspace_id is null then
    raise exception 'information request item not found';
  end if;
  if not public.has_permission(v_workspace_id, 'organizers.review') then
    raise exception 'insufficient permissions';
  end if;

  if v_request_status = 'draft' then
    delete from public.organizer_information_request_items where id = p_item_id;

    if not exists (select 1 from public.organizer_information_request_items where request_id = v_request_id) then
      delete from public.organizer_information_requests where id = v_request_id and status = 'draft';
    end if;
  else
    update public.organizer_information_request_items
    set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
    where id = p_item_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_agent_finding_status(p_finding_id uuid, p_status text, p_decision_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_access_admin_ai() then
    raise exception 'insufficient permissions';
  end if;
  if p_status not in ('open', 'investigating', 'fixed', 'retest_required', 'resolved', 'reopened') then
    raise exception 'invalid status: %', p_status;
  end if;

  update public.ai_agent_findings
  set status = p_status, decision_notes = coalesce(p_decision_notes, decision_notes),
      reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = p_finding_id;

  if not found then
    raise exception 'finding not found';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_workspace_subscription(p_workspace_id uuid, p_plan_id uuid, p_stripe_status text DEFAULT 'active'::text, p_seat_count integer DEFAULT 1)
 RETURNS workspace_subscriptions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.workspace_subscriptions;
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to manage workspace subscriptions';
  end if;

  insert into public.workspace_subscriptions (workspace_id, plan_id, stripe_status, seat_count)
  values (p_workspace_id, p_plan_id, p_stripe_status, p_seat_count)
  on conflict (workspace_id) do update
    set plan_id = excluded.plan_id,
        stripe_status = excluded.stripe_status,
        seat_count = excluded.seat_count,
        updated_at = now()
  returning * into v_row;

  perform public.grant_workspace_usage_meters(p_workspace_id);

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_automation(p_automation_id uuid)
 RETURNS TABLE(step_order integer, action_type text, display_name text, issue text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_trigger_type text;
  v_step_count int;
  v_step record;
begin
  select workspace_id, trigger_type into v_workspace_id, v_trigger_type from public.automations where id = p_automation_id;
  if v_workspace_id is null then
    raise exception 'automation not found';
  end if;
  if not public.has_permission(v_workspace_id, 'automations.manage') then
    raise exception 'insufficient permissions to validate this automation';
  end if;

  if v_trigger_type is null or btrim(v_trigger_type) = '' then
    return query select 0, 'trigger'::text, 'Trigger'::text, 'No trigger is configured for this automation.'::text;
  end if;

  select count(*) into v_step_count from public.automation_steps where automation_id = p_automation_id;
  if v_step_count = 0 then
    return query select 0, 'no_steps'::text, 'Steps'::text, 'This automation has no steps, so activating it does nothing.'::text;
  end if;

  for v_step in select * from public.automation_steps where automation_id = p_automation_id order by display_order loop
    if v_step.action_type = 'send_organizer_template' then
      if nullif(v_step.action_config->>'organizer_template_id', '') is not null
         and not exists (select 1 from public.organizer_templates where id = (v_step.action_config->>'organizer_template_id')::uuid) then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Send Organizer'), 'The configured organizer no longer exists.';
      end if;

    elsif v_step.action_type = 'send_email' then
      if nullif(v_step.action_config->>'template_slug', '') is null then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Send Email'), 'No email template is selected for this step.';
      elsif not exists (
        select 1 from public.email_templates
        where slug = v_step.action_config->>'template_slug' and status = 'published' and (workspace_id is null or workspace_id = v_workspace_id)
      ) then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Send Email'), 'The selected email template does not exist or is not published.';
      end if;

    elsif v_step.action_type = 'send_sms' then
      if nullif(v_step.action_config->>'template_slug', '') is null then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Send SMS'), 'No SMS template is selected for this step.';
      elsif not exists (
        select 1 from public.sms_templates
        where slug = v_step.action_config->>'template_slug' and status = 'published' and (workspace_id is null or workspace_id = v_workspace_id)
      ) then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Send SMS'), 'The selected SMS template does not exist or is not published.';
      end if;

    elsif v_step.action_type = 'send_engagement_letter' and nullif(v_step.action_config->>'engagement_letter_template_id', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Send Engagement Letter'), 'No engagement letter template is configured for this step.';

    elsif v_step.action_type = 'send_document_request' and nullif(v_step.action_config->>'document_request_template_id', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Request Documents'), 'No document request template is configured for this step.';

    elsif v_step.action_type = 'assign_user' and nullif(v_step.action_config->>'staff_id', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Assign Staff'), 'No staff member is selected for this step.';

    elsif v_step.action_type = 'move_pipeline_stage' then
      if nullif(v_step.action_config->>'process_id', '') is null or nullif(v_step.action_config->>'process_stage_id', '') is null then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Move to a Pipeline Stage'), 'No target pipeline stage is selected for this step.';
      end if;

    elsif v_step.action_type = 'start_workflow' then
      if nullif(v_step.action_config->>'automation_id', '') is null then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Start Workflow'), 'No automation is selected to start.';
      elsif not exists (
        select 1 from public.automations where id = (v_step.action_config->>'automation_id')::uuid and workspace_id = v_workspace_id and status = 'published'
      ) then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Start Workflow'), 'The selected automation to start is missing or not published.';
      end if;

    elsif v_step.action_type = 'webhook' and nullif(v_step.action_config->>'url', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Webhook'), 'No webhook URL is configured for this step.';

    elsif v_step.action_type = 'create_task' and nullif(v_step.action_config->>'title', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Create Task'), 'No task title is configured for this step.';

    elsif v_step.action_type = 'send_portal_message' and nullif(v_step.action_config->>'body', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Send Portal Message'), 'No message body is configured for this step.';

    elsif v_step.action_type = 'add_tag' and nullif(v_step.action_config->>'tag', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Add Tag'), 'No tag is configured for this step.';

    elsif v_step.action_type = 'remove_tag' and nullif(v_step.action_config->>'tag', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Remove Tag'), 'No tag is configured for this step.';

    elsif v_step.action_type = 'mark_lead_lost' and nullif(v_step.action_config->>'reason', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Mark Lead Lost'), 'No reason is configured for this step.';

    elsif v_step.action_type = 'update_client' then
      if nullif(v_step.action_config->>'field', '') is null then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Update Client'), 'No field is selected to update for this step.';
      elsif nullif(v_step.action_config->>'value', '') is null then
        return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Update Client'), 'No value is set for this step -- it would clear the field instead of updating it.';
      end if;

    elsif v_step.action_type = 'add_note' and nullif(v_step.action_config->>'body', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Add Note'), 'No note text is configured for this step.';

    elsif v_step.action_type = 'send_notification' and nullif(v_step.action_config->>'message', '') is null then
      return query select v_step.display_order, v_step.action_type, coalesce(v_step.display_name, 'Notify Staff'), 'No message is configured for this step.';
    end if;
  end loop;

  return;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_client_lifecycle_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.lifecycle_status in ('lead', 'active', 'inactive', 'archived', 'lost') then
    return new;
  end if;
  raise exception 'Invalid lifecycle_status "%" for this workspace.', new.lifecycle_status;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.withdraw_engagement_share(p_engagement_share_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_shared_by_workspace_id uuid;
  v_status text;
begin
  select workspace_id, status into v_shared_by_workspace_id, v_status
  from public.engagement_shares where id = p_engagement_share_id;
  if v_shared_by_workspace_id is null then
    raise exception 'engagement share not found';
  end if;
  if not public.has_permission(v_shared_by_workspace_id, 'engagements.share') then
    raise exception 'insufficient permissions to withdraw this engagement share';
  end if;
  if v_status <> 'pending' then
    raise exception 'only a pending engagement share can be withdrawn';
  end if;

  update public.engagement_shares set status = 'withdrawn', reviewed_at = now() where id = p_engagement_share_id;

  insert into public.engagement_review_actions (engagement_share_id, action, actor_id)
  values (p_engagement_share_id, 'withdraw', auth.uid());
end;
$function$
;

-- =============================================================================
-- 5. CONSTRAINTS (primary key -> unique -> foreign key -> check)
-- =============================================================================

ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_agent_evidence ADD CONSTRAINT ai_agent_evidence_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_agent_finding_correlations ADD CONSTRAINT ai_agent_finding_correlations_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_agent_findings ADD CONSTRAINT ai_agent_findings_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_agent_run_budgets ADD CONSTRAINT ai_agent_run_budgets_pkey PRIMARY KEY (run_id);
ALTER TABLE public.ai_agent_run_events ADD CONSTRAINT ai_agent_run_events_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_agent_runs ADD CONSTRAINT ai_agent_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_agent_test_personas ADD CONSTRAINT ai_agent_test_personas_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_agents ADD CONSTRAINT ai_agents_pkey PRIMARY KEY (id);
ALTER TABLE public.appointment_external_events ADD CONSTRAINT appointment_external_events_pkey PRIMARY KEY (id);
ALTER TABLE public.appointments ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);
ALTER TABLE public.attachments ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.automation_date_reminders_sent ADD CONSTRAINT automation_date_reminders_sent_pkey PRIMARY KEY (automation_id, entity_type, entity_id, reminder_date);
ALTER TABLE public.automation_execution_logs ADD CONSTRAINT automation_execution_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.automation_pending_steps ADD CONSTRAINT automation_pending_steps_pkey PRIMARY KEY (id);
ALTER TABLE public.automation_runs ADD CONSTRAINT automation_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.automation_step_edges ADD CONSTRAINT automation_step_edges_pkey PRIMARY KEY (id);
ALTER TABLE public.automation_steps ADD CONSTRAINT automation_steps_pkey PRIMARY KEY (id);
ALTER TABLE public.automation_webhook_deliveries ADD CONSTRAINT automation_webhook_deliveries_pkey PRIMARY KEY (id);
ALTER TABLE public.automations ADD CONSTRAINT automations_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_rules ADD CONSTRAINT billing_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.branding ADD CONSTRAINT branding_pkey PRIMARY KEY (workspace_id);
ALTER TABLE public.calendar_sync_queue ADD CONSTRAINT calendar_sync_queue_pkey PRIMARY KEY (id);
ALTER TABLE public.change_orders ADD CONSTRAINT change_orders_pkey PRIMARY KEY (id);
ALTER TABLE public.client_addresses ADD CONSTRAINT client_addresses_pkey PRIMARY KEY (id);
ALTER TABLE public.client_contacts ADD CONSTRAINT client_contacts_pkey PRIMARY KEY (id);
ALTER TABLE public.client_emails ADD CONSTRAINT client_emails_pkey PRIMARY KEY (id);
ALTER TABLE public.client_ledger ADD CONSTRAINT client_ledger_pkey PRIMARY KEY (id);
ALTER TABLE public.client_pending_changes ADD CONSTRAINT client_pending_changes_pkey PRIMARY KEY (id);
ALTER TABLE public.client_phones ADD CONSTRAINT client_phones_pkey PRIMARY KEY (id);
ALTER TABLE public.client_portal_users ADD CONSTRAINT client_portal_users_pkey PRIMARY KEY (id);
ALTER TABLE public.client_relationships ADD CONSTRAINT client_relationships_pkey PRIMARY KEY (id);
ALTER TABLE public.client_service_interests ADD CONSTRAINT client_service_interests_pkey PRIMARY KEY (id);
ALTER TABLE public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
ALTER TABLE public.communication_preferences ADD CONSTRAINT communication_preferences_pkey PRIMARY KEY (id);
ALTER TABLE public.config_object_shares ADD CONSTRAINT config_object_shares_pkey PRIMARY KEY (id);
ALTER TABLE public.config_object_versions ADD CONSTRAINT config_object_versions_pkey PRIMARY KEY (id);
ALTER TABLE public.consent_records ADD CONSTRAINT consent_records_pkey PRIMARY KEY (id);
ALTER TABLE public.dashboard_widgets ADD CONSTRAINT dashboard_widgets_pkey PRIMARY KEY (id);
ALTER TABLE public.dashboards ADD CONSTRAINT dashboards_pkey PRIMARY KEY (id);
ALTER TABLE public.document_folder_template_items ADD CONSTRAINT document_folder_template_items_pkey PRIMARY KEY (id);
ALTER TABLE public.document_folder_templates ADD CONSTRAINT document_folder_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.document_folders ADD CONSTRAINT document_folders_pkey PRIMARY KEY (id);
ALTER TABLE public.document_request_item_statuses ADD CONSTRAINT document_request_item_statuses_pkey PRIMARY KEY (id);
ALTER TABLE public.document_request_items ADD CONSTRAINT document_request_items_pkey PRIMARY KEY (id);
ALTER TABLE public.document_request_templates ADD CONSTRAINT document_request_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.document_requests ADD CONSTRAINT document_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.draft_saves ADD CONSTRAINT draft_saves_pkey PRIMARY KEY (id);
ALTER TABLE public.due_date_rules ADD CONSTRAINT due_date_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.email_log ADD CONSTRAINT email_log_pkey PRIMARY KEY (id);
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.engagement_assignment_history ADD CONSTRAINT engagement_assignment_history_pkey PRIMARY KEY (id);
ALTER TABLE public.engagement_letter_public_signatures ADD CONSTRAINT engagement_letter_public_signatures_pkey PRIMARY KEY (id);
ALTER TABLE public.engagement_letter_templates ADD CONSTRAINT engagement_letter_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.engagement_pricing ADD CONSTRAINT engagement_pricing_pkey PRIMARY KEY (id);
ALTER TABLE public.engagement_review_actions ADD CONSTRAINT engagement_review_actions_pkey PRIMARY KEY (id);
ALTER TABLE public.engagement_shares ADD CONSTRAINT case_shares_pkey PRIMARY KEY (id);
ALTER TABLE public.engagement_status_history ADD CONSTRAINT engagement_status_history_pkey PRIMARY KEY (id);
ALTER TABLE public.engagement_tax_details ADD CONSTRAINT engagement_tax_details_pkey PRIMARY KEY (engagement_id);
ALTER TABLE public.engagements ADD CONSTRAINT engagements_pkey PRIMARY KEY (id);
ALTER TABLE public.feature_flags ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (id);
ALTER TABLE public.firm_connections ADD CONSTRAINT firm_connections_pkey PRIMARY KEY (id);
ALTER TABLE public.firm_tax_profile ADD CONSTRAINT firm_tax_profile_pkey PRIMARY KEY (workspace_id);
ALTER TABLE public.internal_message_threads ADD CONSTRAINT internal_message_threads_pkey PRIMARY KEY (id);
ALTER TABLE public.internal_messages ADD CONSTRAINT internal_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
ALTER TABLE public.irs_notices ADD CONSTRAINT irs_notices_pkey PRIMARY KEY (id);
ALTER TABLE public.learning_courses ADD CONSTRAINT learning_courses_pkey PRIMARY KEY (id);
ALTER TABLE public.learning_module_completions ADD CONSTRAINT learning_module_completions_pkey PRIMARY KEY (id);
ALTER TABLE public.learning_modules ADD CONSTRAINT learning_modules_pkey PRIMARY KEY (id);
ALTER TABLE public.learning_quiz_options ADD CONSTRAINT learning_quiz_options_pkey PRIMARY KEY (id);
ALTER TABLE public.learning_quiz_questions ADD CONSTRAINT learning_quiz_questions_pkey PRIMARY KEY (id);
ALTER TABLE public.library_folders ADD CONSTRAINT library_folders_pkey PRIMARY KEY (id);
ALTER TABLE public.login_history ADD CONSTRAINT login_history_pkey PRIMARY KEY (id);
ALTER TABLE public.message_threads ADD CONSTRAINT message_threads_pkey PRIMARY KEY (id);
ALTER TABLE public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE public.network_message_threads ADD CONSTRAINT network_message_threads_pkey PRIMARY KEY (id);
ALTER TABLE public.network_messages ADD CONSTRAINT network_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.notes ADD CONSTRAINT notes_pkey PRIMARY KEY (id);
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_pkey PRIMARY KEY (id);
ALTER TABLE public.office_locations ADD CONSTRAINT office_locations_pkey PRIMARY KEY (id);
ALTER TABLE public.organizer_fields ADD CONSTRAINT organizer_fields_pkey PRIMARY KEY (id);
ALTER TABLE public.organizer_information_request_items ADD CONSTRAINT organizer_information_request_items_pkey PRIMARY KEY (id);
ALTER TABLE public.organizer_information_requests ADD CONSTRAINT organizer_information_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.organizer_response_answers ADD CONSTRAINT organizer_response_answers_pkey PRIMARY KEY (id);
ALTER TABLE public.organizer_responses ADD CONSTRAINT organizer_responses_pkey PRIMARY KEY (id);
ALTER TABLE public.organizer_service_routes ADD CONSTRAINT organizer_service_routes_pkey PRIMARY KEY (id);
ALTER TABLE public.organizer_templates ADD CONSTRAINT organizer_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_methods ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
ALTER TABLE public.pending_engagement_letter_sends ADD CONSTRAINT pending_engagement_letter_sends_pkey PRIMARY KEY (id);
ALTER TABLE public.pending_portal_invites ADD CONSTRAINT pending_portal_invites_pkey PRIMARY KEY (id);
ALTER TABLE public.permissions ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);
ALTER TABLE public.pipeline_runs ADD CONSTRAINT pipeline_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.pipeline_stages ADD CONSTRAINT pipeline_stages_pkey PRIMARY KEY (id);
ALTER TABLE public.platform_subscription_plans ADD CONSTRAINT platform_subscription_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.platform_system_credentials ADD CONSTRAINT platform_system_credentials_pkey PRIMARY KEY (id);
ALTER TABLE public.pricing_rules ADD CONSTRAINT pricing_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.process_stages ADD CONSTRAINT process_stages_pkey PRIMARY KEY (id);
ALTER TABLE public.process_tasks ADD CONSTRAINT process_tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.processes ADD CONSTRAINT processes_pkey PRIMARY KEY (id);
ALTER TABLE public.provider_status ADD CONSTRAINT provider_status_pkey PRIMARY KEY (provider);
ALTER TABLE public.quotes ADD CONSTRAINT quotes_pkey PRIMARY KEY (id);
ALTER TABLE public.rate_limit_hits ADD CONSTRAINT rate_limit_hits_pkey PRIMARY KEY (id);
ALTER TABLE public.recurring_billing ADD CONSTRAINT recurring_billing_pkey PRIMARY KEY (id);
ALTER TABLE public.role_permission_overrides ADD CONSTRAINT role_permission_overrides_pkey PRIMARY KEY (role_id, workspace_id, permission_id);
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);
ALTER TABLE public.roles ADD CONSTRAINT roles_pkey PRIMARY KEY (id);
ALTER TABLE public.service_categories ADD CONSTRAINT service_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.services ADD CONSTRAINT services_pkey PRIMARY KEY (id);
ALTER TABLE public.signature_request_signers ADD CONSTRAINT signature_request_signers_pkey PRIMARY KEY (id);
ALTER TABLE public.signature_requests ADD CONSTRAINT signature_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.site_funnels ADD CONSTRAINT site_funnels_pkey PRIMARY KEY (id);
ALTER TABLE public.site_page_sections ADD CONSTRAINT site_page_sections_pkey PRIMARY KEY (id);
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_pkey PRIMARY KEY (id);
ALTER TABLE public.site_websites ADD CONSTRAINT site_websites_pkey PRIMARY KEY (id);
ALTER TABLE public.sms_log ADD CONSTRAINT sms_log_pkey PRIMARY KEY (id);
ALTER TABLE public.sms_templates ADD CONSTRAINT sms_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.system_failure_log ADD CONSTRAINT system_failure_log_pkey PRIMARY KEY (id);
ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.task_dependencies ADD CONSTRAINT task_dependencies_pkey PRIMARY KEY (id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.tax_years ADD CONSTRAINT tax_years_pkey PRIMARY KEY (id);
ALTER TABLE public.trusted_devices ADD CONSTRAINT trusted_devices_pkey PRIMARY KEY (id);
ALTER TABLE public.user_calendar_connections ADD CONSTRAINT user_calendar_connections_pkey PRIMARY KEY (id);
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.user_widget_preferences ADD CONSTRAINT user_widget_preferences_pkey PRIMARY KEY (id);
ALTER TABLE public.user_zoom_connections ADD CONSTRAINT user_zoom_connections_pkey PRIMARY KEY (id);
ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);
ALTER TABLE public.workspace_billing_charge_attempts ADD CONSTRAINT workspace_billing_charge_attempts_pkey PRIMARY KEY (id);
ALTER TABLE public.workspace_email_domains ADD CONSTRAINT workspace_email_domains_pkey PRIMARY KEY (id);
ALTER TABLE public.workspace_feature_flags ADD CONSTRAINT workspace_feature_flags_pkey PRIMARY KEY (id);
ALTER TABLE public.workspace_ghl_connections ADD CONSTRAINT workspace_ghl_connections_pkey PRIMARY KEY (workspace_id);
ALTER TABLE public.workspace_invitations ADD CONSTRAINT workspace_invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.workspace_jotform_connections ADD CONSTRAINT workspace_jotform_connections_pkey PRIMARY KEY (workspace_id);
ALTER TABLE public.workspace_retention_policies ADD CONSTRAINT workspace_retention_policies_pkey PRIMARY KEY (workspace_id);
ALTER TABLE public.workspace_security_policies ADD CONSTRAINT workspace_security_policies_pkey PRIMARY KEY (workspace_id);
ALTER TABLE public.workspace_subscription_invoices ADD CONSTRAINT workspace_subscription_invoices_pkey PRIMARY KEY (id);
ALTER TABLE public.workspace_subscriptions ADD CONSTRAINT workspace_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.workspace_tags ADD CONSTRAINT workspace_tags_pkey PRIMARY KEY (id);
ALTER TABLE public.workspace_usage_meters ADD CONSTRAINT workspace_usage_meters_pkey PRIMARY KEY (id);
ALTER TABLE public.workspace_users ADD CONSTRAINT workspace_users_pkey PRIMARY KEY (id);
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);
ALTER TABLE public.ai_agent_finding_correlations ADD CONSTRAINT ai_agent_finding_correlations_finding_id_a_finding_id_b_key UNIQUE (finding_id_a, finding_id_b);
ALTER TABLE public.ai_agent_run_events ADD CONSTRAINT ai_agent_run_events_run_id_seq_key UNIQUE (run_id, seq);
ALTER TABLE public.ai_agents ADD CONSTRAINT ai_agents_agent_key_key UNIQUE (agent_key);
ALTER TABLE public.appointment_external_events ADD CONSTRAINT appointment_external_events_appointment_id_user_calendar_co_key UNIQUE (appointment_id, user_calendar_connection_id);
ALTER TABLE public.automation_steps ADD CONSTRAINT automation_steps_automation_id_display_order_key UNIQUE (automation_id, display_order) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.automations ADD CONSTRAINT automations_workspace_id_slug_key UNIQUE (workspace_id, slug);
ALTER TABLE public.billing_rules ADD CONSTRAINT billing_rules_workspace_id_slug_key UNIQUE (workspace_id, slug);
ALTER TABLE public.branding ADD CONSTRAINT branding_custom_domain_key UNIQUE (custom_domain);
ALTER TABLE public.branding ADD CONSTRAINT branding_portal_subdomain_key UNIQUE (portal_subdomain);
ALTER TABLE public.clients ADD CONSTRAINT clients_workspace_client_number_key UNIQUE (workspace_id, client_number);
ALTER TABLE public.communication_preferences ADD CONSTRAINT communication_preferences_client_id_key UNIQUE (client_id);
ALTER TABLE public.config_object_versions ADD CONSTRAINT config_object_versions_object_type_object_id_version_number_key UNIQUE (object_type, object_id, version_number);
ALTER TABLE public.dashboard_widgets ADD CONSTRAINT dashboard_widgets_dashboard_id_display_order_key UNIQUE (dashboard_id, display_order) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.dashboards ADD CONSTRAINT dashboards_workspace_id_slug_key UNIQUE (workspace_id, slug);
ALTER TABLE public.document_request_items ADD CONSTRAINT document_request_items_document_request_template_id_display_key UNIQUE (document_request_template_id, display_order) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.document_request_templates ADD CONSTRAINT document_request_templates_workspace_id_slug_key UNIQUE (workspace_id, slug);
ALTER TABLE public.draft_saves ADD CONSTRAINT draft_saves_workspace_id_user_id_draft_type_entity_id_key UNIQUE (workspace_id, user_id, draft_type, entity_id);
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_workspace_id_slug_key UNIQUE (workspace_id, slug);
ALTER TABLE public.engagement_letter_templates ADD CONSTRAINT engagement_letter_templates_public_token_key UNIQUE (public_token);
ALTER TABLE public.engagement_letter_templates ADD CONSTRAINT engagement_letter_templates_workspace_id_slug_key UNIQUE (workspace_id, slug);
ALTER TABLE public.engagement_pricing ADD CONSTRAINT engagement_pricing_engagement_id_key UNIQUE (engagement_id);
ALTER TABLE public.engagements ADD CONSTRAINT engagements_workspace_engagement_number_key UNIQUE (workspace_id, engagement_number);
ALTER TABLE public.feature_flags ADD CONSTRAINT feature_flags_key_key UNIQUE (key);
ALTER TABLE public.firm_connections ADD CONSTRAINT firm_connections_invite_token_key UNIQUE (invite_token);
ALTER TABLE public.firm_connections ADD CONSTRAINT firm_connections_parent_workspace_id_child_workspace_id_rel_key UNIQUE (parent_workspace_id, child_workspace_id, relationship_type);
ALTER TABLE public.learning_module_completions ADD CONSTRAINT learning_module_completions_module_id_user_id_key UNIQUE (module_id, user_id);
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_user_id_workspace_id_event_type_ch_key UNIQUE (user_id, workspace_id, event_type, channel);
ALTER TABLE public.organizer_fields ADD CONSTRAINT organizer_fields_organizer_template_id_display_order_key UNIQUE (organizer_template_id, display_order) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.organizer_response_answers ADD CONSTRAINT organizer_response_answers_response_field_instance_key UNIQUE (organizer_response_id, organizer_field_id, instance_index);
ALTER TABLE public.organizer_service_routes ADD CONSTRAINT organizer_service_routes_organizer_template_id_answer_value_key UNIQUE (organizer_template_id, answer_value);
ALTER TABLE public.organizer_templates ADD CONSTRAINT organizer_templates_public_token_key UNIQUE (public_token);
ALTER TABLE public.organizer_templates ADD CONSTRAINT organizer_templates_workspace_id_slug_key UNIQUE (workspace_id, slug);
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_invoice_id_installment_number_key UNIQUE (invoice_id, installment_number);
ALTER TABLE public.permissions ADD CONSTRAINT permissions_key_key UNIQUE (key);
ALTER TABLE public.platform_subscription_plans ADD CONSTRAINT platform_subscription_plans_slug_key UNIQUE (slug);
ALTER TABLE public.pricing_rules ADD CONSTRAINT pricing_rules_workspace_id_slug_key UNIQUE (workspace_id, slug);
ALTER TABLE public.process_stages ADD CONSTRAINT process_stages_process_id_display_order_key UNIQUE (process_id, display_order) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.process_tasks ADD CONSTRAINT process_tasks_process_stage_id_display_order_key UNIQUE (process_stage_id, display_order) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.processes ADD CONSTRAINT processes_workspace_id_slug_key UNIQUE (workspace_id, slug);
ALTER TABLE public.roles ADD CONSTRAINT roles_workspace_id_slug_key UNIQUE (workspace_id, slug);
ALTER TABLE public.service_categories ADD CONSTRAINT service_categories_workspace_id_slug_key UNIQUE (workspace_id, slug);
ALTER TABLE public.services ADD CONSTRAINT services_workspace_id_slug_key UNIQUE (workspace_id, slug);
ALTER TABLE public.site_page_sections ADD CONSTRAINT site_page_sections_order_unique UNIQUE (page_id, display_order) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_funnel_position_unique UNIQUE (funnel_id, funnel_position) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_website_slug_unique UNIQUE (website_id, slug);
ALTER TABLE public.site_websites ADD CONSTRAINT site_websites_workspace_slug_unique UNIQUE (workspace_id, slug);
ALTER TABLE public.sms_templates ADD CONSTRAINT sms_templates_workspace_id_slug_key UNIQUE (workspace_id, slug);
ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_workspace_id_key_key UNIQUE (workspace_id, key);
ALTER TABLE public.task_dependencies ADD CONSTRAINT task_dependencies_task_id_depends_on_task_id_key UNIQUE (task_id, depends_on_task_id);
ALTER TABLE public.tax_years ADD CONSTRAINT tax_years_year_key UNIQUE (year);
ALTER TABLE public.trusted_devices ADD CONSTRAINT trusted_devices_user_id_device_fingerprint_key UNIQUE (user_id, device_fingerprint);
ALTER TABLE public.user_calendar_connections ADD CONSTRAINT user_calendar_connections_user_id_provider_key UNIQUE (user_id, provider);
ALTER TABLE public.user_widget_preferences ADD CONSTRAINT user_widget_preferences_user_id_dashboard_widget_id_key UNIQUE (user_id, dashboard_widget_id);
ALTER TABLE public.user_zoom_connections ADD CONSTRAINT user_zoom_connections_user_id_key UNIQUE (user_id);
ALTER TABLE public.workspace_email_domains ADD CONSTRAINT workspace_email_domains_workspace_id_key UNIQUE (workspace_id);
ALTER TABLE public.workspace_feature_flags ADD CONSTRAINT workspace_feature_flags_workspace_id_feature_flag_id_key UNIQUE (workspace_id, feature_flag_id);
ALTER TABLE public.workspace_subscription_invoices ADD CONSTRAINT workspace_subscription_invoices_stripe_invoice_id_key UNIQUE (stripe_invoice_id);
ALTER TABLE public.workspace_subscriptions ADD CONSTRAINT workspace_subscriptions_workspace_id_key UNIQUE (workspace_id);
ALTER TABLE public.workspace_tags ADD CONSTRAINT workspace_tags_workspace_id_name_key UNIQUE (workspace_id, name);
ALTER TABLE public.workspace_usage_meters ADD CONSTRAINT workspace_usage_meters_workspace_id_resource_type_key UNIQUE (workspace_id, resource_type);
ALTER TABLE public.workspace_users ADD CONSTRAINT workspace_users_workspace_id_user_id_key UNIQUE (workspace_id, user_id);
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_slug_key UNIQUE (slug);
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.ai_agent_evidence ADD CONSTRAINT ai_agent_evidence_finding_id_fkey FOREIGN KEY (finding_id) REFERENCES ai_agent_findings(id) ON DELETE CASCADE;
ALTER TABLE public.ai_agent_evidence ADD CONSTRAINT ai_agent_evidence_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai_agent_runs(id) ON DELETE CASCADE;
ALTER TABLE public.ai_agent_finding_correlations ADD CONSTRAINT ai_agent_finding_correlations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.ai_agent_finding_correlations ADD CONSTRAINT ai_agent_finding_correlations_finding_id_a_fkey FOREIGN KEY (finding_id_a) REFERENCES ai_agent_findings(id) ON DELETE CASCADE;
ALTER TABLE public.ai_agent_finding_correlations ADD CONSTRAINT ai_agent_finding_correlations_finding_id_b_fkey FOREIGN KEY (finding_id_b) REFERENCES ai_agent_findings(id) ON DELETE CASCADE;
ALTER TABLE public.ai_agent_findings ADD CONSTRAINT ai_agent_findings_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE;
ALTER TABLE public.ai_agent_findings ADD CONSTRAINT ai_agent_findings_regression_of_fkey FOREIGN KEY (regression_of) REFERENCES ai_agent_findings(id);
ALTER TABLE public.ai_agent_findings ADD CONSTRAINT ai_agent_findings_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
ALTER TABLE public.ai_agent_findings ADD CONSTRAINT ai_agent_findings_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai_agent_runs(id) ON DELETE CASCADE;
ALTER TABLE public.ai_agent_findings ADD CONSTRAINT ai_agent_findings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE public.ai_agent_run_budgets ADD CONSTRAINT ai_agent_run_budgets_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai_agent_runs(id) ON DELETE CASCADE;
ALTER TABLE public.ai_agent_run_events ADD CONSTRAINT ai_agent_run_events_run_id_fkey FOREIGN KEY (run_id) REFERENCES ai_agent_runs(id) ON DELETE CASCADE;
ALTER TABLE public.ai_agent_runs ADD CONSTRAINT ai_agent_runs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE;
ALTER TABLE public.ai_agent_runs ADD CONSTRAINT ai_agent_runs_initiated_by_fkey FOREIGN KEY (initiated_by) REFERENCES auth.users(id);
ALTER TABLE public.ai_agent_runs ADD CONSTRAINT ai_agent_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT;
ALTER TABLE public.ai_agent_test_personas ADD CONSTRAINT ai_agent_test_personas_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id);
ALTER TABLE public.ai_agent_test_personas ADD CONSTRAINT ai_agent_test_personas_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.ai_agent_test_personas ADD CONSTRAINT ai_agent_test_personas_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.appointment_external_events ADD CONSTRAINT appointment_external_events_user_calendar_connection_id_fkey FOREIGN KEY (user_calendar_connection_id) REFERENCES user_calendar_connections(id) ON DELETE CASCADE;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.appointments ADD CONSTRAINT appointments_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE SET NULL;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES document_folders(id) ON DELETE SET NULL;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_replaces_attachment_id_fkey FOREIGN KEY (replaces_attachment_id) REFERENCES attachments(id);
ALTER TABLE public.attachments ADD CONSTRAINT client_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.attachments ADD CONSTRAINT client_documents_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.automation_date_reminders_sent ADD CONSTRAINT automation_date_reminders_sent_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE;
ALTER TABLE public.automation_execution_logs ADD CONSTRAINT automation_execution_logs_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE;
ALTER TABLE public.automation_execution_logs ADD CONSTRAINT automation_execution_logs_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES engagements(id);
ALTER TABLE public.automation_execution_logs ADD CONSTRAINT automation_execution_logs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.automation_pending_steps ADD CONSTRAINT automation_pending_steps_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.automation_pending_steps ADD CONSTRAINT automation_pending_steps_automation_step_id_fkey FOREIGN KEY (automation_step_id) REFERENCES automation_steps(id) ON DELETE CASCADE;
ALTER TABLE public.automation_pending_steps ADD CONSTRAINT automation_pending_steps_run_id_fkey FOREIGN KEY (run_id) REFERENCES automation_runs(id) ON DELETE CASCADE;
ALTER TABLE public.automation_pending_steps ADD CONSTRAINT automation_pending_steps_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.automation_runs ADD CONSTRAINT automation_runs_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE;
ALTER TABLE public.automation_runs ADD CONSTRAINT automation_runs_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.automation_runs ADD CONSTRAINT automation_runs_current_step_id_fkey FOREIGN KEY (current_step_id) REFERENCES automation_steps(id) ON DELETE SET NULL;
ALTER TABLE public.automation_runs ADD CONSTRAINT automation_runs_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE CASCADE;
ALTER TABLE public.automation_runs ADD CONSTRAINT automation_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.automation_step_edges ADD CONSTRAINT automation_step_edges_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE;
ALTER TABLE public.automation_step_edges ADD CONSTRAINT automation_step_edges_from_step_id_fkey FOREIGN KEY (from_step_id) REFERENCES automation_steps(id) ON DELETE CASCADE;
ALTER TABLE public.automation_step_edges ADD CONSTRAINT automation_step_edges_to_step_id_fkey FOREIGN KEY (to_step_id) REFERENCES automation_steps(id) ON DELETE SET NULL;
ALTER TABLE public.automation_steps ADD CONSTRAINT automation_steps_approver_role_id_fkey FOREIGN KEY (approver_role_id) REFERENCES roles(id) ON DELETE SET NULL;
ALTER TABLE public.automation_steps ADD CONSTRAINT automation_steps_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE;
ALTER TABLE public.automation_webhook_deliveries ADD CONSTRAINT automation_webhook_deliveries_run_id_fkey FOREIGN KEY (run_id) REFERENCES automation_runs(id) ON DELETE CASCADE;
ALTER TABLE public.automation_webhook_deliveries ADD CONSTRAINT automation_webhook_deliveries_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.automations ADD CONSTRAINT automations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.automations ADD CONSTRAINT automations_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE SET NULL;
ALTER TABLE public.automations ADD CONSTRAINT automations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.billing_rules ADD CONSTRAINT billing_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.billing_rules ADD CONSTRAINT billing_rules_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.branding ADD CONSTRAINT branding_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.change_orders ADD CONSTRAINT change_orders_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES user_profiles(id);
ALTER TABLE public.change_orders ADD CONSTRAINT change_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id);
ALTER TABLE public.change_orders ADD CONSTRAINT change_orders_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE CASCADE;
ALTER TABLE public.change_orders ADD CONSTRAINT change_orders_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES quotes(id);
ALTER TABLE public.change_orders ADD CONSTRAINT change_orders_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.client_addresses ADD CONSTRAINT client_addresses_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_addresses ADD CONSTRAINT client_addresses_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.client_contacts ADD CONSTRAINT client_contacts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_contacts ADD CONSTRAINT client_contacts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.client_emails ADD CONSTRAINT client_emails_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_emails ADD CONSTRAINT client_emails_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.client_ledger ADD CONSTRAINT client_ledger_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_ledger ADD CONSTRAINT client_ledger_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.client_pending_changes ADD CONSTRAINT client_pending_changes_client_address_id_fkey FOREIGN KEY (client_address_id) REFERENCES client_addresses(id) ON DELETE CASCADE;
ALTER TABLE public.client_pending_changes ADD CONSTRAINT client_pending_changes_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_pending_changes ADD CONSTRAINT client_pending_changes_organizer_field_id_fkey FOREIGN KEY (organizer_field_id) REFERENCES organizer_fields(id) ON DELETE SET NULL;
ALTER TABLE public.client_pending_changes ADD CONSTRAINT client_pending_changes_organizer_response_id_fkey FOREIGN KEY (organizer_response_id) REFERENCES organizer_responses(id) ON DELETE SET NULL;
ALTER TABLE public.client_pending_changes ADD CONSTRAINT client_pending_changes_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
ALTER TABLE public.client_pending_changes ADD CONSTRAINT client_pending_changes_submitted_by_portal_user_id_fkey FOREIGN KEY (submitted_by_portal_user_id) REFERENCES client_portal_users(id) ON DELETE SET NULL;
ALTER TABLE public.client_pending_changes ADD CONSTRAINT client_pending_changes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.client_phones ADD CONSTRAINT client_phones_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_phones ADD CONSTRAINT client_phones_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.client_portal_users ADD CONSTRAINT client_portal_users_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_portal_users ADD CONSTRAINT client_portal_users_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.client_portal_users ADD CONSTRAINT client_portal_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.client_portal_users ADD CONSTRAINT client_portal_users_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.client_relationships ADD CONSTRAINT client_relationships_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_relationships ADD CONSTRAINT client_relationships_related_client_id_fkey FOREIGN KEY (related_client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.client_relationships ADD CONSTRAINT client_relationships_source_organizer_response_id_fkey FOREIGN KEY (source_organizer_response_id) REFERENCES organizer_responses(id) ON DELETE SET NULL;
ALTER TABLE public.client_relationships ADD CONSTRAINT client_relationships_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.client_service_interests ADD CONSTRAINT client_service_interests_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_service_interests ADD CONSTRAINT client_service_interests_service_category_id_fkey FOREIGN KEY (service_category_id) REFERENCES service_categories(id);
ALTER TABLE public.client_service_interests ADD CONSTRAINT client_service_interests_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE public.client_service_interests ADD CONSTRAINT client_service_interests_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.clients ADD CONSTRAINT clients_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_default_compliance_officer_id_fkey FOREIGN KEY (default_compliance_officer_id) REFERENCES user_profiles(id);
ALTER TABLE public.clients ADD CONSTRAINT clients_default_reviewer_id_fkey FOREIGN KEY (default_reviewer_id) REFERENCES user_profiles(id);
ALTER TABLE public.clients ADD CONSTRAINT clients_merged_into_client_id_fkey FOREIGN KEY (merged_into_client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD CONSTRAINT clients_relationship_manager_id_fkey FOREIGN KEY (relationship_manager_id) REFERENCES user_profiles(id);
ALTER TABLE public.clients ADD CONSTRAINT clients_source_workspace_id_fkey FOREIGN KEY (source_workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.clients ADD CONSTRAINT clients_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.communication_preferences ADD CONSTRAINT communication_preferences_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.communication_preferences ADD CONSTRAINT communication_preferences_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.config_object_shares ADD CONSTRAINT config_object_shares_responded_by_fkey FOREIGN KEY (responded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.config_object_shares ADD CONSTRAINT config_object_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.config_object_shares ADD CONSTRAINT config_object_shares_shared_by_workspace_id_fkey FOREIGN KEY (shared_by_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.config_object_shares ADD CONSTRAINT config_object_shares_shared_with_workspace_id_fkey FOREIGN KEY (shared_with_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.config_object_versions ADD CONSTRAINT config_object_versions_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.config_object_versions ADD CONSTRAINT config_object_versions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.consent_records ADD CONSTRAINT consent_records_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public.consent_records ADD CONSTRAINT consent_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.consent_records ADD CONSTRAINT consent_records_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.dashboard_widgets ADD CONSTRAINT dashboard_widgets_dashboard_id_fkey FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE;
ALTER TABLE public.dashboards ADD CONSTRAINT dashboards_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.dashboards ADD CONSTRAINT dashboards_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.document_folder_template_items ADD CONSTRAINT document_folder_template_items_document_folder_template_id_fkey FOREIGN KEY (document_folder_template_id) REFERENCES document_folder_templates(id) ON DELETE CASCADE;
ALTER TABLE public.document_folder_template_items ADD CONSTRAINT document_folder_template_items_parent_item_id_fkey FOREIGN KEY (parent_item_id) REFERENCES document_folder_template_items(id) ON DELETE CASCADE;
ALTER TABLE public.document_folder_templates ADD CONSTRAINT document_folder_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id);
ALTER TABLE public.document_folder_templates ADD CONSTRAINT document_folder_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.document_folders ADD CONSTRAINT document_folders_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id);
ALTER TABLE public.document_folders ADD CONSTRAINT document_folders_parent_folder_id_fkey FOREIGN KEY (parent_folder_id) REFERENCES document_folders(id) ON DELETE CASCADE;
ALTER TABLE public.document_folders ADD CONSTRAINT document_folders_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.document_request_item_statuses ADD CONSTRAINT document_request_item_statuses_document_request_id_fkey FOREIGN KEY (document_request_id) REFERENCES document_requests(id) ON DELETE CASCADE;
ALTER TABLE public.document_request_item_statuses ADD CONSTRAINT document_request_item_statuses_document_request_item_id_fkey FOREIGN KEY (document_request_item_id) REFERENCES document_request_items(id);
ALTER TABLE public.document_request_item_statuses ADD CONSTRAINT document_request_item_statuses_fulfilled_by_attachment_id_fkey FOREIGN KEY (fulfilled_by_attachment_id) REFERENCES attachments(id);
ALTER TABLE public.document_request_item_statuses ADD CONSTRAINT document_request_item_statuses_organizer_field_id_fkey FOREIGN KEY (organizer_field_id) REFERENCES organizer_fields(id) ON DELETE SET NULL;
ALTER TABLE public.document_request_items ADD CONSTRAINT document_request_items_document_request_template_id_fkey FOREIGN KEY (document_request_template_id) REFERENCES document_request_templates(id) ON DELETE CASCADE;
ALTER TABLE public.document_request_templates ADD CONSTRAINT document_request_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.document_request_templates ADD CONSTRAINT document_request_templates_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE SET NULL;
ALTER TABLE public.document_request_templates ADD CONSTRAINT document_request_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.document_requests ADD CONSTRAINT document_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id);
ALTER TABLE public.document_requests ADD CONSTRAINT document_requests_document_request_template_id_fkey FOREIGN KEY (document_request_template_id) REFERENCES document_request_templates(id);
ALTER TABLE public.document_requests ADD CONSTRAINT document_requests_organizer_response_id_fkey FOREIGN KEY (organizer_response_id) REFERENCES organizer_responses(id) ON DELETE CASCADE;
ALTER TABLE public.document_requests ADD CONSTRAINT document_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
ALTER TABLE public.document_requests ADD CONSTRAINT document_requests_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.draft_saves ADD CONSTRAINT draft_saves_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.draft_saves ADD CONSTRAINT draft_saves_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.due_date_rules ADD CONSTRAINT due_date_rules_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.email_log ADD CONSTRAINT email_log_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id);
ALTER TABLE public.email_log ADD CONSTRAINT email_log_notification_queue_id_fkey FOREIGN KEY (notification_queue_id) REFERENCES notification_queue(id) ON DELETE SET NULL;
ALTER TABLE public.email_log ADD CONSTRAINT email_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE SET NULL;
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_assignment_history ADD CONSTRAINT engagement_assignment_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES user_profiles(id);
ALTER TABLE public.engagement_assignment_history ADD CONSTRAINT engagement_assignment_history_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_assignment_history ADD CONSTRAINT engagement_assignment_history_new_user_id_fkey FOREIGN KEY (new_user_id) REFERENCES user_profiles(id);
ALTER TABLE public.engagement_assignment_history ADD CONSTRAINT engagement_assignment_history_previous_user_id_fkey FOREIGN KEY (previous_user_id) REFERENCES user_profiles(id);
ALTER TABLE public.engagement_letter_public_signatures ADD CONSTRAINT engagement_letter_public_sign_engagement_letter_template_i_fkey FOREIGN KEY (engagement_letter_template_id) REFERENCES engagement_letter_templates(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_letter_public_signatures ADD CONSTRAINT engagement_letter_public_signatures_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_letter_public_signatures ADD CONSTRAINT engagement_letter_public_signatures_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_letter_templates ADD CONSTRAINT engagement_letter_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.engagement_letter_templates ADD CONSTRAINT engagement_letter_templates_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE SET NULL;
ALTER TABLE public.engagement_letter_templates ADD CONSTRAINT engagement_letter_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_pricing ADD CONSTRAINT engagement_pricing_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id);
ALTER TABLE public.engagement_pricing ADD CONSTRAINT engagement_pricing_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_pricing ADD CONSTRAINT engagement_pricing_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.engagement_review_actions ADD CONSTRAINT engagement_review_actions_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.engagement_review_actions ADD CONSTRAINT engagement_review_actions_engagement_share_id_fkey FOREIGN KEY (engagement_share_id) REFERENCES engagement_shares(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_shares ADD CONSTRAINT case_shares_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.engagement_shares ADD CONSTRAINT case_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.engagement_shares ADD CONSTRAINT case_shares_shared_with_workspace_id_fkey FOREIGN KEY (shared_with_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_shares ADD CONSTRAINT case_shares_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_status_history ADD CONSTRAINT engagement_status_history_audit_reference_fkey FOREIGN KEY (audit_reference) REFERENCES audit_log(id);
ALTER TABLE public.engagement_status_history ADD CONSTRAINT engagement_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES user_profiles(id);
ALTER TABLE public.engagement_status_history ADD CONSTRAINT engagement_status_history_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_tax_details ADD CONSTRAINT engagement_tax_details_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE CASCADE;
ALTER TABLE public.engagement_tax_details ADD CONSTRAINT engagement_tax_details_original_engagement_id_fkey FOREIGN KEY (original_engagement_id) REFERENCES engagements(id);
ALTER TABLE public.engagement_tax_details ADD CONSTRAINT engagement_tax_details_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.engagements ADD CONSTRAINT engagements_assigned_staff_id_fkey FOREIGN KEY (assigned_staff_id) REFERENCES user_profiles(id);
ALTER TABLE public.engagements ADD CONSTRAINT engagements_billing_rule_id_fkey FOREIGN KEY (billing_rule_id) REFERENCES billing_rules(id) ON DELETE SET NULL;
ALTER TABLE public.engagements ADD CONSTRAINT engagements_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
ALTER TABLE public.engagements ADD CONSTRAINT engagements_compliance_officer_id_fkey FOREIGN KEY (compliance_officer_id) REFERENCES user_profiles(id);
ALTER TABLE public.engagements ADD CONSTRAINT engagements_owner_workspace_id_fkey FOREIGN KEY (owner_workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.engagements ADD CONSTRAINT engagements_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES user_profiles(id);
ALTER TABLE public.engagements ADD CONSTRAINT engagements_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE public.engagements ADD CONSTRAINT engagements_source_engagement_share_id_fkey FOREIGN KEY (source_engagement_share_id) REFERENCES engagement_shares(id);
ALTER TABLE public.engagements ADD CONSTRAINT engagements_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES processes(id);
ALTER TABLE public.engagements ADD CONSTRAINT engagements_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.firm_connections ADD CONSTRAINT firm_connections_child_workspace_id_fkey FOREIGN KEY (child_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.firm_connections ADD CONSTRAINT firm_connections_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.firm_connections ADD CONSTRAINT firm_connections_parent_workspace_id_fkey FOREIGN KEY (parent_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.firm_connections ADD CONSTRAINT firm_connections_responded_by_fkey FOREIGN KEY (responded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.firm_tax_profile ADD CONSTRAINT firm_tax_profile_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.firm_tax_profile ADD CONSTRAINT firm_tax_profile_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.internal_message_threads ADD CONSTRAINT internal_message_threads_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.internal_message_threads ADD CONSTRAINT internal_message_threads_user_a_id_fkey FOREIGN KEY (user_a_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.internal_message_threads ADD CONSTRAINT internal_message_threads_user_b_id_fkey FOREIGN KEY (user_b_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.internal_message_threads ADD CONSTRAINT internal_message_threads_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.internal_messages ADD CONSTRAINT internal_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.internal_messages ADD CONSTRAINT internal_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES internal_message_threads(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES engagements(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.irs_notices ADD CONSTRAINT irs_notices_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.irs_notices ADD CONSTRAINT irs_notices_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.learning_courses ADD CONSTRAINT learning_courses_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.learning_courses ADD CONSTRAINT learning_courses_owner_workspace_id_fkey FOREIGN KEY (owner_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.learning_module_completions ADD CONSTRAINT learning_module_completions_module_id_fkey FOREIGN KEY (module_id) REFERENCES learning_modules(id) ON DELETE CASCADE;
ALTER TABLE public.learning_module_completions ADD CONSTRAINT learning_module_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.learning_module_completions ADD CONSTRAINT learning_module_completions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.learning_modules ADD CONSTRAINT learning_modules_course_id_fkey FOREIGN KEY (course_id) REFERENCES learning_courses(id) ON DELETE CASCADE;
ALTER TABLE public.learning_quiz_options ADD CONSTRAINT learning_quiz_options_question_id_fkey FOREIGN KEY (question_id) REFERENCES learning_quiz_questions(id) ON DELETE CASCADE;
ALTER TABLE public.learning_quiz_questions ADD CONSTRAINT learning_quiz_questions_module_id_fkey FOREIGN KEY (module_id) REFERENCES learning_modules(id) ON DELETE CASCADE;
ALTER TABLE public.library_folders ADD CONSTRAINT library_folders_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.library_folders ADD CONSTRAINT library_folders_parent_folder_id_fkey FOREIGN KEY (parent_folder_id) REFERENCES library_folders(id) ON DELETE CASCADE;
ALTER TABLE public.library_folders ADD CONSTRAINT library_folders_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.login_history ADD CONSTRAINT login_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.login_history ADD CONSTRAINT login_history_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE public.message_threads ADD CONSTRAINT message_threads_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id);
ALTER TABLE public.message_threads ADD CONSTRAINT message_threads_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.messages ADD CONSTRAINT messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES message_threads(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD CONSTRAINT messages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.network_message_threads ADD CONSTRAINT network_message_threads_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.network_message_threads ADD CONSTRAINT network_message_threads_ero_workspace_id_fkey FOREIGN KEY (ero_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.network_message_threads ADD CONSTRAINT network_message_threads_workspace_a_id_fkey FOREIGN KEY (workspace_a_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.network_message_threads ADD CONSTRAINT network_message_threads_workspace_b_id_fkey FOREIGN KEY (workspace_b_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.network_messages ADD CONSTRAINT network_messages_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES auth.users(id);
ALTER TABLE public.network_messages ADD CONSTRAINT network_messages_sender_workspace_id_fkey FOREIGN KEY (sender_workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.network_messages ADD CONSTRAINT network_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES network_message_threads(id) ON DELETE CASCADE;
ALTER TABLE public.notes ADD CONSTRAINT client_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.notes ADD CONSTRAINT client_notes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.office_locations ADD CONSTRAINT office_locations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.organizer_fields ADD CONSTRAINT organizer_fields_organizer_template_id_fkey FOREIGN KEY (organizer_template_id) REFERENCES organizer_templates(id) ON DELETE CASCADE;
ALTER TABLE public.organizer_fields ADD CONSTRAINT organizer_fields_parent_field_id_fkey FOREIGN KEY (parent_field_id) REFERENCES organizer_fields(id) ON DELETE CASCADE;
ALTER TABLE public.organizer_information_request_items ADD CONSTRAINT organizer_information_request_items_organizer_field_id_fkey FOREIGN KEY (organizer_field_id) REFERENCES organizer_fields(id) ON DELETE CASCADE;
ALTER TABLE public.organizer_information_request_items ADD CONSTRAINT organizer_information_request_items_request_id_fkey FOREIGN KEY (request_id) REFERENCES organizer_information_requests(id) ON DELETE CASCADE;
ALTER TABLE public.organizer_information_request_items ADD CONSTRAINT organizer_information_request_items_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id);
ALTER TABLE public.organizer_information_requests ADD CONSTRAINT organizer_information_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.organizer_information_requests ADD CONSTRAINT organizer_information_requests_organizer_field_id_fkey FOREIGN KEY (organizer_field_id) REFERENCES organizer_fields(id);
ALTER TABLE public.organizer_information_requests ADD CONSTRAINT organizer_information_requests_organizer_response_id_fkey FOREIGN KEY (organizer_response_id) REFERENCES organizer_responses(id) ON DELETE CASCADE;
ALTER TABLE public.organizer_information_requests ADD CONSTRAINT organizer_information_requests_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id);
ALTER TABLE public.organizer_information_requests ADD CONSTRAINT organizer_information_requests_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.organizer_response_answers ADD CONSTRAINT organizer_response_answers_organizer_field_id_fkey FOREIGN KEY (organizer_field_id) REFERENCES organizer_fields(id) ON DELETE CASCADE;
ALTER TABLE public.organizer_response_answers ADD CONSTRAINT organizer_response_answers_organizer_response_id_fkey FOREIGN KEY (organizer_response_id) REFERENCES organizer_responses(id) ON DELETE CASCADE;
ALTER TABLE public.organizer_responses ADD CONSTRAINT organizer_responses_assigned_reviewer_id_fkey FOREIGN KEY (assigned_reviewer_id) REFERENCES auth.users(id);
ALTER TABLE public.organizer_responses ADD CONSTRAINT organizer_responses_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.organizer_responses ADD CONSTRAINT organizer_responses_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE CASCADE;
ALTER TABLE public.organizer_responses ADD CONSTRAINT organizer_responses_organizer_template_id_fkey FOREIGN KEY (organizer_template_id) REFERENCES organizer_templates(id);
ALTER TABLE public.organizer_responses ADD CONSTRAINT organizer_responses_resolved_service_id_fkey FOREIGN KEY (resolved_service_id) REFERENCES services(id) ON DELETE SET NULL;
ALTER TABLE public.organizer_responses ADD CONSTRAINT organizer_responses_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);
ALTER TABLE public.organizer_responses ADD CONSTRAINT organizer_responses_signature_request_id_fkey FOREIGN KEY (signature_request_id) REFERENCES signature_requests(id) ON DELETE SET NULL;
ALTER TABLE public.organizer_responses ADD CONSTRAINT organizer_responses_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.organizer_service_routes ADD CONSTRAINT organizer_service_routes_organizer_template_id_fkey FOREIGN KEY (organizer_template_id) REFERENCES organizer_templates(id) ON DELETE CASCADE;
ALTER TABLE public.organizer_service_routes ADD CONSTRAINT organizer_service_routes_routing_field_id_fkey FOREIGN KEY (routing_field_id) REFERENCES organizer_fields(id) ON DELETE CASCADE;
ALTER TABLE public.organizer_service_routes ADD CONSTRAINT organizer_service_routes_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;
ALTER TABLE public.organizer_service_routes ADD CONSTRAINT organizer_service_routes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.organizer_templates ADD CONSTRAINT organizer_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.organizer_templates ADD CONSTRAINT organizer_templates_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE SET NULL;
ALTER TABLE public.organizer_templates ADD CONSTRAINT organizer_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.payment_methods ADD CONSTRAINT payment_methods_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.payment_methods ADD CONSTRAINT payment_methods_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_paid_payment_id_fkey FOREIGN KEY (paid_payment_id) REFERENCES payments(id) ON DELETE SET NULL;
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD CONSTRAINT payments_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
ALTER TABLE public.payments ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id);
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id);
ALTER TABLE public.payments ADD CONSTRAINT payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES user_profiles(id);
ALTER TABLE public.payments ADD CONSTRAINT payments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.pending_engagement_letter_sends ADD CONSTRAINT pending_engagement_letter_sen_engagement_letter_template_i_fkey FOREIGN KEY (engagement_letter_template_id) REFERENCES engagement_letter_templates(id);
ALTER TABLE public.pending_engagement_letter_sends ADD CONSTRAINT pending_engagement_letter_sends_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.pending_engagement_letter_sends ADD CONSTRAINT pending_engagement_letter_sends_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE CASCADE;
ALTER TABLE public.pending_engagement_letter_sends ADD CONSTRAINT pending_engagement_letter_sends_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.pending_portal_invites ADD CONSTRAINT pending_portal_invites_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.pending_portal_invites ADD CONSTRAINT pending_portal_invites_client_portal_user_id_fkey FOREIGN KEY (client_portal_user_id) REFERENCES client_portal_users(id) ON DELETE CASCADE;
ALTER TABLE public.pending_portal_invites ADD CONSTRAINT pending_portal_invites_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.pipeline_runs ADD CONSTRAINT pipeline_runs_current_stage_fkey FOREIGN KEY (current_stage_id) REFERENCES pipeline_stages(id) ON DELETE SET NULL;
ALTER TABLE public.pipeline_runs ADD CONSTRAINT pipeline_runs_process_id_fkey FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE;
ALTER TABLE public.pipeline_runs ADD CONSTRAINT pipeline_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.pipeline_stages ADD CONSTRAINT pipeline_stages_assigned_staff_id_fkey FOREIGN KEY (assigned_staff_id) REFERENCES user_profiles(id);
ALTER TABLE public.pipeline_stages ADD CONSTRAINT pipeline_stages_pipeline_run_id_fkey FOREIGN KEY (pipeline_run_id) REFERENCES pipeline_runs(id) ON DELETE CASCADE;
ALTER TABLE public.pipeline_stages ADD CONSTRAINT pipeline_stages_process_stage_id_fkey FOREIGN KEY (process_stage_id) REFERENCES process_stages(id) ON DELETE CASCADE;
ALTER TABLE public.pipeline_stages ADD CONSTRAINT pipeline_stages_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES user_profiles(id);
ALTER TABLE public.pipeline_stages ADD CONSTRAINT pipeline_stages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.platform_system_credentials ADD CONSTRAINT platform_system_credentials_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.pricing_rules ADD CONSTRAINT pricing_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.pricing_rules ADD CONSTRAINT pricing_rules_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.process_stages ADD CONSTRAINT process_stages_process_id_fkey FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE;
ALTER TABLE public.process_stages ADD CONSTRAINT process_stages_reviewer_role_id_fkey FOREIGN KEY (reviewer_role_id) REFERENCES roles(id) ON DELETE SET NULL;
ALTER TABLE public.process_tasks ADD CONSTRAINT process_tasks_assignee_role_id_fkey FOREIGN KEY (assignee_role_id) REFERENCES roles(id) ON DELETE SET NULL;
ALTER TABLE public.process_tasks ADD CONSTRAINT process_tasks_process_stage_id_fkey FOREIGN KEY (process_stage_id) REFERENCES process_stages(id) ON DELETE CASCADE;
ALTER TABLE public.processes ADD CONSTRAINT processes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.processes ADD CONSTRAINT processes_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE SET NULL;
ALTER TABLE public.processes ADD CONSTRAINT processes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
ALTER TABLE public.quotes ADD CONSTRAINT quotes_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id);
ALTER TABLE public.quotes ADD CONSTRAINT quotes_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES engagements(id);
ALTER TABLE public.quotes ADD CONSTRAINT quotes_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE public.quotes ADD CONSTRAINT quotes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.recurring_billing ADD CONSTRAINT recurring_billing_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.recurring_billing ADD CONSTRAINT recurring_billing_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id);
ALTER TABLE public.recurring_billing ADD CONSTRAINT recurring_billing_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES engagements(id);
ALTER TABLE public.recurring_billing ADD CONSTRAINT recurring_billing_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id);
ALTER TABLE public.recurring_billing ADD CONSTRAINT recurring_billing_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.role_permission_overrides ADD CONSTRAINT role_permission_overrides_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE;
ALTER TABLE public.role_permission_overrides ADD CONSTRAINT role_permission_overrides_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
ALTER TABLE public.role_permission_overrides ADD CONSTRAINT role_permission_overrides_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE;
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
ALTER TABLE public.roles ADD CONSTRAINT roles_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.service_categories ADD CONSTRAINT service_categories_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.services ADD CONSTRAINT services_billing_rule_id_fkey FOREIGN KEY (billing_rule_id) REFERENCES billing_rules(id) ON DELETE SET NULL;
ALTER TABLE public.services ADD CONSTRAINT services_cloned_from_service_id_fkey FOREIGN KEY (cloned_from_service_id) REFERENCES services(id) ON DELETE SET NULL;
ALTER TABLE public.services ADD CONSTRAINT services_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.services ADD CONSTRAINT services_document_folder_template_id_fkey FOREIGN KEY (document_folder_template_id) REFERENCES document_folder_templates(id);
ALTER TABLE public.services ADD CONSTRAINT services_document_request_template_id_fkey FOREIGN KEY (document_request_template_id) REFERENCES document_request_templates(id) ON DELETE SET NULL;
ALTER TABLE public.services ADD CONSTRAINT services_engagement_letter_template_id_fkey FOREIGN KEY (engagement_letter_template_id) REFERENCES engagement_letter_templates(id);
ALTER TABLE public.services ADD CONSTRAINT services_organizer_template_id_fkey FOREIGN KEY (organizer_template_id) REFERENCES organizer_templates(id) ON DELETE SET NULL;
ALTER TABLE public.services ADD CONSTRAINT services_pricing_rule_id_fkey FOREIGN KEY (pricing_rule_id) REFERENCES pricing_rules(id) ON DELETE SET NULL;
ALTER TABLE public.services ADD CONSTRAINT services_process_id_fkey FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE SET NULL;
ALTER TABLE public.services ADD CONSTRAINT services_service_category_id_fkey FOREIGN KEY (service_category_id) REFERENCES service_categories(id) ON DELETE SET NULL;
ALTER TABLE public.services ADD CONSTRAINT services_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.signature_request_signers ADD CONSTRAINT signature_request_signers_attested_by_fkey FOREIGN KEY (attested_by) REFERENCES user_profiles(id);
ALTER TABLE public.signature_request_signers ADD CONSTRAINT signature_request_signers_signature_request_id_fkey FOREIGN KEY (signature_request_id) REFERENCES signature_requests(id) ON DELETE CASCADE;
ALTER TABLE public.signature_requests ADD CONSTRAINT signature_requests_attachment_id_fkey FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE SET NULL;
ALTER TABLE public.signature_requests ADD CONSTRAINT signature_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id);
ALTER TABLE public.signature_requests ADD CONSTRAINT signature_requests_engagement_letter_template_id_fkey FOREIGN KEY (engagement_letter_template_id) REFERENCES engagement_letter_templates(id) ON DELETE SET NULL;
ALTER TABLE public.signature_requests ADD CONSTRAINT signature_requests_organizer_template_id_fkey FOREIGN KEY (organizer_template_id) REFERENCES organizer_templates(id) ON DELETE SET NULL;
ALTER TABLE public.signature_requests ADD CONSTRAINT signature_requests_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.site_funnels ADD CONSTRAINT site_funnels_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.site_funnels ADD CONSTRAINT site_funnels_website_id_fkey FOREIGN KEY (website_id) REFERENCES site_websites(id) ON DELETE CASCADE;
ALTER TABLE public.site_funnels ADD CONSTRAINT site_funnels_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.site_page_sections ADD CONSTRAINT site_page_sections_page_id_fkey FOREIGN KEY (page_id) REFERENCES site_pages(id) ON DELETE CASCADE;
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_funnel_id_fkey FOREIGN KEY (funnel_id) REFERENCES site_funnels(id) ON DELETE SET NULL;
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_website_id_fkey FOREIGN KEY (website_id) REFERENCES site_websites(id) ON DELETE CASCADE;
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.site_websites ADD CONSTRAINT site_websites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.site_websites ADD CONSTRAINT site_websites_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE SET NULL;
ALTER TABLE public.site_websites ADD CONSTRAINT site_websites_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.sms_log ADD CONSTRAINT sms_log_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id);
ALTER TABLE public.sms_log ADD CONSTRAINT sms_log_notification_queue_id_fkey FOREIGN KEY (notification_queue_id) REFERENCES notification_queue(id) ON DELETE SET NULL;
ALTER TABLE public.sms_log ADD CONSTRAINT sms_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.sms_templates ADD CONSTRAINT sms_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.sms_templates ADD CONSTRAINT sms_templates_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE SET NULL;
ALTER TABLE public.sms_templates ADD CONSTRAINT sms_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.system_failure_log ADD CONSTRAINT system_failure_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.task_dependencies ADD CONSTRAINT task_dependencies_depends_on_task_id_fkey FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE public.task_dependencies ADD CONSTRAINT task_dependencies_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
ALTER TABLE public.task_dependencies ADD CONSTRAINT task_dependencies_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_staff_id_fkey FOREIGN KEY (assigned_staff_id) REFERENCES user_profiles(id);
ALTER TABLE public.tasks ADD CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.trusted_devices ADD CONSTRAINT trusted_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_calendar_connections ADD CONSTRAINT user_calendar_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_default_workspace_id_fkey FOREIGN KEY (default_workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_widget_preferences ADD CONSTRAINT user_widget_preferences_dashboard_widget_id_fkey FOREIGN KEY (dashboard_widget_id) REFERENCES dashboard_widgets(id) ON DELETE CASCADE;
ALTER TABLE public.user_widget_preferences ADD CONSTRAINT user_widget_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_zoom_connections ADD CONSTRAINT user_zoom_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE public.workspace_billing_charge_attempts ADD CONSTRAINT workspace_billing_charge_attempts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_email_domains ADD CONSTRAINT workspace_email_domains_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_feature_flags ADD CONSTRAINT workspace_feature_flags_feature_flag_id_fkey FOREIGN KEY (feature_flag_id) REFERENCES feature_flags(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_feature_flags ADD CONSTRAINT workspace_feature_flags_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.workspace_feature_flags ADD CONSTRAINT workspace_feature_flags_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_ghl_connections ADD CONSTRAINT workspace_ghl_connections_connected_by_fkey FOREIGN KEY (connected_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.workspace_ghl_connections ADD CONSTRAINT workspace_ghl_connections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_invitations ADD CONSTRAINT workspace_invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES user_profiles(id);
ALTER TABLE public.workspace_invitations ADD CONSTRAINT workspace_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES user_profiles(id);
ALTER TABLE public.workspace_invitations ADD CONSTRAINT workspace_invitations_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id);
ALTER TABLE public.workspace_invitations ADD CONSTRAINT workspace_invitations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_jotform_connections ADD CONSTRAINT workspace_jotform_connections_connected_by_fkey FOREIGN KEY (connected_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.workspace_jotform_connections ADD CONSTRAINT workspace_jotform_connections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_retention_policies ADD CONSTRAINT workspace_retention_policies_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.workspace_retention_policies ADD CONSTRAINT workspace_retention_policies_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_security_policies ADD CONSTRAINT workspace_security_policies_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.workspace_security_policies ADD CONSTRAINT workspace_security_policies_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_subscription_invoices ADD CONSTRAINT workspace_subscription_invoices_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_subscriptions ADD CONSTRAINT workspace_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES platform_subscription_plans(id);
ALTER TABLE public.workspace_subscriptions ADD CONSTRAINT workspace_subscriptions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_tags ADD CONSTRAINT workspace_tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_profiles(id);
ALTER TABLE public.workspace_tags ADD CONSTRAINT workspace_tags_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_usage_meters ADD CONSTRAINT workspace_usage_meters_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_users ADD CONSTRAINT workspace_users_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.workspace_users ADD CONSTRAINT workspace_users_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT;
ALTER TABLE public.workspace_users ADD CONSTRAINT workspace_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_users ADD CONSTRAINT workspace_users_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_default_compliance_officer_id_fkey FOREIGN KEY (default_compliance_officer_id) REFERENCES user_profiles(id);
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_default_relationship_manager_id_fkey FOREIGN KEY (default_relationship_manager_id) REFERENCES user_profiles(id);
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_default_reviewer_id_fkey FOREIGN KEY (default_reviewer_id) REFERENCES user_profiles(id);
ALTER TABLE public.ai_agent_evidence ADD CONSTRAINT ai_agent_evidence_evidence_type_check CHECK ((evidence_type = ANY (ARRAY['screenshot'::text, 'browser_console'::text, 'network'::text, 'http_response'::text, 'db_error'::text, 'workflow_execution'::text, 'timing'::text, 'test_step'::text, 'synthetic_record'::text, 'log'::text])));
ALTER TABLE public.ai_agent_finding_correlations ADD CONSTRAINT ai_agent_finding_correlations_check CHECK ((finding_id_a <> finding_id_b));
ALTER TABLE public.ai_agent_finding_correlations ADD CONSTRAINT ai_agent_finding_correlations_confidence_check CHECK ((confidence = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
ALTER TABLE public.ai_agent_findings ADD CONSTRAINT ai_agent_findings_severity_check CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])));
ALTER TABLE public.ai_agent_findings ADD CONSTRAINT ai_agent_findings_status_check CHECK ((status = ANY (ARRAY['open'::text, 'investigating'::text, 'fixed'::text, 'retest_required'::text, 'resolved'::text, 'reopened'::text])));
ALTER TABLE public.ai_agent_run_events ADD CONSTRAINT ai_agent_run_events_level_check CHECK ((level = ANY (ARRAY['info'::text, 'success'::text, 'warning'::text, 'error'::text])));
ALTER TABLE public.ai_agent_runs ADD CONSTRAINT ai_agent_runs_run_type_check CHECK ((run_type = ANY (ARRAY['full'::text, 'module'::text, 'regression'::text, 'custom'::text])));
ALTER TABLE public.ai_agent_runs ADD CONSTRAINT ai_agent_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE public.ai_agents ADD CONSTRAINT ai_agents_agent_key_check CHECK ((agent_key = ANY (ARRAY['qa'::text, 'security'::text, 'workflow'::text, 'performance'::text])));
ALTER TABLE public.appointments ADD CONSTRAINT appointments_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'confirmed'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text])));
ALTER TABLE public.attachments ADD CONSTRAINT attachments_entity_type_check CHECK ((entity_type = ANY (ARRAY['client'::text, 'engagement'::text, 'workflow'::text, 'task'::text, 'invoice'::text, 'document'::text, 'blueprint'::text, 'message'::text, 'note'::text])));
ALTER TABLE public.attachments ADD CONSTRAINT attachments_visibility_check CHECK ((visibility = ANY (ARRAY['internal'::text, 'client_visible'::text])));
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])));
ALTER TABLE public.automation_pending_steps ADD CONSTRAINT automation_pending_steps_status_check CHECK ((status = ANY (ARRAY['pending_delay'::text, 'pending_approval'::text, 'completed'::text, 'failed'::text, 'rejected'::text])));
ALTER TABLE public.automation_runs ADD CONSTRAINT automation_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE public.automation_steps ADD CONSTRAINT automation_steps_action_type_check CHECK ((action_type = ANY (ARRAY['send_email'::text, 'send_sms'::text, 'send_notification'::text, 'create_task'::text, 'assign_user'::text, 'change_stage'::text, 'request_approval'::text, 'delay'::text, 'webhook'::text, 'escalate'::text, 'send_organizer_template'::text, 'create_engagement'::text, 'send_engagement_letter'::text, 'send_document_request'::text, 'move_pipeline_stage'::text, 'mark_lead_lost'::text, 'convert_lead_to_client'::text, 'update_client'::text, 'create_client'::text, 'create_quote'::text, 'send_quote'::text, 'add_tag'::text, 'remove_tag'::text, 'add_note'::text, 'send_portal_message'::text, 'start_workflow'::text, 'end_workflow'::text, 'invite_to_portal'::text, 'condition'::text, 'create_appointment'::text, 'add_dnd'::text, 'remove_dnd'::text, 'move_lead_to_service_pipeline'::text, 'business_hours_delay'::text])));
ALTER TABLE public.automation_steps ADD CONSTRAINT automation_steps_delay_minutes_check CHECK ((delay_minutes >= 0));
ALTER TABLE public.automation_webhook_deliveries ADD CONSTRAINT automation_webhook_deliveries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])));
ALTER TABLE public.automations ADD CONSTRAINT automations_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public.billing_rules ADD CONSTRAINT billing_rules_deposit_percent_check CHECK (((deposit_percent IS NULL) OR ((deposit_percent >= (0)::numeric) AND (deposit_percent <= (100)::numeric))));
ALTER TABLE public.billing_rules ADD CONSTRAINT billing_rules_installment_count_check CHECK (((installment_count IS NULL) OR (installment_count > 0)));
ALTER TABLE public.billing_rules ADD CONSTRAINT billing_rules_invoice_timing_check CHECK ((invoice_timing = ANY (ARRAY['before_work'::text, 'after_work'::text])));
ALTER TABLE public.billing_rules ADD CONSTRAINT billing_rules_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public.branding ADD CONSTRAINT branding_accent_color_check CHECK ((accent_color ~ '^#[0-9a-fA-F]{6}$'::text));
ALTER TABLE public.branding ADD CONSTRAINT branding_portal_subdomain_check CHECK ((portal_subdomain ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text));
ALTER TABLE public.branding ADD CONSTRAINT branding_primary_color_check CHECK ((primary_color ~ '^#[0-9a-fA-F]{6}$'::text));
ALTER TABLE public.branding ADD CONSTRAINT branding_secondary_color_check CHECK ((secondary_color ~ '^#[0-9a-fA-F]{6}$'::text));
ALTER TABLE public.branding ADD CONSTRAINT branding_sidebar_text_color_check CHECK (((sidebar_text_color IS NULL) OR (sidebar_text_color ~ '^#[0-9a-fA-F]{6}$'::text)));
ALTER TABLE public.branding ADD CONSTRAINT branding_theme_mode_check CHECK ((theme_mode = ANY (ARRAY['light'::text, 'dark'::text])));
ALTER TABLE public.calendar_sync_queue ADD CONSTRAINT calendar_sync_queue_action_check CHECK ((action = ANY (ARRAY['upsert'::text, 'delete'::text])));
ALTER TABLE public.calendar_sync_queue ADD CONSTRAINT calendar_sync_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])));
ALTER TABLE public.client_addresses ADD CONSTRAINT client_addresses_address_type_check CHECK ((address_type = ANY (ARRAY['mailing'::text, 'business'::text, 'seasonal'::text, 'other'::text])));
ALTER TABLE public.client_contacts ADD CONSTRAINT client_contacts_preferred_contact_method_check CHECK ((preferred_contact_method = ANY (ARRAY['email'::text, 'phone'::text, 'text'::text, 'mail'::text])));
ALTER TABLE public.client_emails ADD CONSTRAINT client_emails_email_type_check CHECK ((email_type = ANY (ARRAY['personal'::text, 'business'::text, 'accounting'::text, 'other'::text])));
ALTER TABLE public.client_pending_changes ADD CONSTRAINT client_pending_changes_source_check CHECK ((source = ANY (ARRAY['basic_info'::text, 'organizer'::text])));
ALTER TABLE public.client_pending_changes ADD CONSTRAINT client_pending_changes_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public.client_pending_changes ADD CONSTRAINT client_pending_changes_target_table_check CHECK ((target_table = ANY (ARRAY['clients'::text, 'client_addresses'::text])));
ALTER TABLE public.client_phones ADD CONSTRAINT client_phones_phone_type_check CHECK ((phone_type = ANY (ARRAY['mobile'::text, 'office'::text, 'home'::text, 'fax'::text, 'other'::text])));
ALTER TABLE public.client_portal_users ADD CONSTRAINT client_portal_users_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'revoked'::text, 'suspended'::text])));
ALTER TABLE public.client_relationships ADD CONSTRAINT client_relationships_check CHECK (((related_client_id IS NOT NULL) OR (related_name IS NOT NULL)));
ALTER TABLE public.client_relationships ADD CONSTRAINT client_relationships_relationship_type_check CHECK ((relationship_type = ANY (ARRAY['spouse'::text, 'dependent'::text, 'parent'::text, 'child'::text, 'business'::text, 'trust'::text, 'estate'::text, 'partner'::text, 'owner'::text, 'officer'::text, 'attorney'::text, 'other'::text])));
ALTER TABLE public.client_service_interests ADD CONSTRAINT client_service_interests_source_check CHECK ((source = ANY (ARRAY['public_organizer_signup'::text, 'manual'::text, 'portal_basic_info'::text, 'public_site_page'::text, 'portal_add_service'::text])));
ALTER TABLE public.clients ADD CONSTRAINT clients_check CHECK (((client_type = 'individual'::text) OR (business_name IS NOT NULL)));
ALTER TABLE public.clients ADD CONSTRAINT clients_check1 CHECK (((client_type <> 'individual'::text) OR (first_name IS NOT NULL) OR (last_name IS NOT NULL)));
ALTER TABLE public.clients ADD CONSTRAINT clients_client_type_check CHECK ((client_type = ANY (ARRAY['individual'::text, 'business'::text, 'trust'::text, 'estate'::text, 'organization'::text])));
ALTER TABLE public.config_object_shares ADD CONSTRAINT config_object_shares_check CHECK ((shared_by_workspace_id <> shared_with_workspace_id));
ALTER TABLE public.config_object_shares ADD CONSTRAINT config_object_shares_object_type_check CHECK (is_valid_config_table(object_type));
ALTER TABLE public.config_object_shares ADD CONSTRAINT config_object_shares_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'archived'::text])));
ALTER TABLE public.config_object_versions ADD CONSTRAINT config_object_versions_object_type_check CHECK (is_valid_config_table(object_type));
ALTER TABLE public.consent_records ADD CONSTRAINT consent_records_check CHECK (((user_id IS NOT NULL) OR (client_id IS NOT NULL)));
ALTER TABLE public.consent_records ADD CONSTRAINT consent_records_consent_type_check CHECK ((consent_type = ANY (ARRAY['terms_of_service'::text, 'privacy_policy'::text, 'e_signature_consent'::text, 'portal_invitation'::text, 'communication_preferences'::text, 'platform_terms'::text])));
ALTER TABLE public.dashboard_widgets ADD CONSTRAINT dashboard_widgets_widget_type_check CHECK ((widget_type = ANY (ARRAY['todays_work'::text, 'missing_documents'::text, 'review_queue'::text, 'returns_due'::text, 'signatures_pending'::text, 'messages'::text, 'revenue'::text, 'collections'::text, 'kpis'::text, 'staff_workload'::text, 'client_health'::text, 'compliance'::text, 'quick_actions'::text, 'calendar'::text, 'recent_activity'::text, 'active_customers'::text, 'upcoming_renewals'::text, 'payment_failures'::text, 'top_services'::text, 'engagement_pipeline'::text, 'stage_breakdown'::text, 'deadline_risk'::text])));
ALTER TABLE public.dashboards ADD CONSTRAINT dashboards_role_slug_check CHECK ((role_slug = ANY (ARRAY['owner'::text, 'admin'::text, 'ero'::text, 'ptin_preparer'::text, 'staff'::text, 'client'::text])));
ALTER TABLE public.dashboards ADD CONSTRAINT dashboards_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public.document_folder_templates ADD CONSTRAINT document_folder_templates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public.document_request_item_statuses ADD CONSTRAINT document_request_item_statuses_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'uploaded'::text, 'waived'::text])));
ALTER TABLE public.document_request_templates ADD CONSTRAINT document_request_templates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public.document_requests ADD CONSTRAINT document_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE public.draft_saves ADD CONSTRAINT draft_saves_draft_type_check CHECK ((draft_type = ANY (ARRAY['client'::text, 'engagement'::text, 'workflow'::text, 'blueprint'::text, 'organizer'::text, 'document_request'::text, 'engagement_letter'::text, 'automation'::text, 'settings'::text, 'message'::text])));
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public.engagement_assignment_history ADD CONSTRAINT engagement_assignment_history_assignment_role_check CHECK ((assignment_role = ANY (ARRAY['assigned_staff'::text, 'reviewer'::text, 'compliance_officer'::text])));
ALTER TABLE public.engagement_letter_public_signatures ADD CONSTRAINT engagement_letter_public_signatures_signature_type_check CHECK ((signature_type = ANY (ARRAY['typed'::text, 'drawn'::text])));
ALTER TABLE public.engagement_letter_templates ADD CONSTRAINT engagement_letter_templates_pdf_field_mode_check CHECK (((pdf_field_mode IS NULL) OR (pdf_field_mode = ANY (ARRAY['acroform'::text, 'overlay'::text]))));
ALTER TABLE public.engagement_letter_templates ADD CONSTRAINT engagement_letter_templates_signup_requires_public_check CHECK (((NOT requires_portal_signup) OR is_public));
ALTER TABLE public.engagement_letter_templates ADD CONSTRAINT engagement_letter_templates_source_type_check CHECK ((source_type = ANY (ARRAY['richtext'::text, 'pdf'::text])));
ALTER TABLE public.engagement_letter_templates ADD CONSTRAINT engagement_letter_templates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public.engagement_review_actions ADD CONSTRAINT engagement_review_actions_action_check CHECK ((action = ANY (ARRAY['approve'::text, 'reject'::text, 'request_corrections'::text, 'comment'::text, 'withdraw'::text])));
ALTER TABLE public.engagement_shares ADD CONSTRAINT case_shares_check CHECK ((workspace_id <> shared_with_workspace_id));
ALTER TABLE public.engagement_shares ADD CONSTRAINT engagement_shares_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text, 'corrections_requested'::text, 'withdrawn'::text])));
ALTER TABLE public.engagement_tax_details ADD CONSTRAINT engagement_tax_details_return_status_check CHECK ((return_status = ANY (ARRAY['not_filed'::text, 'ready_to_file'::text, 'filed'::text])));
ALTER TABLE public.engagements ADD CONSTRAINT engagements_case_type_check CHECK ((case_type = ANY (ARRAY['tax_return'::text, 'bookkeeping'::text, 'payroll'::text, 'business_service'::text, 'other'::text])));
ALTER TABLE public.engagements ADD CONSTRAINT engagements_status_check CHECK ((status = ANY (ARRAY['New'::text, 'Waiting On Client'::text, 'Waiting On Staff'::text, 'In Progress'::text, 'Waiting On Review'::text, 'Corrections Requested'::text, 'Approved'::text, 'Waiting On Signature'::text, 'Waiting On Payment'::text, 'Ready To Release'::text, 'Completed'::text, 'Archived'::text])));
ALTER TABLE public.firm_connections ADD CONSTRAINT firm_connections_billing_responsibility_check CHECK ((billing_responsibility = ANY (ARRAY['ptin_self'::text, 'ero'::text])));
ALTER TABLE public.firm_connections ADD CONSTRAINT firm_connections_check CHECK ((parent_workspace_id <> child_workspace_id));
ALTER TABLE public.firm_connections ADD CONSTRAINT firm_connections_child_or_invite_check CHECK (((child_workspace_id IS NOT NULL) OR ((invite_token IS NOT NULL) AND (status = 'pending'::text))));
ALTER TABLE public.firm_connections ADD CONSTRAINT firm_connections_relationship_type_check CHECK ((relationship_type = ANY (ARRAY['service_bureau_ero'::text, 'ero_ptin'::text, 'service_bureau_ptin'::text])));
ALTER TABLE public.firm_connections ADD CONSTRAINT firm_connections_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'revoked'::text])));
ALTER TABLE public.internal_message_threads ADD CONSTRAINT internal_message_threads_distinct_users CHECK ((user_a_id <> user_b_id));
ALTER TABLE public.invoices ADD CONSTRAINT invoices_payment_method_check CHECK ((payment_method = ANY (ARRAY['stripe'::text, 'check'::text, 'ach'::text, 'wire'::text, 'cash'::text, 'other'::text])));
ALTER TABLE public.irs_notices ADD CONSTRAINT irs_notices_entity_type_check CHECK ((entity_type = ANY (ARRAY['client'::text, 'engagement'::text])));
ALTER TABLE public.irs_notices ADD CONSTRAINT irs_notices_status_check CHECK ((status = ANY (ARRAY['open'::text, 'responded'::text, 'resolved'::text, 'escalated'::text])));
ALTER TABLE public.learning_courses ADD CONSTRAINT learning_courses_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])));
ALTER TABLE public.learning_modules ADD CONSTRAINT learning_modules_module_type_check CHECK ((module_type = ANY (ARRAY['lesson'::text, 'quiz'::text])));
ALTER TABLE public.library_folders ADD CONSTRAINT library_folders_item_type_check CHECK ((item_type = ANY (ARRAY['pipeline'::text, 'workflow'::text, 'website'::text, 'email_sms_template'::text, 'form_template'::text])));
ALTER TABLE public.network_message_threads ADD CONSTRAINT network_message_threads_distinct_workspaces CHECK ((workspace_a_id <> workspace_b_id));
ALTER TABLE public.notes ADD CONSTRAINT client_notes_entity_type_check CHECK ((entity_type = ANY (ARRAY['client'::text, 'engagement'::text, 'task'::text, 'document'::text, 'invoice'::text, 'blueprint'::text, 'workflow'::text, 'organizer_response'::text])));
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_channel_check CHECK ((channel = ANY (ARRAY['In-App'::text, 'Email'::text, 'SMS'::text, 'Portal'::text, 'Push'::text])));
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE public.organizer_fields ADD CONSTRAINT organizer_fields_client_profile_field_check CHECK (((client_profile_field IS NULL) OR (client_profile_field = ANY (ARRAY['full_name'::text, 'first_name'::text, 'last_name'::text, 'business_name'::text, 'primary_email'::text, 'primary_phone'::text, 'mailing_address'::text, 'date_of_birth'::text, 'ssn'::text]))));
ALTER TABLE public.organizer_fields ADD CONSTRAINT organizer_fields_field_type_check CHECK ((field_type = ANY (ARRAY['short_text'::text, 'paragraph'::text, 'name'::text, 'email'::text, 'phone'::text, 'website'::text, 'number'::text, 'currency'::text, 'date'::text, 'dropdown'::text, 'checkbox'::text, 'yes_no'::text, 'radio_button'::text, 'multiple_choice'::text, 'address'::text, 'ssn'::text, 'ein'::text, 'file_upload'::text, 'signature'::text, 'repeating_section'::text, 'page_break'::text, 'section'::text, 'rich_text'::text])));
ALTER TABLE public.organizer_fields ADD CONSTRAINT organizer_fields_layout_width_check CHECK ((layout_width = ANY (ARRAY['full'::text, 'half'::text])));
ALTER TABLE public.organizer_fields ADD CONSTRAINT organizer_fields_relationship_role_check CHECK (((relationship_role IS NULL) OR (relationship_role = ANY (ARRAY['spouse_full_name'::text, 'spouse_dob'::text, 'spouse_ssn'::text, 'dependent_full_name'::text, 'dependent_dob'::text, 'dependent_ssn'::text, 'dependent_relationship_type'::text, 'dependent_relationship_other'::text]))));
ALTER TABLE public.organizer_information_request_items ADD CONSTRAINT organizer_information_request_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'client_responded'::text, 'approved'::text, 'rejected'::text, 'resolved'::text])));
ALTER TABLE public.organizer_information_requests ADD CONSTRAINT organizer_information_requests_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'viewed'::text, 'responded'::text, 'resolved'::text])));
ALTER TABLE public.organizer_responses ADD CONSTRAINT organizer_responses_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'submitted'::text, 'reviewed'::text])));
ALTER TABLE public.organizer_templates ADD CONSTRAINT organizer_templates_signup_requires_public_check CHECK (((NOT requires_portal_signup) OR is_public));
ALTER TABLE public.organizer_templates ADD CONSTRAINT organizer_templates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'overdue'::text, 'cancelled'::text])));
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_method_check CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY['stripe'::text, 'check'::text, 'cash'::text, 'bank_transfer'::text, 'other'::text]))));
ALTER TABLE public.pending_engagement_letter_sends ADD CONSTRAINT pending_engagement_letter_sends_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])));
ALTER TABLE public.pending_portal_invites ADD CONSTRAINT pending_portal_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])));
ALTER TABLE public.pipeline_runs ADD CONSTRAINT pipeline_runs_entity_type_check CHECK ((entity_type = ANY (ARRAY['client'::text, 'engagement'::text])));
ALTER TABLE public.pipeline_stages ADD CONSTRAINT pipeline_stages_entity_type_check CHECK ((entity_type = ANY (ARRAY['client'::text, 'engagement'::text])));
ALTER TABLE public.pricing_rules ADD CONSTRAINT pricing_rules_check CHECK (((minimum_amount IS NULL) OR (maximum_amount IS NULL) OR (minimum_amount <= maximum_amount)));
ALTER TABLE public.pricing_rules ADD CONSTRAINT pricing_rules_pricing_method_check CHECK ((pricing_method = ANY (ARRAY['flat_fee'::text, 'hourly'::text, 'custom_quote'::text, 'tax_form_based'::text, 'complexity_based'::text])));
ALTER TABLE public.pricing_rules ADD CONSTRAINT pricing_rules_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public.process_stages ADD CONSTRAINT process_stages_completion_rule_check CHECK ((completion_rule = ANY (ARRAY['all_tasks_complete'::text, 'any_task_complete'::text, 'manual_only'::text])));
ALTER TABLE public.processes ADD CONSTRAINT processes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public.provider_status ADD CONSTRAINT provider_status_provider_check CHECK ((provider = ANY (ARRAY['email'::text, 'sms'::text, 'stripe'::text])));
ALTER TABLE public.provider_status ADD CONSTRAINT provider_status_status_check CHECK ((status = ANY (ARRAY['unknown'::text, 'healthy'::text, 'degraded'::text, 'down'::text])));
ALTER TABLE public.roles ADD CONSTRAINT roles_slug_check CHECK ((slug ~ '^[a-z0-9]+(_[a-z0-9]+)*$'::text));
ALTER TABLE public.services ADD CONSTRAINT services_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public.signature_request_signers ADD CONSTRAINT signature_request_signers_signature_type_check CHECK ((signature_type = ANY (ARRAY['drawn'::text, 'typed'::text])));
ALTER TABLE public.signature_request_signers ADD CONSTRAINT signature_request_signers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'signed'::text, 'declined'::text])));
ALTER TABLE public.signature_requests ADD CONSTRAINT signature_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'declined'::text, 'cancelled'::text])));
ALTER TABLE public.site_funnels ADD CONSTRAINT site_funnels_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public.site_page_sections ADD CONSTRAINT site_page_sections_section_type_check CHECK ((section_type = ANY (ARRAY['hero'::text, 'rich_text'::text, 'image'::text, 'text_image'::text, 'testimonial'::text, 'faq'::text, 'organizer_form'::text, 'cta_button'::text, 'spacer'::text, 'footer'::text, 'custom_html'::text])));
ALTER TABLE public.site_pages ADD CONSTRAINT site_pages_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public.site_websites ADD CONSTRAINT site_websites_custom_domain_format CHECK (((custom_domain IS NULL) OR (custom_domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'::text)));
ALTER TABLE public.site_websites ADD CONSTRAINT site_websites_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public.sms_templates ADD CONSTRAINT sms_templates_body_check CHECK ((char_length(body) <= 1600));
ALTER TABLE public.sms_templates ADD CONSTRAINT sms_templates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public.task_dependencies ADD CONSTRAINT task_dependencies_not_self CHECK ((task_id <> depends_on_task_id));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_engagement_or_client_chk CHECK (((engagement_id IS NOT NULL) OR (client_id IS NOT NULL)));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'blocked'::text])));
ALTER TABLE public.tasks ADD CONSTRAINT tasks_visibility_check CHECK ((visibility = ANY (ARRAY['internal'::text, 'client'::text])));
ALTER TABLE public.user_calendar_connections ADD CONSTRAINT user_calendar_connections_provider_check CHECK ((provider = ANY (ARRAY['google'::text, 'microsoft'::text])));
ALTER TABLE public.user_calendar_connections ADD CONSTRAINT user_calendar_connections_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'revoked'::text])));
ALTER TABLE public.user_zoom_connections ADD CONSTRAINT user_zoom_connections_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'revoked'::text])));
ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_provider_check CHECK ((provider = ANY (ARRAY['stripe'::text, 'resend'::text, 'twilio'::text])));
ALTER TABLE public.webhook_events ADD CONSTRAINT webhook_events_status_check CHECK ((status = ANY (ARRAY['received'::text, 'processed'::text, 'failed'::text])));
ALTER TABLE public.workspace_billing_charge_attempts ADD CONSTRAINT workspace_billing_charge_attempts_status_check CHECK ((status = ANY (ARRAY['succeeded'::text, 'failed'::text])));
ALTER TABLE public.workspace_email_domains ADD CONSTRAINT workspace_email_domains_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'failed'::text])));
ALTER TABLE public.workspace_invitations ADD CONSTRAINT workspace_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])));
ALTER TABLE public.workspace_subscriptions ADD CONSTRAINT workspace_subscriptions_stripe_status_check CHECK ((stripe_status = ANY (ARRAY['incomplete'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'unpaid'::text, 'canceled'::text])));
ALTER TABLE public.workspace_usage_meters ADD CONSTRAINT workspace_usage_meters_resource_type_check CHECK ((resource_type = ANY (ARRAY['email'::text, 'sms'::text, 'storage'::text])));
ALTER TABLE public.workspace_users ADD CONSTRAINT workspace_users_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'suspended'::text, 'removed'::text])));
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_client_assignment_mode_check CHECK ((client_assignment_mode = ANY (ARRAY['owner'::text, 'round_robin'::text])));
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_name_check CHECK ((length(btrim(name)) > 0));
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_slug_check CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text));
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'archived'::text])));
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_stripe_connect_status_check CHECK ((stripe_connect_status = ANY (ARRAY['not_connected'::text, 'pending'::text, 'restricted'::text, 'active'::text])));
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_suspension_reason_check CHECK (((suspension_reason IS NULL) OR (suspension_reason = ANY (ARRAY['billing_past_due'::text, 'subscription_canceled'::text]))));
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_workspace_type_check CHECK ((workspace_type = ANY (ARRAY['independent_ptin'::text, 'ero_office'::text, 'service_bureau'::text, 'multi_office_firm'::text, 'platform_admin'::text])));

-- =============================================================================
-- 6. INDEXES (non-constraint-backed only)
-- =============================================================================

CREATE INDEX activity_log_actor_idx ON public.activity_log USING btree (actor_id);
CREATE INDEX activity_log_entity_idx ON public.activity_log USING btree (entity_type, entity_id);
CREATE INDEX activity_log_workspace_created_idx ON public.activity_log USING btree (workspace_id, created_at DESC);
CREATE INDEX ai_agent_evidence_finding_id_idx ON public.ai_agent_evidence USING btree (finding_id);
CREATE INDEX ai_agent_evidence_run_id_idx ON public.ai_agent_evidence USING btree (run_id);
CREATE INDEX ai_agent_findings_agent_id_idx ON public.ai_agent_findings USING btree (agent_id, status);
CREATE INDEX ai_agent_findings_fingerprint_idx ON public.ai_agent_findings USING btree (fingerprint);
CREATE INDEX ai_agent_findings_run_id_idx ON public.ai_agent_findings USING btree (run_id);
CREATE INDEX ai_agent_run_events_run_id_idx ON public.ai_agent_run_events USING btree (run_id, seq);
CREATE INDEX ai_agent_runs_agent_id_idx ON public.ai_agent_runs USING btree (agent_id, started_at DESC);
CREATE INDEX ai_agent_runs_workspace_id_idx ON public.ai_agent_runs USING btree (workspace_id);
CREATE INDEX ai_agent_test_personas_workspace_id_idx ON public.ai_agent_test_personas USING btree (workspace_id);
CREATE INDEX appointment_external_events_appointment_id_idx ON public.appointment_external_events USING btree (appointment_id);
CREATE INDEX appointments_client_idx ON public.appointments USING btree (client_id);
CREATE INDEX appointments_engagement_idx ON public.appointments USING btree (engagement_id);
CREATE UNIQUE INDEX appointments_external_source_id_idx ON public.appointments USING btree (workspace_id, external_source, external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX appointments_staff_idx ON public.appointments USING btree (staff_id);
CREATE INDEX appointments_start_at_idx ON public.appointments USING btree (start_at);
CREATE INDEX appointments_workspace_idx ON public.appointments USING btree (workspace_id);
CREATE INDEX idx_appointments_created_by ON public.appointments USING btree (created_by);
CREATE INDEX client_documents_client_idx ON public.attachments USING btree (entity_id, created_at DESC);
CREATE INDEX client_documents_uploaded_by_idx ON public.attachments USING btree (uploaded_by);
CREATE INDEX client_documents_workspace_idx ON public.attachments USING btree (workspace_id);
CREATE INDEX idx_attachments_entity ON public.attachments USING btree (entity_type, entity_id);
CREATE INDEX idx_attachments_favorite ON public.attachments USING btree (workspace_id) WHERE is_favorite;
CREATE INDEX idx_attachments_folder ON public.attachments USING btree (folder_id);
CREATE INDEX idx_attachments_replaces ON public.attachments USING btree (replaces_attachment_id);
CREATE INDEX idx_attachments_search ON public.attachments USING gin (search_vector);
CREATE INDEX audit_log_actor_idx ON public.audit_log USING btree (actor_id);
CREATE INDEX audit_log_entity_idx ON public.audit_log USING btree (entity_type, entity_id);
CREATE INDEX audit_log_workspace_created_idx ON public.audit_log USING btree (workspace_id, created_at DESC);
CREATE INDEX automation_execution_logs_run_id_idx ON public.automation_execution_logs USING btree (((execution_data ->> 'run_id'::text)));
CREATE INDEX idx_automation_execution_logs_automation ON public.automation_execution_logs USING btree (automation_id);
CREATE INDEX idx_automation_execution_logs_engagement ON public.automation_execution_logs USING btree (engagement_id);
CREATE INDEX idx_automation_execution_logs_workspace ON public.automation_execution_logs USING btree (workspace_id);
CREATE INDEX idx_automation_logs_run ON public.automation_execution_logs USING btree (workflow_run_id);
CREATE INDEX automation_pending_steps_due_idx ON public.automation_pending_steps USING btree (status, scheduled_for) WHERE (status = 'pending_delay'::text);
CREATE INDEX automation_pending_steps_run_idx ON public.automation_pending_steps USING btree (run_id);
CREATE INDEX automation_pending_steps_workspace_idx ON public.automation_pending_steps USING btree (workspace_id);
CREATE INDEX idx_automation_pending_steps_approved_by ON public.automation_pending_steps USING btree (approved_by);
CREATE INDEX idx_automation_pending_steps_automation_step_id ON public.automation_pending_steps USING btree (automation_step_id);
CREATE INDEX automation_runs_automation_idx ON public.automation_runs USING btree (automation_id);
CREATE INDEX automation_runs_client_id_idx ON public.automation_runs USING btree (client_id);
CREATE INDEX automation_runs_engagement_idx ON public.automation_runs USING btree (engagement_id);
CREATE INDEX automation_runs_workspace_idx ON public.automation_runs USING btree (workspace_id);
CREATE INDEX automation_step_edges_automation_id_idx ON public.automation_step_edges USING btree (automation_id);
CREATE INDEX automation_step_edges_from_step_id_idx ON public.automation_step_edges USING btree (from_step_id);
CREATE INDEX automation_step_edges_to_step_id_idx ON public.automation_step_edges USING btree (to_step_id);
CREATE INDEX automation_steps_automation_idx ON public.automation_steps USING btree (automation_id, display_order);
CREATE INDEX idx_automation_steps_approver_role_id ON public.automation_steps USING btree (approver_role_id);
CREATE INDEX automation_webhook_deliveries_pending_idx ON public.automation_webhook_deliveries USING btree (next_attempt_at) WHERE (status = 'pending'::text);
CREATE INDEX automations_folder_idx ON public.automations USING btree (folder_id);
CREATE UNIQUE INDEX automations_system_slug_key ON public.automations USING btree (slug) WHERE (workspace_id IS NULL);
CREATE INDEX automations_trigger_type_idx ON public.automations USING btree (trigger_type) WHERE is_enabled;
CREATE UNIQUE INDEX automations_webhook_token_idx ON public.automations USING btree (webhook_token);
CREATE INDEX automations_workspace_idx ON public.automations USING btree (workspace_id);
CREATE INDEX idx_automations_created_by ON public.automations USING btree (created_by);
CREATE UNIQUE INDEX billing_rules_system_slug_key ON public.billing_rules USING btree (slug) WHERE (workspace_id IS NULL);
CREATE INDEX billing_rules_workspace_idx ON public.billing_rules USING btree (workspace_id);
CREATE INDEX idx_billing_rules_created_by ON public.billing_rules USING btree (created_by);
CREATE INDEX calendar_sync_queue_appointment_id_idx ON public.calendar_sync_queue USING btree (appointment_id);
CREATE INDEX calendar_sync_queue_pending_idx ON public.calendar_sync_queue USING btree (scheduled_at) WHERE (status = 'pending'::text);
CREATE INDEX idx_change_orders_approved_by ON public.change_orders USING btree (approved_by);
CREATE INDEX idx_change_orders_created_by ON public.change_orders USING btree (created_by);
CREATE INDEX idx_change_orders_engagement ON public.change_orders USING btree (engagement_id);
CREATE INDEX idx_change_orders_quote ON public.change_orders USING btree (quote_id);
CREATE INDEX idx_change_orders_workspace ON public.change_orders USING btree (workspace_id);
CREATE INDEX client_addresses_client_idx ON public.client_addresses USING btree (client_id, display_order);
CREATE UNIQUE INDEX client_addresses_one_primary_idx ON public.client_addresses USING btree (client_id) WHERE is_primary;
CREATE INDEX client_addresses_workspace_idx ON public.client_addresses USING btree (workspace_id);
CREATE INDEX client_contacts_client_idx ON public.client_contacts USING btree (client_id, display_order);
CREATE UNIQUE INDEX client_contacts_one_primary_idx ON public.client_contacts USING btree (client_id) WHERE is_primary;
CREATE INDEX client_contacts_workspace_idx ON public.client_contacts USING btree (workspace_id);
CREATE INDEX client_emails_client_idx ON public.client_emails USING btree (client_id, display_order);
CREATE UNIQUE INDEX client_emails_one_primary_idx ON public.client_emails USING btree (client_id) WHERE is_primary;
CREATE INDEX client_emails_workspace_idx ON public.client_emails USING btree (workspace_id);
CREATE INDEX idx_client_ledger_client ON public.client_ledger USING btree (client_id);
CREATE INDEX idx_client_ledger_workspace ON public.client_ledger USING btree (workspace_id);
CREATE UNIQUE INDEX client_pending_changes_pending_unique ON public.client_pending_changes USING btree (client_id, target_table, target_column, COALESCE(client_address_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (status = 'pending'::text);
CREATE INDEX client_pending_changes_workspace_status_idx ON public.client_pending_changes USING btree (workspace_id, status);
CREATE INDEX client_phones_client_idx ON public.client_phones USING btree (client_id, display_order);
CREATE UNIQUE INDEX client_phones_one_primary_idx ON public.client_phones USING btree (client_id) WHERE is_primary;
CREATE INDEX client_phones_workspace_idx ON public.client_phones USING btree (workspace_id);
CREATE INDEX client_portal_users_client_idx ON public.client_portal_users USING btree (client_id, display_order);
CREATE INDEX client_portal_users_invited_by_idx ON public.client_portal_users USING btree (invited_by);
CREATE UNIQUE INDEX client_portal_users_one_primary_idx ON public.client_portal_users USING btree (client_id) WHERE is_primary;
CREATE INDEX client_portal_users_workspace_idx ON public.client_portal_users USING btree (workspace_id);
CREATE UNIQUE INDEX idx_client_portal_users_pending_email ON public.client_portal_users USING btree (client_id, lower((invited_email)::text)) WHERE (status = 'invited'::text);
CREATE UNIQUE INDEX idx_client_portal_users_token ON public.client_portal_users USING btree (invitation_token);
CREATE INDEX idx_client_portal_users_user ON public.client_portal_users USING btree (user_id) WHERE (user_id IS NOT NULL);
CREATE INDEX client_relationships_client_idx ON public.client_relationships USING btree (client_id, display_order);
CREATE UNIQUE INDEX client_relationships_organizer_source_idx ON public.client_relationships USING btree (client_id, source_organizer_response_id, COALESCE(source_instance_index, '-1'::integer)) WHERE (source_organizer_response_id IS NOT NULL);
CREATE INDEX client_relationships_related_client_idx ON public.client_relationships USING btree (related_client_id);
CREATE INDEX client_relationships_workspace_idx ON public.client_relationships USING btree (workspace_id);
CREATE INDEX client_service_interests_client_idx ON public.client_service_interests USING btree (client_id, created_at DESC);
CREATE INDEX clients_ein_hash_idx ON public.clients USING btree (workspace_id, ein_hash) WHERE (ein_hash IS NOT NULL);
CREATE INDEX clients_name_trgm_idx ON public.clients USING gin ((((((COALESCE(business_name, ''::text) || ' '::text) || COALESCE(first_name, ''::text)) || ' '::text) || COALESCE(last_name, ''::text))) gin_trgm_ops);
CREATE INDEX clients_normalized_email_idx ON public.clients USING btree (workspace_id, normalized_email) WHERE (normalized_email IS NOT NULL);
CREATE INDEX clients_normalized_phone_idx ON public.clients USING btree (workspace_id, normalized_phone) WHERE (normalized_phone IS NOT NULL);
CREATE INDEX clients_source_workspace_id_idx ON public.clients USING btree (workspace_id, source_workspace_id);
CREATE INDEX clients_ssn_hash_idx ON public.clients USING btree (workspace_id, ssn_hash) WHERE (ssn_hash IS NOT NULL);
CREATE INDEX clients_workspace_idx ON public.clients USING btree (workspace_id, lifecycle_status);
CREATE INDEX idx_clients_created_by ON public.clients USING btree (created_by);
CREATE INDEX idx_clients_default_compliance_officer ON public.clients USING btree (default_compliance_officer_id) WHERE (default_compliance_officer_id IS NOT NULL);
CREATE INDEX idx_clients_default_reviewer ON public.clients USING btree (default_reviewer_id) WHERE (default_reviewer_id IS NOT NULL);
CREATE INDEX idx_clients_merged_into_client_id ON public.clients USING btree (merged_into_client_id);
CREATE INDEX idx_clients_relationship_manager ON public.clients USING btree (relationship_manager_id) WHERE (relationship_manager_id IS NOT NULL);
CREATE INDEX idx_clients_search ON public.clients USING gin (search_vector);
CREATE INDEX idx_communication_preferences_workspace ON public.communication_preferences USING btree (workspace_id);
CREATE INDEX config_object_shares_by_idx ON public.config_object_shares USING btree (shared_by_workspace_id, status);
CREATE INDEX config_object_shares_object_idx ON public.config_object_shares USING btree (object_type, object_id);
CREATE INDEX config_object_shares_with_idx ON public.config_object_shares USING btree (shared_with_workspace_id, status);
CREATE INDEX idx_config_object_shares_responded_by ON public.config_object_shares USING btree (responded_by);
CREATE INDEX idx_config_object_shares_shared_by ON public.config_object_shares USING btree (shared_by);
CREATE INDEX config_object_versions_lookup_idx ON public.config_object_versions USING btree (object_type, object_id, version_number DESC);
CREATE INDEX config_object_versions_workspace_idx ON public.config_object_versions USING btree (workspace_id);
CREATE INDEX idx_config_object_versions_changed_by ON public.config_object_versions USING btree (changed_by);
CREATE INDEX consent_records_client_idx ON public.consent_records USING btree (client_id, consent_type);
CREATE INDEX consent_records_user_idx ON public.consent_records USING btree (user_id, consent_type);
CREATE INDEX consent_records_workspace_idx ON public.consent_records USING btree (workspace_id);
CREATE INDEX dashboard_widgets_dashboard_idx ON public.dashboard_widgets USING btree (dashboard_id, display_order);
CREATE INDEX idx_dashboard_widgets_dashboard ON public.dashboard_widgets USING btree (dashboard_id);
CREATE UNIQUE INDEX dashboards_system_slug_key ON public.dashboards USING btree (slug) WHERE (workspace_id IS NULL);
CREATE INDEX dashboards_workspace_idx ON public.dashboards USING btree (workspace_id);
CREATE INDEX idx_dashboards_created_by ON public.dashboards USING btree (created_by);
CREATE INDEX idx_document_folder_template_items_parent ON public.document_folder_template_items USING btree (parent_item_id);
CREATE INDEX idx_document_folder_template_items_template ON public.document_folder_template_items USING btree (document_folder_template_id);
CREATE INDEX idx_document_folder_templates_created_by ON public.document_folder_templates USING btree (created_by);
CREATE INDEX idx_document_folder_templates_workspace ON public.document_folder_templates USING btree (workspace_id);
CREATE UNIQUE INDEX document_folders_unique_per_entity_name ON public.document_folders USING btree (workspace_id, entity_type, entity_id, COALESCE(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid), name);
CREATE INDEX idx_document_folders_created_by ON public.document_folders USING btree (created_by);
CREATE INDEX idx_document_folders_entity ON public.document_folders USING btree (entity_type, entity_id);
CREATE INDEX idx_document_folders_parent ON public.document_folders USING btree (parent_folder_id);
CREATE INDEX idx_document_folders_workspace ON public.document_folders USING btree (workspace_id);
CREATE INDEX document_request_item_statuses_organizer_field_id_idx ON public.document_request_item_statuses USING btree (organizer_field_id) WHERE (organizer_field_id IS NOT NULL);
CREATE INDEX idx_document_request_item_statuses_attachment ON public.document_request_item_statuses USING btree (fulfilled_by_attachment_id);
CREATE INDEX idx_document_request_item_statuses_request ON public.document_request_item_statuses USING btree (document_request_id);
CREATE INDEX idx_document_request_item_statuses_template_item ON public.document_request_item_statuses USING btree (document_request_item_id);
CREATE INDEX document_request_items_template_idx ON public.document_request_items USING btree (document_request_template_id, display_order);
CREATE UNIQUE INDEX document_request_templates_system_slug_key ON public.document_request_templates USING btree (slug) WHERE (workspace_id IS NULL);
CREATE INDEX document_request_templates_workspace_idx ON public.document_request_templates USING btree (workspace_id);
CREATE INDEX idx_document_request_templates_created_by ON public.document_request_templates USING btree (created_by);
CREATE UNIQUE INDEX document_requests_organizer_response_id_key ON public.document_requests USING btree (organizer_response_id) WHERE (organizer_response_id IS NOT NULL);
CREATE INDEX idx_document_requests_created_by ON public.document_requests USING btree (created_by);
CREATE INDEX idx_document_requests_document_request_template_id ON public.document_requests USING btree (document_request_template_id);
CREATE INDEX idx_document_requests_due_date ON public.document_requests USING btree (due_date) WHERE (status = 'open'::text);
CREATE INDEX idx_document_requests_entity ON public.document_requests USING btree (entity_type, entity_id);
CREATE INDEX idx_document_requests_workspace ON public.document_requests USING btree (workspace_id);
CREATE INDEX draft_saves_lookup_idx ON public.draft_saves USING btree (workspace_id, user_id, draft_type, entity_id);
CREATE INDEX idx_draft_saves_user ON public.draft_saves USING btree (user_id);
CREATE INDEX idx_due_date_rules_workspace ON public.due_date_rules USING btree (workspace_id);
CREATE INDEX idx_email_log_message ON public.email_log USING btree (message_id);
CREATE INDEX idx_email_log_provider_reference ON public.email_log USING btree (provider_reference);
CREATE INDEX idx_email_log_workspace ON public.email_log USING btree (workspace_id);
CREATE INDEX email_templates_folder_idx ON public.email_templates USING btree (folder_id);
CREATE UNIQUE INDEX email_templates_system_slug_key ON public.email_templates USING btree (slug) WHERE (workspace_id IS NULL);
CREATE INDEX email_templates_workspace_idx ON public.email_templates USING btree (workspace_id);
CREATE INDEX idx_email_templates_created_by ON public.email_templates USING btree (created_by);
CREATE INDEX idx_engagement_assignment_history_changed_by ON public.engagement_assignment_history USING btree (changed_by);
CREATE INDEX idx_engagement_assignment_history_engagement ON public.engagement_assignment_history USING btree (engagement_id, changed_at DESC);
CREATE INDEX idx_engagement_assignment_history_new_user ON public.engagement_assignment_history USING btree (new_user_id);
CREATE INDEX idx_engagement_assignment_history_previous_user ON public.engagement_assignment_history USING btree (previous_user_id);
CREATE INDEX engagement_letter_public_signatures_client_idx ON public.engagement_letter_public_signatures USING btree (client_id);
CREATE INDEX engagement_letter_public_signatures_workspace_idx ON public.engagement_letter_public_signatures USING btree (workspace_id);
CREATE INDEX idx_engagement_letter_public_signatures_template_id ON public.engagement_letter_public_signatures USING btree (engagement_letter_template_id);
CREATE INDEX engagement_letter_templates_folder_idx ON public.engagement_letter_templates USING btree (folder_id);
CREATE UNIQUE INDEX engagement_letter_templates_system_slug_key ON public.engagement_letter_templates USING btree (slug) WHERE (workspace_id IS NULL);
CREATE INDEX engagement_letter_templates_workspace_idx ON public.engagement_letter_templates USING btree (workspace_id);
CREATE INDEX idx_engagement_letter_templates_created_by ON public.engagement_letter_templates USING btree (created_by);
CREATE INDEX idx_engagement_pricing_created_by ON public.engagement_pricing USING btree (created_by);
CREATE INDEX idx_engagement_pricing_workspace ON public.engagement_pricing USING btree (workspace_id);
CREATE INDEX idx_engagement_review_actions_actor ON public.engagement_review_actions USING btree (actor_id);
CREATE INDEX idx_engagement_review_actions_share ON public.engagement_review_actions USING btree (engagement_share_id, created_at DESC);
CREATE INDEX engagement_shares_engagement_idx ON public.engagement_shares USING btree (engagement_id);
CREATE INDEX engagement_shares_shared_with_idx ON public.engagement_shares USING btree (shared_with_workspace_id, status);
CREATE INDEX engagement_shares_workspace_idx ON public.engagement_shares USING btree (workspace_id, status);
CREATE INDEX idx_engagement_shares_reviewed_by ON public.engagement_shares USING btree (reviewed_by);
CREATE INDEX idx_engagement_shares_shared_by ON public.engagement_shares USING btree (shared_by);
CREATE INDEX idx_engagement_status_history_audit_reference ON public.engagement_status_history USING btree (audit_reference);
CREATE INDEX idx_engagement_status_history_changed_by ON public.engagement_status_history USING btree (changed_by);
CREATE INDEX idx_engagement_status_history_engagement ON public.engagement_status_history USING btree (engagement_id, changed_at DESC);
CREATE INDEX idx_engagement_tax_details_original_engagement_id ON public.engagement_tax_details USING btree (original_engagement_id);
CREATE INDEX idx_engagement_tax_details_tax_year ON public.engagement_tax_details USING btree (workspace_id, tax_year);
CREATE INDEX idx_engagement_tax_details_workspace ON public.engagement_tax_details USING btree (workspace_id);
CREATE INDEX idx_engagements_assigned_staff ON public.engagements USING btree (assigned_staff_id);
CREATE INDEX idx_engagements_client ON public.engagements USING btree (client_id);
CREATE INDEX idx_engagements_compliance_officer ON public.engagements USING btree (compliance_officer_id);
CREATE INDEX idx_engagements_number ON public.engagements USING btree (engagement_number);
CREATE INDEX idx_engagements_owner_workspace ON public.engagements USING btree (owner_workspace_id);
CREATE INDEX idx_engagements_reviewer ON public.engagements USING btree (reviewer_id);
CREATE INDEX idx_engagements_search ON public.engagements USING gin (search_vector);
CREATE INDEX idx_engagements_service ON public.engagements USING btree (service_id);
CREATE INDEX idx_engagements_status ON public.engagements USING btree (workspace_id, status);
CREATE INDEX idx_engagements_workflow ON public.engagements USING btree (workflow_id);
CREATE INDEX idx_engagements_workspace ON public.engagements USING btree (workspace_id);
CREATE INDEX firm_connections_child_idx ON public.firm_connections USING btree (child_workspace_id, status);
CREATE INDEX firm_connections_parent_idx ON public.firm_connections USING btree (parent_workspace_id, status);
CREATE INDEX idx_firm_connections_invited_by ON public.firm_connections USING btree (invited_by);
CREATE INDEX idx_firm_connections_responded_by ON public.firm_connections USING btree (responded_by);
CREATE UNIQUE INDEX firm_tax_profile_efin_hash_idx ON public.firm_tax_profile USING btree (efin_hash) WHERE (efin_hash IS NOT NULL);
CREATE UNIQUE INDEX firm_tax_profile_ptin_hash_idx ON public.firm_tax_profile USING btree (ptin_hash) WHERE (ptin_hash IS NOT NULL);
CREATE INDEX idx_firm_tax_profile_updated_by ON public.firm_tax_profile USING btree (updated_by);
CREATE UNIQUE INDEX internal_message_threads_pair_idx ON public.internal_message_threads USING btree (workspace_id, LEAST(user_a_id, user_b_id), GREATEST(user_a_id, user_b_id));
CREATE INDEX internal_message_threads_workspace_idx ON public.internal_message_threads USING btree (workspace_id);
CREATE INDEX internal_messages_thread_idx ON public.internal_messages USING btree (thread_id);
CREATE INDEX idx_invoices_client ON public.invoices USING btree (client_id);
CREATE INDEX idx_invoices_created_by ON public.invoices USING btree (created_by);
CREATE INDEX idx_invoices_engagement ON public.invoices USING btree (engagement_id);
CREATE INDEX idx_invoices_workspace ON public.invoices USING btree (workspace_id);
CREATE UNIQUE INDEX invoices_workspace_invoice_number_key ON public.invoices USING btree (workspace_id, invoice_number) WHERE (invoice_number IS NOT NULL);
CREATE INDEX idx_irs_notices_created_by ON public.irs_notices USING btree (created_by);
CREATE INDEX idx_irs_notices_due_date ON public.irs_notices USING btree (response_due_date) WHERE (status = 'open'::text);
CREATE INDEX idx_irs_notices_entity ON public.irs_notices USING btree (entity_type, entity_id);
CREATE INDEX idx_irs_notices_workspace ON public.irs_notices USING btree (workspace_id);
CREATE INDEX learning_courses_owner_workspace_id_idx ON public.learning_courses USING btree (owner_workspace_id);
CREATE INDEX learning_module_completions_user_id_idx ON public.learning_module_completions USING btree (user_id);
CREATE INDEX learning_module_completions_workspace_id_idx ON public.learning_module_completions USING btree (workspace_id);
CREATE INDEX learning_modules_course_id_idx ON public.learning_modules USING btree (course_id);
CREATE INDEX learning_quiz_options_question_id_idx ON public.learning_quiz_options USING btree (question_id);
CREATE INDEX learning_quiz_questions_module_id_idx ON public.learning_quiz_questions USING btree (module_id);
CREATE INDEX library_folders_parent_idx ON public.library_folders USING btree (parent_folder_id);
CREATE UNIQUE INDEX library_folders_unique_per_scope_name ON public.library_folders USING btree (workspace_id, item_type, COALESCE(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
CREATE INDEX login_history_failed_idx ON public.login_history USING btree (created_at DESC) WHERE (NOT success);
CREATE INDEX login_history_user_idx ON public.login_history USING btree (user_id, created_at DESC);
CREATE INDEX login_history_workspace_idx ON public.login_history USING btree (workspace_id, created_at DESC);
CREATE INDEX idx_message_threads_created_by ON public.message_threads USING btree (created_by);
CREATE INDEX idx_message_threads_entity ON public.message_threads USING btree (entity_type, entity_id);
CREATE INDEX idx_message_threads_workspace ON public.message_threads USING btree (workspace_id);
CREATE UNIQUE INDEX message_threads_external_source_id_idx ON public.message_threads USING btree (workspace_id, external_source, external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX idx_messages_thread ON public.messages USING btree (thread_id);
CREATE INDEX idx_messages_workspace ON public.messages USING btree (workspace_id);
CREATE UNIQUE INDEX messages_external_source_id_idx ON public.messages USING btree (workspace_id, external_source, external_id) WHERE (external_id IS NOT NULL);
CREATE UNIQUE INDEX network_message_threads_unique_pair ON public.network_message_threads USING btree (ero_workspace_id, LEAST(workspace_a_id, workspace_b_id), GREATEST(workspace_a_id, workspace_b_id));
CREATE INDEX network_message_threads_workspace_a_idx ON public.network_message_threads USING btree (workspace_a_id);
CREATE INDEX network_message_threads_workspace_b_idx ON public.network_message_threads USING btree (workspace_b_id);
CREATE INDEX network_messages_thread_id_idx ON public.network_messages USING btree (thread_id);
CREATE INDEX client_notes_author_idx ON public.notes USING btree (author_id);
CREATE INDEX client_notes_client_idx ON public.notes USING btree (entity_id, created_at DESC);
CREATE INDEX client_notes_workspace_idx ON public.notes USING btree (workspace_id);
CREATE INDEX idx_notes_entity ON public.notes USING btree (entity_type, entity_id);
CREATE INDEX idx_notes_search ON public.notes USING gin (search_vector);
CREATE UNIQUE INDEX notes_external_source_id_idx ON public.notes USING btree (workspace_id, external_source, external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX idx_notification_preferences_workspace_id ON public.notification_preferences USING btree (workspace_id);
CREATE INDEX notification_preferences_user_workspace_idx ON public.notification_preferences USING btree (user_id, workspace_id);
CREATE INDEX idx_notification_queue_dispatch ON public.notification_queue USING btree (status, scheduled_at) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX notification_queue_dedupe_key_uidx ON public.notification_queue USING btree (workspace_id, template_key, dedupe_key) WHERE (dedupe_key IS NOT NULL);
CREATE INDEX notification_queue_pending_idx ON public.notification_queue USING btree (scheduled_at) WHERE (status = 'pending'::text);
CREATE INDEX notification_queue_recipient_idx ON public.notification_queue USING btree (recipient_user_id);
CREATE INDEX notification_queue_workspace_idx ON public.notification_queue USING btree (workspace_id);
CREATE UNIQUE INDEX office_locations_one_primary_per_workspace ON public.office_locations USING btree (workspace_id) WHERE is_primary;
CREATE INDEX office_locations_workspace_idx ON public.office_locations USING btree (workspace_id);
CREATE INDEX organizer_fields_parent_idx ON public.organizer_fields USING btree (parent_field_id);
CREATE INDEX organizer_fields_template_idx ON public.organizer_fields USING btree (organizer_template_id, display_order);
CREATE UNIQUE INDEX organizer_information_request_items_open_unique ON public.organizer_information_request_items USING btree (request_id, organizer_field_id, instance_index) WHERE (status <> ALL (ARRAY['resolved'::text, 'approved'::text, 'rejected'::text]));
CREATE INDEX organizer_information_request_items_request_id_idx ON public.organizer_information_request_items USING btree (request_id);
CREATE INDEX organizer_information_requests_response_id_idx ON public.organizer_information_requests USING btree (organizer_response_id);
CREATE INDEX idx_organizer_response_answers_organizer_field_id ON public.organizer_response_answers USING btree (organizer_field_id);
CREATE INDEX idx_organizer_response_answers_response ON public.organizer_response_answers USING btree (organizer_response_id);
CREATE INDEX idx_organizer_responses_client ON public.organizer_responses USING btree (client_id);
CREATE INDEX idx_organizer_responses_engagement ON public.organizer_responses USING btree (engagement_id);
CREATE INDEX idx_organizer_responses_organizer_template_id ON public.organizer_responses USING btree (organizer_template_id);
CREATE INDEX idx_organizer_responses_reviewed_by ON public.organizer_responses USING btree (reviewed_by);
CREATE INDEX idx_organizer_responses_workspace ON public.organizer_responses USING btree (workspace_id);
CREATE INDEX organizer_responses_signature_request_id_idx ON public.organizer_responses USING btree (signature_request_id) WHERE (signature_request_id IS NOT NULL);
CREATE INDEX idx_organizer_templates_created_by ON public.organizer_templates USING btree (created_by);
CREATE INDEX organizer_templates_folder_idx ON public.organizer_templates USING btree (folder_id);
CREATE UNIQUE INDEX organizer_templates_system_slug_key ON public.organizer_templates USING btree (slug) WHERE (workspace_id IS NULL);
CREATE INDEX organizer_templates_workspace_idx ON public.organizer_templates USING btree (workspace_id);
CREATE INDEX idx_payment_methods_client ON public.payment_methods USING btree (client_id);
CREATE INDEX idx_payment_methods_workspace ON public.payment_methods USING btree (workspace_id);
CREATE INDEX idx_payment_plans_created_by ON public.payment_plans USING btree (created_by);
CREATE INDEX payment_plans_invoice_idx ON public.payment_plans USING btree (invoice_id);
CREATE INDEX payment_plans_paid_payment_idx ON public.payment_plans USING btree (paid_payment_id);
CREATE INDEX payment_plans_workspace_idx ON public.payment_plans USING btree (workspace_id);
CREATE INDEX idx_payments_client ON public.payments USING btree (client_id);
CREATE INDEX idx_payments_invoice ON public.payments USING btree (invoice_id);
CREATE INDEX idx_payments_payment_method ON public.payments USING btree (payment_method_id);
CREATE INDEX idx_payments_recorded_by ON public.payments USING btree (recorded_by);
CREATE INDEX idx_payments_workspace ON public.payments USING btree (workspace_id);
CREATE UNIQUE INDEX uq_payments_stripe_checkout_session ON public.payments USING btree (stripe_checkout_session_id) WHERE (stripe_checkout_session_id IS NOT NULL);
CREATE UNIQUE INDEX uq_payments_stripe_payment_intent ON public.payments USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);
CREATE INDEX pending_engagement_letter_sends_status_idx ON public.pending_engagement_letter_sends USING btree (status, created_at) WHERE (status = 'pending'::text);
CREATE INDEX pending_portal_invites_status_idx ON public.pending_portal_invites USING btree (status, created_at);
CREATE INDEX pending_portal_invites_workspace_idx ON public.pending_portal_invites USING btree (workspace_id);
CREATE INDEX permissions_category_idx ON public.permissions USING btree (category);
CREATE INDEX pipeline_runs_current_stage_idx ON public.pipeline_runs USING btree (current_stage_id);
CREATE INDEX pipeline_runs_entity_idx ON public.pipeline_runs USING btree (entity_type, entity_id);
CREATE UNIQUE INDEX pipeline_runs_one_active_idx ON public.pipeline_runs USING btree (entity_type, entity_id, process_id) WHERE (status = 'Active'::workflow_run_status);
CREATE INDEX pipeline_runs_process_idx ON public.pipeline_runs USING btree (process_id);
CREATE INDEX pipeline_runs_workspace_idx ON public.pipeline_runs USING btree (workspace_id);
CREATE INDEX pipeline_stages_process_stage_idx ON public.pipeline_stages USING btree (process_stage_id);
CREATE INDEX pipeline_stages_run_idx ON public.pipeline_stages USING btree (pipeline_run_id);
CREATE INDEX pipeline_stages_workspace_idx ON public.pipeline_stages USING btree (workspace_id);
CREATE INDEX idx_pricing_rules_created_by ON public.pricing_rules USING btree (created_by);
CREATE UNIQUE INDEX pricing_rules_system_slug_key ON public.pricing_rules USING btree (slug) WHERE (workspace_id IS NULL);
CREATE INDEX pricing_rules_workspace_idx ON public.pricing_rules USING btree (workspace_id);
CREATE INDEX idx_process_stages_reviewer_role_id ON public.process_stages USING btree (reviewer_role_id);
CREATE INDEX process_stages_process_idx ON public.process_stages USING btree (process_id, display_order);
CREATE INDEX idx_process_tasks_assignee_role_id ON public.process_tasks USING btree (assignee_role_id);
CREATE INDEX process_tasks_stage_idx ON public.process_tasks USING btree (process_stage_id, display_order);
CREATE INDEX idx_processes_created_by ON public.processes USING btree (created_by);
CREATE INDEX processes_folder_idx ON public.processes USING btree (folder_id);
CREATE UNIQUE INDEX processes_system_slug_key ON public.processes USING btree (slug) WHERE (workspace_id IS NULL);
CREATE INDEX processes_workspace_idx ON public.processes USING btree (workspace_id);
CREATE INDEX idx_quotes_client ON public.quotes USING btree (client_id);
CREATE INDEX idx_quotes_created_by ON public.quotes USING btree (created_by);
CREATE INDEX idx_quotes_engagement ON public.quotes USING btree (engagement_id);
CREATE INDEX idx_quotes_workspace ON public.quotes USING btree (workspace_id);
CREATE UNIQUE INDEX quotes_workspace_quote_number_key ON public.quotes USING btree (workspace_id, quote_number) WHERE (quote_number IS NOT NULL);
CREATE INDEX rate_limit_hits_key_created_idx ON public.rate_limit_hits USING btree (rate_key, created_at);
CREATE INDEX idx_recurring_billing_client ON public.recurring_billing USING btree (client_id);
CREATE INDEX idx_recurring_billing_created_by ON public.recurring_billing USING btree (created_by);
CREATE INDEX idx_recurring_billing_engagement ON public.recurring_billing USING btree (engagement_id);
CREATE INDEX idx_recurring_billing_payment_method ON public.recurring_billing USING btree (payment_method_id);
CREATE INDEX idx_recurring_billing_workspace ON public.recurring_billing USING btree (workspace_id);
CREATE INDEX role_permissions_permission_idx ON public.role_permissions USING btree (permission_id);
CREATE UNIQUE INDEX roles_system_role_slug_key ON public.roles USING btree (slug) WHERE (workspace_id IS NULL);
CREATE INDEX roles_workspace_idx ON public.roles USING btree (workspace_id);
CREATE UNIQUE INDEX service_categories_system_slug_key ON public.service_categories USING btree (slug) WHERE (workspace_id IS NULL);
CREATE INDEX service_categories_workspace_idx ON public.service_categories USING btree (workspace_id, display_order);
CREATE INDEX idx_services_billing_rule_id ON public.services USING btree (billing_rule_id);
CREATE INDEX idx_services_cloned_from_service_id ON public.services USING btree (cloned_from_service_id) WHERE (cloned_from_service_id IS NOT NULL);
CREATE INDEX idx_services_created_by ON public.services USING btree (created_by);
CREATE INDEX idx_services_document_folder_template_id ON public.services USING btree (document_folder_template_id);
CREATE INDEX idx_services_document_request_template_id ON public.services USING btree (document_request_template_id);
CREATE INDEX idx_services_organizer_template_id ON public.services USING btree (organizer_template_id);
CREATE INDEX idx_services_pricing_rule_id ON public.services USING btree (pricing_rule_id);
CREATE INDEX idx_services_process_id ON public.services USING btree (process_id);
CREATE INDEX services_category_idx ON public.services USING btree (service_category_id);
CREATE UNIQUE INDEX services_system_slug_key ON public.services USING btree (slug) WHERE (workspace_id IS NULL);
CREATE INDEX services_tags_idx ON public.services USING gin (tags);
CREATE INDEX services_workspace_idx ON public.services USING btree (workspace_id, display_order);
CREATE INDEX idx_signature_request_signers_request ON public.signature_request_signers USING btree (signature_request_id);
CREATE UNIQUE INDEX signature_request_signers_access_token_key ON public.signature_request_signers USING btree (access_token);
CREATE INDEX idx_signature_requests_attachment ON public.signature_requests USING btree (attachment_id);
CREATE INDEX idx_signature_requests_created_by ON public.signature_requests USING btree (created_by);
CREATE INDEX idx_signature_requests_workspace ON public.signature_requests USING btree (workspace_id);
CREATE INDEX signature_requests_engagement_letter_template_id_idx ON public.signature_requests USING btree (engagement_letter_template_id) WHERE (engagement_letter_template_id IS NOT NULL);
CREATE INDEX signature_requests_organizer_template_id_idx ON public.signature_requests USING btree (organizer_template_id) WHERE (organizer_template_id IS NOT NULL);
CREATE INDEX site_funnels_website_idx ON public.site_funnels USING btree (website_id);
CREATE INDEX site_funnels_workspace_idx ON public.site_funnels USING btree (workspace_id);
CREATE INDEX site_page_sections_page_idx ON public.site_page_sections USING btree (page_id, display_order);
CREATE INDEX site_pages_funnel_idx ON public.site_pages USING btree (funnel_id, funnel_position);
CREATE INDEX site_pages_website_idx ON public.site_pages USING btree (website_id);
CREATE INDEX site_pages_workspace_idx ON public.site_pages USING btree (workspace_id);
CREATE UNIQUE INDEX site_websites_custom_domain_unique ON public.site_websites USING btree (custom_domain) WHERE (custom_domain IS NOT NULL);
CREATE INDEX site_websites_folder_idx ON public.site_websites USING btree (folder_id);
CREATE INDEX site_websites_workspace_idx ON public.site_websites USING btree (workspace_id);
CREATE INDEX idx_sms_log_message ON public.sms_log USING btree (message_id);
CREATE INDEX idx_sms_log_provider_reference ON public.sms_log USING btree (provider_reference);
CREATE INDEX idx_sms_log_workspace ON public.sms_log USING btree (workspace_id);
CREATE INDEX idx_sms_templates_created_by ON public.sms_templates USING btree (created_by);
CREATE INDEX sms_templates_folder_idx ON public.sms_templates USING btree (folder_id);
CREATE UNIQUE INDEX sms_templates_system_slug_key ON public.sms_templates USING btree (slug) WHERE (workspace_id IS NULL);
CREATE INDEX sms_templates_workspace_idx ON public.sms_templates USING btree (workspace_id);
CREATE INDEX system_failure_log_unnotified_idx ON public.system_failure_log USING btree (created_at) WHERE (notified_at IS NULL);
CREATE INDEX system_settings_updated_by_idx ON public.system_settings USING btree (updated_by);
CREATE INDEX system_settings_workspace_idx ON public.system_settings USING btree (workspace_id);
CREATE INDEX idx_task_dependencies_depends_on ON public.task_dependencies USING btree (depends_on_task_id);
CREATE INDEX idx_task_dependencies_task ON public.task_dependencies USING btree (task_id);
CREATE INDEX idx_task_dependencies_workspace ON public.task_dependencies USING btree (workspace_id);
CREATE INDEX idx_tasks_assigned_staff ON public.tasks USING btree (assigned_staff_id);
CREATE INDEX idx_tasks_client ON public.tasks USING btree (client_id);
CREATE INDEX idx_tasks_engagement ON public.tasks USING btree (engagement_id);
CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);
CREATE INDEX idx_tasks_workflow_stage ON public.tasks USING btree (workflow_stage_id);
CREATE INDEX idx_tasks_workspace ON public.tasks USING btree (workspace_id);
CREATE UNIQUE INDEX tasks_external_source_id_idx ON public.tasks USING btree (workspace_id, external_source, external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX trusted_devices_user_idx ON public.trusted_devices USING btree (user_id);
CREATE INDEX user_profiles_default_workspace_idx ON public.user_profiles USING btree (default_workspace_id);
CREATE UNIQUE INDEX user_profiles_ptin_hash_idx ON public.user_profiles USING btree (ptin_hash) WHERE (ptin_hash IS NOT NULL);
CREATE INDEX idx_user_widget_preferences_dashboard_widget_id ON public.user_widget_preferences USING btree (dashboard_widget_id);
CREATE INDEX user_widget_preferences_user_idx ON public.user_widget_preferences USING btree (user_id);
CREATE INDEX idx_webhook_events_external_id ON public.webhook_events USING btree (external_id);
CREATE INDEX idx_webhook_events_provider ON public.webhook_events USING btree (provider, received_at DESC);
CREATE INDEX idx_webhook_events_status ON public.webhook_events USING btree (status) WHERE (status = 'failed'::text);
CREATE INDEX idx_webhook_events_workspace ON public.webhook_events USING btree (workspace_id) WHERE (workspace_id IS NOT NULL);
CREATE INDEX idx_billing_charge_attempts_workspace_period ON public.workspace_billing_charge_attempts USING btree (workspace_id, period_end);
CREATE INDEX workspace_email_domains_workspace_id_idx ON public.workspace_email_domains USING btree (workspace_id);
CREATE INDEX workspace_feature_flags_flag_idx ON public.workspace_feature_flags USING btree (feature_flag_id);
CREATE INDEX workspace_feature_flags_updated_by_idx ON public.workspace_feature_flags USING btree (updated_by);
CREATE INDEX workspace_feature_flags_workspace_idx ON public.workspace_feature_flags USING btree (workspace_id);
CREATE INDEX idx_workspace_invitations_accepted_by ON public.workspace_invitations USING btree (accepted_by);
CREATE INDEX idx_workspace_invitations_email ON public.workspace_invitations USING btree (lower(email));
CREATE INDEX idx_workspace_invitations_invited_by ON public.workspace_invitations USING btree (invited_by);
CREATE INDEX idx_workspace_invitations_role_id ON public.workspace_invitations USING btree (role_id);
CREATE INDEX idx_workspace_invitations_workspace ON public.workspace_invitations USING btree (workspace_id);
CREATE UNIQUE INDEX uq_workspace_invitations_pending ON public.workspace_invitations USING btree (workspace_id, lower(email)) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX uq_workspace_invitations_token ON public.workspace_invitations USING btree (token);
CREATE INDEX idx_workspace_retention_policies_updated_by ON public.workspace_retention_policies USING btree (updated_by);
CREATE INDEX idx_workspace_security_policies_updated_by ON public.workspace_security_policies USING btree (updated_by);
CREATE INDEX idx_workspace_subscription_invoices_workspace_id ON public.workspace_subscription_invoices USING btree (workspace_id);
CREATE INDEX idx_workspace_subscriptions_plan_id ON public.workspace_subscriptions USING btree (plan_id);
CREATE INDEX workspace_users_invited_by_idx ON public.workspace_users USING btree (invited_by);
CREATE INDEX workspace_users_role_idx ON public.workspace_users USING btree (role_id);
CREATE INDEX workspace_users_user_idx ON public.workspace_users USING btree (user_id);
CREATE INDEX workspace_users_workspace_status_idx ON public.workspace_users USING btree (workspace_id, status);
CREATE INDEX workspaces_created_by_idx ON public.workspaces USING btree (created_by);
CREATE INDEX workspaces_name_trgm_idx ON public.workspaces USING gin (name gin_trgm_ops);
CREATE INDEX workspaces_status_idx ON public.workspaces USING btree (status);

-- =============================================================================
-- 7. TRIGGERS
-- =============================================================================

CREATE TRIGGER appointments_set_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_enqueue_calendar_sync AFTER INSERT OR DELETE OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION enqueue_calendar_sync();

CREATE TRIGGER trg_fire_appointment_status_automations AFTER INSERT OR UPDATE OF status ON public.appointments FOR EACH ROW EXECUTE FUNCTION fire_appointment_status_automations();

CREATE TRIGGER audit_client_documents AFTER INSERT OR DELETE OR UPDATE ON public.attachments FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_enforce_storage_capacity BEFORE INSERT ON public.attachments FOR EACH ROW EXECUTE FUNCTION enforce_storage_capacity();

CREATE TRIGGER trg_fire_document_uploaded_automations AFTER INSERT ON public.attachments FOR EACH ROW EXECUTE FUNCTION fire_document_uploaded_automations();

CREATE TRIGGER trg_record_attachment_activity AFTER INSERT OR DELETE OR UPDATE ON public.attachments FOR EACH ROW EXECUTE FUNCTION record_attachment_activity();

CREATE TRIGGER record_automation_executed AFTER INSERT ON public.automation_execution_logs FOR EACH ROW EXECUTE FUNCTION record_automation_executed();

CREATE TRIGGER trg_notify_admins_of_automation_failure AFTER INSERT ON public.automation_execution_logs FOR EACH ROW EXECUTE FUNCTION notify_admins_of_automation_failure();

CREATE TRIGGER prevent_duplicate_active_automation_run BEFORE INSERT ON public.automation_runs FOR EACH ROW EXECUTE FUNCTION skip_duplicate_active_automation_run();

CREATE TRIGGER audit_automation_steps AFTER INSERT OR DELETE OR UPDATE ON public.automation_steps FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER automation_steps_sync_edges BEFORE DELETE ON public.automation_steps FOR EACH ROW EXECUTE FUNCTION sync_automation_step_edges();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.automation_steps FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_automations AFTER INSERT OR DELETE OR UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER snapshot_version BEFORE UPDATE ON public.automations FOR EACH ROW EXECUTE FUNCTION snapshot_config_version();

CREATE TRIGGER trg_guard_delete_automation BEFORE DELETE ON public.automations FOR EACH ROW EXECUTE FUNCTION guard_delete_if_wired_to_automation('automation_id', 'id');

CREATE TRIGGER audit_billing_rules AFTER INSERT OR DELETE OR UPDATE ON public.billing_rules FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.billing_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER snapshot_version BEFORE UPDATE ON public.billing_rules FOR EACH ROW EXECUTE FUNCTION snapshot_config_version();

CREATE TRIGGER audit_branding AFTER INSERT OR DELETE OR UPDATE ON public.branding FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.branding FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.change_orders FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.change_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_client_addresses AFTER INSERT OR DELETE OR UPDATE ON public.client_addresses FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.client_addresses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_client_contacts AFTER INSERT OR DELETE OR UPDATE ON public.client_contacts FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.client_contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_client_emails AFTER INSERT OR DELETE OR UPDATE ON public.client_emails FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.client_emails FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sync_client_primary_email AFTER INSERT OR UPDATE OF is_primary, email ON public.client_emails FOR EACH ROW WHEN (new.is_primary) EXECUTE FUNCTION sync_client_primary_email();

CREATE TRIGGER audit_client_phones AFTER INSERT OR DELETE OR UPDATE ON public.client_phones FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.client_phones FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sync_client_primary_phone AFTER INSERT OR UPDATE OF is_primary, phone_number ON public.client_phones FOR EACH ROW WHEN (new.is_primary) EXECUTE FUNCTION sync_client_primary_phone();

CREATE TRIGGER audit_client_portal_users AFTER INSERT OR DELETE OR UPDATE ON public.client_portal_users FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_fire_portal_created_automations AFTER INSERT OR UPDATE OF status ON public.client_portal_users FOR EACH ROW EXECUTE FUNCTION fire_portal_created_automations();

CREATE TRIGGER audit_client_relationships AFTER INSERT OR DELETE OR UPDATE ON public.client_relationships FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.client_relationships FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_fire_service_interest_automations AFTER INSERT ON public.client_service_interests FOR EACH ROW EXECUTE FUNCTION fire_service_interest_automations();

CREATE TRIGGER audit_clients AFTER INSERT OR DELETE OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_apply_client_default_assignment BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION apply_client_default_assignment();

CREATE TRIGGER trg_auto_assign_client_relationship_manager BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION auto_assign_client_relationship_manager();

CREATE TRIGGER trg_fire_client_tag_automations AFTER UPDATE OF tags ON public.clients FOR EACH ROW EXECUTE FUNCTION fire_client_tag_automations();

CREATE TRIGGER trg_fire_lead_assigned_automations AFTER UPDATE OF relationship_manager_id ON public.clients FOR EACH ROW EXECUTE FUNCTION fire_lead_assigned_automations();

CREATE TRIGGER trg_fire_lead_created_automations AFTER INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION fire_lead_created_automations();

CREATE TRIGGER trg_fire_lead_status_changed_automations AFTER UPDATE OF lifecycle_status ON public.clients FOR EACH ROW EXECUTE FUNCTION fire_lead_status_changed_automations();

CREATE TRIGGER trg_fire_lead_updated_automations AFTER UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION fire_lead_updated_automations();

CREATE TRIGGER trg_generate_client_number BEFORE INSERT ON public.clients FOR EACH ROW WHEN ((new.client_number IS NULL)) EXECUTE FUNCTION generate_client_number();

CREATE TRIGGER trg_guard_client_sensitive_fields BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION guard_client_sensitive_fields();

CREATE TRIGGER trg_sync_client_emails_forward_ins AFTER INSERT ON public.clients FOR EACH ROW WHEN ((new.primary_email IS NOT NULL)) EXECUTE FUNCTION sync_client_emails_forward();

CREATE TRIGGER trg_sync_client_emails_forward_upd AFTER UPDATE OF primary_email ON public.clients FOR EACH ROW WHEN (((new.primary_email IS NOT NULL) AND (old.primary_email IS DISTINCT FROM new.primary_email))) EXECUTE FUNCTION sync_client_emails_forward();

CREATE TRIGGER trg_sync_client_phones_forward_ins AFTER INSERT ON public.clients FOR EACH ROW WHEN ((new.primary_phone IS NOT NULL)) EXECUTE FUNCTION sync_client_phones_forward();

CREATE TRIGGER trg_sync_client_phones_forward_upd AFTER UPDATE OF primary_phone ON public.clients FOR EACH ROW WHEN (((new.primary_phone IS NOT NULL) AND (old.primary_phone IS DISTINCT FROM new.primary_phone))) EXECUTE FUNCTION sync_client_phones_forward();

CREATE TRIGGER trg_validate_client_lifecycle_status BEFORE INSERT OR UPDATE OF lifecycle_status ON public.clients FOR EACH ROW EXECUTE FUNCTION validate_client_lifecycle_status();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.communication_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_config_object_shares AFTER INSERT OR DELETE OR UPDATE ON public.config_object_shares FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.config_object_shares FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_dashboard_widgets AFTER INSERT OR DELETE OR UPDATE ON public.dashboard_widgets FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.dashboard_widgets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_dashboards AFTER INSERT OR DELETE OR UPDATE ON public.dashboards FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.dashboards FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER snapshot_version BEFORE UPDATE ON public.dashboards FOR EACH ROW EXECUTE FUNCTION snapshot_config_version();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.document_folder_templates FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.document_folder_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.document_folders FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.document_folders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_check_document_request_completion AFTER UPDATE OF status ON public.document_request_item_statuses FOR EACH ROW EXECUTE FUNCTION check_document_request_completion();

CREATE TRIGGER audit_document_request_items AFTER INSERT OR DELETE OR UPDATE ON public.document_request_items FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.document_request_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_document_request_templates AFTER INSERT OR DELETE OR UPDATE ON public.document_request_templates FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.document_request_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER snapshot_version BEFORE UPDATE ON public.document_request_templates FOR EACH ROW EXECUTE FUNCTION snapshot_config_version();

CREATE TRIGGER trg_guard_delete_document_request_template BEFORE DELETE ON public.document_request_templates FOR EACH ROW EXECUTE FUNCTION guard_delete_if_wired_to_automation('document_request_template_id', 'id');

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.document_requests FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.document_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_fire_document_request_completed_automations AFTER UPDATE OF status ON public.document_requests FOR EACH ROW EXECUTE FUNCTION fire_document_request_completed_automations();

CREATE TRIGGER trg_fire_document_request_sent_automations AFTER INSERT ON public.document_requests FOR EACH ROW EXECUTE FUNCTION fire_document_request_sent_automations();

CREATE TRIGGER trg_notify_document_request_completed AFTER UPDATE OF status ON public.document_requests FOR EACH ROW EXECUTE FUNCTION notify_staff_document_request_completed();

CREATE TRIGGER trg_record_document_request_activity AFTER INSERT ON public.document_requests FOR EACH ROW EXECUTE FUNCTION record_document_request_activity();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.draft_saves FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_fire_email_engagement_event_automations AFTER UPDATE ON public.email_log FOR EACH ROW EXECUTE FUNCTION fire_email_engagement_event_automations();

CREATE TRIGGER audit_email_templates AFTER INSERT OR DELETE OR UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER snapshot_version BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION snapshot_config_version();

CREATE TRIGGER trg_guard_delete_email_template BEFORE DELETE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION guard_delete_if_wired_to_automation('template_slug', 'slug');

CREATE TRIGGER audit_engagement_letter_templates AFTER INSERT OR DELETE OR UPDATE ON public.engagement_letter_templates FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.engagement_letter_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER snapshot_version BEFORE UPDATE ON public.engagement_letter_templates FOR EACH ROW EXECUTE FUNCTION snapshot_config_version();

CREATE TRIGGER trg_guard_delete_engagement_letter_template BEFORE DELETE ON public.engagement_letter_templates FOR EACH ROW EXECUTE FUNCTION guard_delete_if_wired_to_automation('engagement_letter_template_id', 'id');

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.engagement_pricing FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.engagement_pricing FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_engagement_shares AFTER INSERT OR DELETE OR UPDATE ON public.engagement_shares FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.engagement_shares FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.engagement_tax_details FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.engagement_tax_details FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER record_engagement_assignment_changes AFTER UPDATE OF assigned_staff_id, reviewer_id, compliance_officer_id ON public.engagements FOR EACH ROW EXECUTE FUNCTION record_engagement_assignment_changes();

CREATE TRIGGER record_engagement_created AFTER INSERT ON public.engagements FOR EACH ROW EXECUTE FUNCTION record_engagement_created();

CREATE TRIGGER record_engagement_status_change BEFORE UPDATE OF status ON public.engagements FOR EACH ROW EXECUTE FUNCTION record_engagement_status_change();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_apply_document_folder_template AFTER INSERT ON public.engagements FOR EACH ROW EXECUTE FUNCTION apply_document_folder_template();

CREATE TRIGGER trg_enforce_ero_efile_gate BEFORE UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION enforce_ero_efile_gate();

CREATE CONSTRAINT TRIGGER trg_fire_engagement_created_automations AFTER INSERT ON public.engagements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fire_engagement_created_automations();

CREATE TRIGGER trg_fire_engagement_status_automations AFTER UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION fire_engagement_status_automations();

CREATE TRIGGER trg_generate_engagement_number BEFORE INSERT ON public.engagements FOR EACH ROW WHEN ((new.engagement_number IS NULL)) EXECUTE FUNCTION generate_engagement_number();

CREATE TRIGGER trg_prefill_engagement_assignments BEFORE INSERT ON public.engagements FOR EACH ROW EXECUTE FUNCTION prefill_engagement_assignments();

CREATE TRIGGER trg_protect_engagement_current_stage BEFORE UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION protect_engagement_current_stage();

CREATE TRIGGER zz_apply_engagement_default_assignment BEFORE INSERT ON public.engagements FOR EACH ROW EXECUTE FUNCTION apply_engagement_default_assignment();

CREATE TRIGGER audit_firm_connections AFTER INSERT OR DELETE OR UPDATE ON public.firm_connections FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.firm_connections FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_firm_tax_profile AFTER INSERT OR DELETE OR UPDATE ON public.firm_tax_profile FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.firm_tax_profile FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_fire_invoice_paid_automations AFTER UPDATE OF status ON public.invoices FOR EACH ROW EXECUTE FUNCTION fire_invoice_paid_automations();

CREATE TRIGGER trg_fire_invoice_sent_automations AFTER UPDATE OF status ON public.invoices FOR EACH ROW EXECUTE FUNCTION fire_invoice_sent_automations();

CREATE TRIGGER trg_generate_invoice_number BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

CREATE TRIGGER trg_ledger_invoice_issued_insert AFTER INSERT ON public.invoices FOR EACH ROW WHEN ((new.status <> 'draft'::text)) EXECUTE FUNCTION ledger_invoice_issued();

CREATE TRIGGER trg_ledger_invoice_issued_update AFTER UPDATE OF status ON public.invoices FOR EACH ROW WHEN (((old.status = 'draft'::text) AND (new.status <> 'draft'::text))) EXECUTE FUNCTION ledger_invoice_issued();

CREATE TRIGGER trg_log_engagement_completed_on_invoice_paid AFTER UPDATE OF status ON public.invoices FOR EACH ROW EXECUTE FUNCTION log_engagement_completed_on_invoice_paid();

CREATE TRIGGER trg_notify_invoice_paid AFTER UPDATE OF status ON public.invoices FOR EACH ROW EXECUTE FUNCTION notify_invoice_paid();

CREATE TRIGGER trg_sync_sent_at BEFORE INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION sync_sent_at();

CREATE TRIGGER trg_tag_client_on_invoice_paid AFTER UPDATE OF status ON public.invoices FOR EACH ROW EXECUTE FUNCTION tag_client_on_invoice_paid();

CREATE TRIGGER trg_tag_client_on_invoice_sent AFTER INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION tag_client_on_invoice_sent();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.irs_notices FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.irs_notices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_record_irs_notice_activity AFTER INSERT ON public.irs_notices FOR EACH ROW EXECUTE FUNCTION record_irs_notice_activity();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.library_folders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.message_threads FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.message_threads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_fire_client_message_received_automations AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION fire_client_message_received_automations();

CREATE TRIGGER trg_touch_message_thread AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION touch_message_thread();

CREATE TRIGGER audit_notes AFTER INSERT OR DELETE OR UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.office_locations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_organizer_fields AFTER INSERT OR DELETE OR UPDATE ON public.organizer_fields FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.organizer_fields FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_resolve_organizer_information_request_if_done AFTER UPDATE OF status ON public.organizer_information_request_items FOR EACH ROW EXECUTE FUNCTION resolve_organizer_information_request_if_done();

CREATE TRIGGER trg_fire_organizer_information_request_resolved_automations AFTER UPDATE OF status ON public.organizer_information_requests FOR EACH ROW EXECUTE FUNCTION fire_organizer_information_request_resolved_automations();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.organizer_response_answers FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.organizer_responses FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.organizer_responses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_fire_organizer_response_review_decided_automations AFTER UPDATE OF review_status ON public.organizer_responses FOR EACH ROW EXECUTE FUNCTION fire_organizer_response_review_decided_automations();

CREATE TRIGGER trg_fire_organizer_submitted_automations AFTER INSERT OR UPDATE OF status ON public.organizer_responses FOR EACH ROW EXECUTE FUNCTION fire_organizer_submitted_automations();

CREATE TRIGGER trg_notify_organizer_reviewed AFTER UPDATE OF review_status ON public.organizer_responses FOR EACH ROW EXECUTE FUNCTION notify_organizer_reviewed();

CREATE TRIGGER trg_record_organizer_response_activity AFTER INSERT OR UPDATE ON public.organizer_responses FOR EACH ROW EXECUTE FUNCTION record_organizer_response_activity();

CREATE TRIGGER trg_resolve_organizer_response_service AFTER UPDATE OF status ON public.organizer_responses FOR EACH ROW EXECUTE FUNCTION trg_resolve_organizer_response_service();

CREATE TRIGGER trg_sync_relationships_from_organizer AFTER UPDATE OF status ON public.organizer_responses FOR EACH ROW WHEN (((new.status = 'submitted'::text) AND (old.status IS DISTINCT FROM 'submitted'::text))) EXECUTE FUNCTION sync_client_relationships_from_organizer_submission();

CREATE TRIGGER audit_organizer_templates AFTER INSERT OR DELETE OR UPDATE ON public.organizer_templates FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.organizer_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER snapshot_version BEFORE UPDATE ON public.organizer_templates FOR EACH ROW EXECUTE FUNCTION snapshot_config_version();

CREATE TRIGGER trg_guard_delete_organizer_template BEFORE DELETE ON public.organizer_templates FOR EACH ROW EXECUTE FUNCTION guard_delete_if_wired_to_automation('organizer_template_id', 'id');

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.payment_methods FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER payment_plans_set_updated_at BEFORE UPDATE ON public.payment_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_fire_payment_plan_installment_paid_automations AFTER UPDATE OF status ON public.payment_plans FOR EACH ROW EXECUTE FUNCTION fire_payment_plan_installment_paid_automations();

CREATE TRIGGER payments_enqueue_receipt AFTER INSERT ON public.payments FOR EACH ROW WHEN ((new.status = 'succeeded'::text)) EXECUTE FUNCTION enqueue_payment_receipt();

CREATE TRIGGER trg_apply_payment_to_invoice AFTER INSERT ON public.payments FOR EACH ROW WHEN ((new.status = 'succeeded'::text)) EXECUTE FUNCTION apply_payment_to_invoice();

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_notify_payment_received AFTER INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION notify_payment_received();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pipeline_runs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit_pipeline_status AFTER UPDATE OF status ON public.pipeline_runs FOR EACH ROW EXECUTE FUNCTION audit_pipeline_event();

CREATE TRIGGER trg_sync_engagement_current_stage AFTER INSERT OR UPDATE ON public.pipeline_runs FOR EACH ROW EXECUTE FUNCTION sync_engagement_current_stage();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pipeline_stages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_advance_pipeline_on_stage_completed AFTER UPDATE ON public.pipeline_stages FOR EACH ROW WHEN (((new.status = ANY (ARRAY['Completed'::workflow_stage_status, 'Skipped'::workflow_stage_status])) AND (old.status IS DISTINCT FROM new.status))) EXECUTE FUNCTION advance_pipeline_on_stage_completed();

CREATE TRIGGER trg_apply_pipeline_stage_default_assignment BEFORE INSERT ON public.pipeline_stages FOR EACH ROW EXECUTE FUNCTION apply_pipeline_stage_default_assignment();

CREATE TRIGGER trg_fire_pipeline_stage_entered_automations AFTER UPDATE OF status ON public.pipeline_stages FOR EACH ROW EXECUTE FUNCTION fire_pipeline_stage_entered_automations();

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.platform_subscription_plans FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_handle_plan_price_change AFTER UPDATE ON public.platform_subscription_plans FOR EACH ROW EXECUTE FUNCTION handle_plan_price_change();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.platform_subscription_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_pricing_rules AFTER INSERT OR DELETE OR UPDATE ON public.pricing_rules FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pricing_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER snapshot_version BEFORE UPDATE ON public.pricing_rules FOR EACH ROW EXECUTE FUNCTION snapshot_config_version();

CREATE TRIGGER audit_process_stages AFTER INSERT OR DELETE OR UPDATE ON public.process_stages FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.process_stages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_process_tasks AFTER INSERT OR DELETE OR UPDATE ON public.process_tasks FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.process_tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_processes AFTER INSERT OR DELETE OR UPDATE ON public.processes FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.processes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER snapshot_version BEFORE UPDATE ON public.processes FOR EACH ROW EXECUTE FUNCTION snapshot_config_version();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.provider_status FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_fire_quote_created_automations AFTER INSERT ON public.quotes FOR EACH ROW EXECUTE FUNCTION fire_quote_created_automations();

CREATE TRIGGER trg_fire_quote_status_changed_automations AFTER UPDATE OF status ON public.quotes FOR EACH ROW EXECUTE FUNCTION fire_quote_status_changed_automations();

CREATE TRIGGER trg_flip_lead_on_quote_acceptance AFTER UPDATE OF status ON public.quotes FOR EACH ROW EXECUTE FUNCTION flip_lead_on_quote_acceptance();

CREATE TRIGGER trg_generate_quote_number BEFORE INSERT ON public.quotes FOR EACH ROW EXECUTE FUNCTION generate_quote_number();

CREATE TRIGGER trg_sync_sent_at BEFORE INSERT OR UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION sync_sent_at();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.recurring_billing FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.recurring_billing FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_role_permissions AFTER INSERT OR DELETE OR UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_roles AFTER INSERT OR DELETE OR UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_service_categories AFTER INSERT OR DELETE OR UPDATE ON public.service_categories FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.service_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER snapshot_version BEFORE UPDATE ON public.service_categories FOR EACH ROW EXECUTE FUNCTION snapshot_config_version();

CREATE TRIGGER audit_services AFTER INSERT OR DELETE OR UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER snapshot_version BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION snapshot_config_version();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.signature_request_signers FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_record_signature_activity AFTER UPDATE OF status ON public.signature_request_signers FOR EACH ROW WHEN ((new.status <> 'pending'::text)) EXECUTE FUNCTION record_signature_activity();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.signature_requests FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.signature_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_fire_engagement_letter_signed_automations AFTER UPDATE OF status ON public.signature_requests FOR EACH ROW EXECUTE FUNCTION fire_engagement_letter_signed_automations();

CREATE TRIGGER trg_fire_sms_engagement_event_automations AFTER UPDATE ON public.sms_log FOR EACH ROW EXECUTE FUNCTION fire_sms_engagement_event_automations();

CREATE TRIGGER audit_sms_templates AFTER INSERT OR DELETE OR UPDATE ON public.sms_templates FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sms_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER snapshot_version BEFORE UPDATE ON public.sms_templates FOR EACH ROW EXECUTE FUNCTION snapshot_config_version();

CREATE TRIGGER trg_guard_delete_sms_template BEFORE DELETE ON public.sms_templates FOR EACH ROW EXECUTE FUNCTION guard_delete_if_wired_to_automation('template_slug', 'slug');

CREATE TRIGGER audit_system_settings AFTER INSERT OR DELETE OR UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.task_dependencies FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER record_task_completed AFTER UPDATE OF status ON public.tasks FOR EACH ROW EXECUTE FUNCTION record_task_completed();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_fire_task_completed_automations AFTER UPDATE OF status ON public.tasks FOR EACH ROW EXECUTE FUNCTION fire_task_completed_automations();

CREATE TRIGGER trg_fire_task_created_automations AFTER INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION fire_task_created_automations();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER user_widget_preferences_set_updated_at BEFORE UPDATE ON public.user_widget_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.user_zoom_connections FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.user_zoom_connections FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER workspace_email_domains_set_updated_at BEFORE UPDATE ON public.workspace_email_domains FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_workspace_feature_flags AFTER INSERT OR DELETE OR UPDATE ON public.workspace_feature_flags FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.workspace_feature_flags FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR DELETE OR UPDATE ON public.workspace_invitations FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.workspace_invitations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_workspace_retention_policies AFTER INSERT OR DELETE OR UPDATE ON public.workspace_retention_policies FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.workspace_retention_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_workspace_security_policies AFTER INSERT OR DELETE OR UPDATE ON public.workspace_security_policies FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.workspace_security_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.workspace_subscription_invoices FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_audit AFTER INSERT OR DELETE OR UPDATE ON public.workspace_subscriptions FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.workspace_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_workspace_users AFTER INSERT OR DELETE OR UPDATE ON public.workspace_users FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER protect_workspace_users_owner_flag BEFORE UPDATE ON public.workspace_users FOR EACH ROW EXECUTE FUNCTION protect_workspace_users_owner_flag();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.workspace_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_workspaces AFTER INSERT OR DELETE OR UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 8. VIEWS
-- =============================================================================

CREATE VIEW public.compliance_consent_status_view AS
 SELECT id,
    workspace_id,
    user_id,
    client_id,
    consent_type,
    version,
    accepted_at
   FROM consent_records;

CREATE VIEW public.compliance_failed_logins_view AS
 SELECT lh.id,
    lh.user_id,
    up.display_name,
    lh.workspace_id,
    lh.ip_address,
    lh.user_agent,
    lh.failure_reason,
    lh.created_at
   FROM login_history lh
     LEFT JOIN user_profiles up ON up.id = lh.user_id
  WHERE NOT lh.success;

CREATE VIEW public.compliance_mfa_status_view AS
 SELECT wu.workspace_id,
    wu.user_id,
    up.display_name,
    up.mfa_enabled,
    up.mfa_enrolled_at,
    r.name AS role_name
   FROM workspace_users wu
     JOIN user_profiles up ON up.id = wu.user_id
     JOIN roles r ON r.id = wu.role_id
  WHERE wu.status = 'active'::text;

CREATE VIEW public.compliance_pending_reviews_view AS
 SELECT id,
    engagement_id,
    workspace_id,
    shared_with_workspace_id,
    shared_items,
    shared_by,
    created_at,
    expires_at
   FROM engagement_shares
  WHERE status = 'pending'::text;

CREATE VIEW public.compliance_permission_changes_view AS
 SELECT id,
    workspace_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data,
    created_at
   FROM audit_log
  WHERE entity_type = ANY (ARRAY['role_permissions'::text, 'roles'::text, 'workspace_users'::text]);

CREATE VIEW public.compliance_security_events_view AS
 SELECT id,
    workspace_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    severity,
    metadata,
    created_at
   FROM audit_log
  WHERE (severity = ANY (ARRAY['warning'::text, 'critical'::text])) OR (action = ANY (ARRAY['reveal_ssn'::text, 'reveal_ein'::text, 'reveal_itin'::text, 'reveal_efin'::text, 'reveal_ptin'::text]));

CREATE VIEW public.compliance_sensitive_data_reveals_view AS
 SELECT id,
    workspace_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    created_at
   FROM audit_log
  WHERE action ~~ 'reveal_%'::text;

CREATE VIEW public.compliance_shared_engagements_view AS
 SELECT id,
    engagement_id,
    workspace_id,
    shared_with_workspace_id,
    status,
    shared_by,
    reviewed_by,
    reviewed_at,
    decision_notes,
    created_at,
    expires_at
   FROM engagement_shares;

CREATE VIEW public.v_engagement_progress AS
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
    pr.status AS workflow_status,
    COALESCE(tc.completed_tasks::double precision / NULLIF(tc.total_tasks, 0)::double precision * 100::double precision, 0::double precision) AS task_progress_pct,
    COALESCE(dc.verified_docs::double precision / NULLIF(dc.total_docs, 0)::double precision * 100::double precision, 0::double precision) AS document_progress_pct,
        CASE
            WHEN pr.status = 'Completed'::workflow_run_status THEN 100::double precision
            ELSE (COALESCE(tc.completed_tasks::double precision / NULLIF(tc.total_tasks, 0)::double precision, 0::double precision) * 0.7::double precision + COALESCE(dc.verified_docs::double precision / NULLIF(dc.total_docs, 0)::double precision, 0::double precision) * 0.3::double precision) * 100::double precision
        END AS overall_progress_pct
   FROM engagements e
     LEFT JOIN LATERAL ( SELECT pr2.status
           FROM pipeline_runs pr2
          WHERE pr2.entity_type = 'engagement'::text AND pr2.entity_id = e.id
          ORDER BY (pr2.status = 'Active'::workflow_run_status) DESC, pr2.started_at DESC
         LIMIT 1) pr ON true
     LEFT JOIN task_counts tc ON tc.engagement_id = e.id
     LEFT JOIN doc_counts dc ON dc.engagement_id = e.id;

CREATE VIEW public.v_reviewer_queue AS
 SELECT ps.id AS workflow_stage_id,
    ps.workspace_id,
    e.engagement_number,
    e.client_id,
    ps.stage_name,
    ps.reviewer_id,
    ps.status,
    ps.due_date,
    ps.started_at,
    e.id AS engagement_id
   FROM pipeline_stages ps
     JOIN pipeline_runs pr ON pr.id = ps.pipeline_run_id
     JOIN engagements e ON pr.entity_id = e.id
  WHERE pr.entity_type = 'engagement'::text AND (ps.status = ANY (ARRAY['Waiting'::workflow_stage_status, 'In Progress'::workflow_stage_status])) AND ps.reviewer_id IS NOT NULL;

CREATE VIEW public.v_staff_productivity AS
 SELECT wu.workspace_id,
    wu.user_id AS staff_id,
    count(DISTINCT e.id) FILTER (WHERE e.status <> ALL (ARRAY['Completed'::text, 'Archived'::text])) AS open_engagements,
    count(DISTINCT e.id) FILTER (WHERE e.status = 'Completed'::text AND e.completed_date >= date_trunc('month'::text, now())) AS engagements_completed_this_month,
    count(DISTINCT t.id) FILTER (WHERE t.status = 'completed'::text) AS tasks_completed,
    count(DISTINCT t.id) FILTER (WHERE t.status <> 'completed'::text AND t.due_date < now()) AS tasks_overdue,
    count(DISTINCT rq.workflow_stage_id) AS pending_reviews
   FROM workspace_users wu
     LEFT JOIN engagements e ON e.assigned_staff_id = wu.user_id AND e.workspace_id = wu.workspace_id
     LEFT JOIN tasks t ON t.assigned_staff_id = wu.user_id AND t.workspace_id = wu.workspace_id
     LEFT JOIN v_reviewer_queue rq ON rq.reviewer_id = wu.user_id AND rq.workspace_id = wu.workspace_id
  WHERE wu.status = 'active'::text
  GROUP BY wu.workspace_id, wu.user_id;

CREATE VIEW public.v_tax_season_metrics AS
 SELECT td.workspace_id,
    td.tax_year,
    count(*) AS total_returns,
    count(*) FILTER (WHERE td.return_status = 'filed'::text) AS filed,
    count(*) FILTER (WHERE td.return_status = 'ready_to_file'::text) AS ready_to_file,
    count(*) FILTER (WHERE td.return_status = 'not_filed'::text) AS not_filed,
    count(*) FILTER (WHERE td.is_extended) AS extended,
    count(*) FILTER (WHERE td.is_amended) AS amended,
    count(DISTINCT n.id) FILTER (WHERE n.status = 'open'::text) AS open_irs_notices
   FROM engagement_tax_details td
     LEFT JOIN irs_notices n ON n.entity_type = 'engagement'::text AND n.entity_id = td.engagement_id
  WHERE td.tax_year IS NOT NULL
  GROUP BY td.workspace_id, td.tax_year;

CREATE VIEW public.v_workflow_sla_status AS
 SELECT ps.id AS workflow_stage_id,
    ps.pipeline_run_id AS workflow_run_id,
    ps.stage_name,
    ps.status,
    ps.due_date,
    ps.started_at,
        CASE
            WHEN ps.completed_at IS NOT NULL THEN ps.completed_at - ps.started_at
            ELSE now() - ps.started_at
        END AS time_elapsed,
    pst.expected_duration,
        CASE
            WHEN ps.status = 'Completed'::workflow_stage_status THEN 'Completed'::text
            WHEN ps.due_date IS NOT NULL AND now() > ps.due_date THEN 'Overdue'::text
            WHEN pst.expected_duration IS NOT NULL AND (now() - ps.started_at) > pst.expected_duration THEN 'Exceeded'::text
            ELSE 'On Track'::text
        END AS sla_category
   FROM pipeline_stages ps
     JOIN process_stages pst ON ps.process_stage_id = pst.id
     JOIN pipeline_runs pr ON pr.id = ps.pipeline_run_id
  WHERE pr.entity_type = 'engagement'::text;

-- =============================================================================
-- 9. ROW LEVEL SECURITY: enable + policies
-- =============================================================================

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_finding_correlations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_run_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_test_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_external_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_date_reminders_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_pending_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_step_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_pending_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_service_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_object_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_object_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_folder_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_folder_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_request_item_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_request_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.due_date_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_letter_public_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_letter_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_review_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_tax_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_tax_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irs_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_module_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_quiz_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_information_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_information_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_response_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_service_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_engagement_letter_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_portal_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_system_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signature_request_signers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_page_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_failure_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_widget_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_zoom_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_billing_charge_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_email_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_ghl_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_jotform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_security_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_usage_meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_log_insert ON public.activity_log AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_workspace_member(workspace_id) AND (actor_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY activity_log_select ON public.activity_log AS PERMISSIVE FOR SELECT TO public USING ((is_workspace_member(workspace_id) OR is_portal_user_for_entity(entity_type, entity_id)));
CREATE POLICY ai_agent_evidence_select ON public.ai_agent_evidence AS PERMISSIVE FOR SELECT TO public USING (can_access_admin_ai());
CREATE POLICY ai_agent_finding_correlations_select ON public.ai_agent_finding_correlations AS PERMISSIVE FOR SELECT TO public USING (can_access_admin_ai());
CREATE POLICY ai_agent_findings_select ON public.ai_agent_findings AS PERMISSIVE FOR SELECT TO public USING (can_access_admin_ai());
CREATE POLICY ai_agent_run_budgets_select ON public.ai_agent_run_budgets AS PERMISSIVE FOR SELECT TO public USING (can_access_admin_ai());
CREATE POLICY ai_agent_run_events_select ON public.ai_agent_run_events AS PERMISSIVE FOR SELECT TO public USING (can_access_admin_ai());
CREATE POLICY ai_agent_runs_select ON public.ai_agent_runs AS PERMISSIVE FOR SELECT TO public USING (can_access_admin_ai());
CREATE POLICY ai_agent_test_personas_select ON public.ai_agent_test_personas AS PERMISSIVE FOR SELECT TO public USING (can_access_admin_ai());
CREATE POLICY ai_agents_select ON public.ai_agents AS PERMISSIVE FOR SELECT TO public USING (can_access_admin_ai());
CREATE POLICY appointments_delete ON public.appointments AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'appointments.manage'::text));
CREATE POLICY appointments_insert ON public.appointments AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'appointments.manage'::text));
CREATE POLICY appointments_select ON public.appointments AS PERMISSIVE FOR SELECT TO public USING ((has_permission(workspace_id, 'appointments.view'::text) OR (portal_visible AND (client_id IS NOT NULL) AND is_portal_user(client_id))));
CREATE POLICY appointments_update ON public.appointments AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'appointments.manage'::text));
CREATE POLICY client_documents_delete ON public.attachments AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'documents.delete'::text));
CREATE POLICY client_documents_insert ON public.attachments AS PERMISSIVE FOR INSERT TO public WITH CHECK (((has_permission(workspace_id, 'documents.upload'::text) AND (uploaded_by = ( SELECT auth.uid() AS uid))) OR ((visibility = 'client_visible'::text) AND (uploaded_by = ( SELECT auth.uid() AS uid)) AND is_portal_user_for_entity(entity_type, entity_id))));
CREATE POLICY client_documents_select ON public.attachments AS PERMISSIVE FOR SELECT TO public USING ((has_permission(workspace_id, 'documents.view'::text) OR ((visibility = 'client_visible'::text) AND (is_archived = false) AND is_portal_user_for_entity(entity_type, entity_id)) OR ((visibility = 'client_visible'::text) AND (is_archived = false) AND (((entity_type = 'engagement'::text) AND has_pending_engagement_share_access(entity_id)) OR ((entity_type = 'client'::text) AND (EXISTS ( SELECT 1
   FROM engagements e
  WHERE ((e.client_id = attachments.entity_id) AND has_pending_engagement_share_access(e.id)))))))));
CREATE POLICY client_documents_update ON public.attachments AS PERMISSIVE FOR UPDATE TO public USING ((has_permission(workspace_id, 'documents.upload'::text) OR has_permission(workspace_id, 'documents.delete'::text))) WITH CHECK ((has_permission(workspace_id, 'documents.upload'::text) OR has_permission(workspace_id, 'documents.delete'::text)));
CREATE POLICY audit_log_select ON public.audit_log AS PERMISSIVE FOR SELECT TO public USING ((((workspace_id IS NOT NULL) AND has_permission(workspace_id, 'audit.view'::text)) OR is_platform_admin()));
CREATE POLICY automation_date_reminders_sent_select ON public.automation_date_reminders_sent AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM automations a
  WHERE ((a.id = automation_date_reminders_sent.automation_id) AND is_workspace_member(a.workspace_id)))));
CREATE POLICY automation_execution_logs_select ON public.automation_execution_logs AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY automation_pending_steps_select ON public.automation_pending_steps AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY automation_runs_select ON public.automation_runs AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY automation_step_edges_delete ON public.automation_step_edges AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM automations a
  WHERE ((a.id = automation_step_edges.automation_id) AND (a.workspace_id IS NOT NULL) AND has_permission(a.workspace_id, 'automations.manage'::text)))));
CREATE POLICY automation_step_edges_insert ON public.automation_step_edges AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM automations a
  WHERE ((a.id = automation_step_edges.automation_id) AND (a.workspace_id IS NOT NULL) AND has_permission(a.workspace_id, 'automations.manage'::text)))));
CREATE POLICY automation_step_edges_select ON public.automation_step_edges AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM automations a
  WHERE ((a.id = automation_step_edges.automation_id) AND ((a.workspace_id IS NULL) OR is_workspace_member(a.workspace_id))))));
CREATE POLICY automation_step_edges_update ON public.automation_step_edges AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM automations a
  WHERE ((a.id = automation_step_edges.automation_id) AND (a.workspace_id IS NOT NULL) AND has_permission(a.workspace_id, 'automations.manage'::text)))));
CREATE POLICY automation_steps_delete ON public.automation_steps AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM automations a
  WHERE ((a.id = automation_steps.automation_id) AND (a.workspace_id IS NOT NULL) AND has_permission(a.workspace_id, 'automations.manage'::text)))));
CREATE POLICY automation_steps_insert ON public.automation_steps AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM automations a
  WHERE ((a.id = automation_steps.automation_id) AND (a.workspace_id IS NOT NULL) AND has_permission(a.workspace_id, 'automations.manage'::text)))));
CREATE POLICY automation_steps_select ON public.automation_steps AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM automations a
  WHERE ((a.id = automation_steps.automation_id) AND ((a.workspace_id IS NULL) OR is_workspace_member(a.workspace_id))))));
CREATE POLICY automation_steps_update ON public.automation_steps AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM automations a
  WHERE ((a.id = automation_steps.automation_id) AND (a.workspace_id IS NOT NULL) AND has_permission(a.workspace_id, 'automations.manage'::text)))));
CREATE POLICY automation_webhook_deliveries_select ON public.automation_webhook_deliveries AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY automations_delete ON public.automations AS PERMISSIVE FOR DELETE TO public USING (((workspace_id IS NOT NULL) AND has_permission(workspace_id, 'automations.manage'::text)));
CREATE POLICY automations_insert ON public.automations AS PERMISSIVE FOR INSERT TO public WITH CHECK (((workspace_id IS NOT NULL) AND has_permission(workspace_id, 'automations.manage'::text)));
CREATE POLICY automations_select ON public.automations AS PERMISSIVE FOR SELECT TO public USING (((workspace_id IS NULL) OR is_workspace_member(workspace_id) OR has_config_object_share_access('automations'::text, id)));
CREATE POLICY automations_update ON public.automations AS PERMISSIVE FOR UPDATE TO public USING (((workspace_id IS NOT NULL) AND has_permission(workspace_id, 'automations.manage'::text)));
CREATE POLICY billing_rules_delete ON public.billing_rules AS PERMISSIVE FOR DELETE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY billing_rules_insert ON public.billing_rules AS PERMISSIVE FOR INSERT TO public WITH CHECK (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY billing_rules_select ON public.billing_rules AS PERMISSIVE FOR SELECT TO public USING (((workspace_id IS NULL) OR is_workspace_member(workspace_id) OR has_config_object_share_access('billing_rules'::text, id)));
CREATE POLICY billing_rules_update ON public.billing_rules AS PERMISSIVE FOR UPDATE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY branding_delete ON public.branding AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'branding.manage'::text));
CREATE POLICY branding_insert ON public.branding AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'branding.manage'::text));
CREATE POLICY branding_select ON public.branding AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY branding_select_portal_user ON public.branding AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM client_portal_users cpu
  WHERE ((cpu.user_id = auth.uid()) AND (cpu.status = 'active'::text) AND ((cpu.workspace_id = branding.workspace_id) OR (EXISTS ( SELECT 1
           FROM firm_connections fc
          WHERE ((fc.child_workspace_id = cpu.workspace_id) AND (fc.parent_workspace_id = branding.workspace_id) AND (fc.relationship_type = 'ero_ptin'::text) AND (fc.status = 'active'::text)))))))));
CREATE POLICY branding_select_via_ero_connection ON public.branding AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM firm_connections fc
  WHERE ((fc.parent_workspace_id = branding.workspace_id) AND (fc.relationship_type = 'ero_ptin'::text) AND (fc.status = 'active'::text) AND is_workspace_member(fc.child_workspace_id)))));
CREATE POLICY branding_update ON public.branding AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'branding.manage'::text)) WITH CHECK (has_permission(workspace_id, 'branding.manage'::text));
CREATE POLICY calendar_sync_queue_select_platform_it ON public.calendar_sync_queue AS PERMISSIVE FOR SELECT TO public USING (is_platform_it());
CREATE POLICY change_orders_delete ON public.change_orders AS PERMISSIVE FOR DELETE TO public USING (is_workspace_admin(workspace_id));
CREATE POLICY change_orders_select ON public.change_orders AS PERMISSIVE FOR SELECT TO public USING (has_permission(workspace_id, 'billing.view'::text));
CREATE POLICY change_orders_update ON public.change_orders AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'billing.manage'::text)) WITH CHECK (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY change_orders_write ON public.change_orders AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY client_addresses_delete ON public.client_addresses AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY client_addresses_insert ON public.client_addresses AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY client_addresses_select ON public.client_addresses AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY client_addresses_update ON public.client_addresses AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'clients.edit'::text)) WITH CHECK (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY client_contacts_delete ON public.client_contacts AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY client_contacts_insert ON public.client_contacts AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY client_contacts_select ON public.client_contacts AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY client_contacts_update ON public.client_contacts AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'clients.edit'::text)) WITH CHECK (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY client_emails_delete ON public.client_emails AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY client_emails_insert ON public.client_emails AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY client_emails_select ON public.client_emails AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY client_emails_update ON public.client_emails AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'clients.edit'::text)) WITH CHECK (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY client_ledger_insert ON public.client_ledger AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY client_ledger_select ON public.client_ledger AS PERMISSIVE FOR SELECT TO public USING ((has_permission(workspace_id, 'billing.view'::text) OR is_portal_user(client_id)));
CREATE POLICY client_pending_changes_select ON public.client_pending_changes AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY client_phones_delete ON public.client_phones AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY client_phones_insert ON public.client_phones AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY client_phones_select ON public.client_phones AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY client_phones_update ON public.client_phones AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'clients.edit'::text)) WITH CHECK (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY client_portal_users_delete ON public.client_portal_users AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'portal.manage'::text));
CREATE POLICY client_portal_users_insert ON public.client_portal_users AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'portal.manage'::text));
CREATE POLICY client_portal_users_select ON public.client_portal_users AS PERMISSIVE FOR SELECT TO public USING ((is_workspace_member(workspace_id) OR (user_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY client_portal_users_update ON public.client_portal_users AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'portal.manage'::text)) WITH CHECK (has_permission(workspace_id, 'portal.manage'::text));
CREATE POLICY client_relationships_delete ON public.client_relationships AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY client_relationships_insert ON public.client_relationships AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY client_relationships_select ON public.client_relationships AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY client_relationships_update ON public.client_relationships AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'clients.edit'::text)) WITH CHECK (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY client_service_interests_select ON public.client_service_interests AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY clients_delete ON public.clients AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'clients.delete'::text));
CREATE POLICY clients_select ON public.clients AS PERMISSIVE FOR SELECT TO public USING ((is_workspace_member(workspace_id) OR (EXISTS ( SELECT 1
   FROM engagements e
  WHERE ((e.client_id = clients.id) AND has_pending_engagement_share_access(e.id)))) OR is_portal_user(id)));
CREATE POLICY clients_update ON public.clients AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'clients.edit'::text)) WITH CHECK (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY communication_preferences_select ON public.communication_preferences AS PERMISSIVE FOR SELECT TO public USING (has_permission(workspace_id, 'clients.view'::text));
CREATE POLICY communication_preferences_update ON public.communication_preferences AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'clients.edit'::text)) WITH CHECK (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY communication_preferences_write ON public.communication_preferences AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'clients.edit'::text));
CREATE POLICY config_object_shares_select ON public.config_object_shares AS PERMISSIVE FOR SELECT TO public USING ((is_workspace_member(shared_by_workspace_id) OR is_workspace_member(shared_with_workspace_id)));
CREATE POLICY config_object_versions_select ON public.config_object_versions AS PERMISSIVE FOR SELECT TO public USING (((workspace_id IS NULL) OR is_workspace_member(workspace_id)));
CREATE POLICY consent_records_select ON public.consent_records AS PERMISSIVE FOR SELECT TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((workspace_id IS NOT NULL) AND is_workspace_member(workspace_id))));
CREATE POLICY dashboard_widgets_delete ON public.dashboard_widgets AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM dashboards d
  WHERE ((d.id = dashboard_widgets.dashboard_id) AND (d.workspace_id IS NOT NULL) AND is_workspace_admin(d.workspace_id)))));
CREATE POLICY dashboard_widgets_insert ON public.dashboard_widgets AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM dashboards d
  WHERE ((d.id = dashboard_widgets.dashboard_id) AND (d.workspace_id IS NOT NULL) AND is_workspace_admin(d.workspace_id)))));
CREATE POLICY dashboard_widgets_select ON public.dashboard_widgets AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM dashboards d
  WHERE ((d.id = dashboard_widgets.dashboard_id) AND ((d.workspace_id IS NULL) OR is_workspace_member(d.workspace_id))))));
CREATE POLICY dashboard_widgets_update ON public.dashboard_widgets AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM dashboards d
  WHERE ((d.id = dashboard_widgets.dashboard_id) AND (d.workspace_id IS NOT NULL) AND is_workspace_admin(d.workspace_id)))));
CREATE POLICY dashboards_delete ON public.dashboards AS PERMISSIVE FOR DELETE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY dashboards_insert ON public.dashboards AS PERMISSIVE FOR INSERT TO public WITH CHECK (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY dashboards_select ON public.dashboards AS PERMISSIVE FOR SELECT TO public USING (((workspace_id IS NULL) OR is_workspace_member(workspace_id) OR has_config_object_share_access('dashboards'::text, id)));
CREATE POLICY dashboards_update ON public.dashboards AS PERMISSIVE FOR UPDATE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY document_folder_template_items_delete ON public.document_folder_template_items AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM document_folder_templates t
  WHERE ((t.id = document_folder_template_items.document_folder_template_id) AND (t.workspace_id IS NOT NULL) AND is_workspace_admin(t.workspace_id)))));
CREATE POLICY document_folder_template_items_insert ON public.document_folder_template_items AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM document_folder_templates t
  WHERE ((t.id = document_folder_template_items.document_folder_template_id) AND (t.workspace_id IS NOT NULL) AND is_workspace_admin(t.workspace_id)))));
CREATE POLICY document_folder_template_items_select ON public.document_folder_template_items AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM document_folder_templates t
  WHERE ((t.id = document_folder_template_items.document_folder_template_id) AND ((t.workspace_id IS NULL) OR has_permission(t.workspace_id, 'documents.view'::text))))));
CREATE POLICY document_folder_template_items_update ON public.document_folder_template_items AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM document_folder_templates t
  WHERE ((t.id = document_folder_template_items.document_folder_template_id) AND (t.workspace_id IS NOT NULL) AND is_workspace_admin(t.workspace_id)))));
CREATE POLICY document_folder_templates_delete ON public.document_folder_templates AS PERMISSIVE FOR DELETE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY document_folder_templates_insert ON public.document_folder_templates AS PERMISSIVE FOR INSERT TO public WITH CHECK (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY document_folder_templates_select ON public.document_folder_templates AS PERMISSIVE FOR SELECT TO public USING (((workspace_id IS NULL) OR has_permission(workspace_id, 'documents.view'::text)));
CREATE POLICY document_folder_templates_update ON public.document_folder_templates AS PERMISSIVE FOR UPDATE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY document_folders_delete ON public.document_folders AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'documents.delete'::text));
CREATE POLICY document_folders_insert ON public.document_folders AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'documents.upload'::text));
CREATE POLICY document_folders_select ON public.document_folders AS PERMISSIVE FOR SELECT TO public USING ((has_permission(workspace_id, 'documents.view'::text) OR is_portal_user_for_entity(entity_type, entity_id)));
CREATE POLICY document_folders_update ON public.document_folders AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'documents.upload'::text));
CREATE POLICY document_request_item_statuses_delete ON public.document_request_item_statuses AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM document_requests r
  WHERE ((r.id = document_request_item_statuses.document_request_id) AND has_permission(r.workspace_id, 'documents.request'::text)))));
CREATE POLICY document_request_item_statuses_insert ON public.document_request_item_statuses AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM document_requests r
  WHERE ((r.id = document_request_item_statuses.document_request_id) AND has_permission(r.workspace_id, 'documents.request'::text)))));
CREATE POLICY document_request_item_statuses_select ON public.document_request_item_statuses AS PERMISSIVE FOR SELECT TO public USING (((EXISTS ( SELECT 1
   FROM document_requests r
  WHERE ((r.id = document_request_item_statuses.document_request_id) AND has_permission(r.workspace_id, 'documents.view'::text)))) OR (EXISTS ( SELECT 1
   FROM document_requests r
  WHERE ((r.id = document_request_item_statuses.document_request_id) AND is_portal_user_for_entity(r.entity_type, r.entity_id))))));
CREATE POLICY document_request_item_statuses_update ON public.document_request_item_statuses AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM document_requests r
  WHERE ((r.id = document_request_item_statuses.document_request_id) AND has_permission(r.workspace_id, 'documents.request'::text)))));
CREATE POLICY document_request_items_delete ON public.document_request_items AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM document_request_templates t
  WHERE ((t.id = document_request_items.document_request_template_id) AND (t.workspace_id IS NOT NULL) AND is_workspace_admin(t.workspace_id)))));
CREATE POLICY document_request_items_insert ON public.document_request_items AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM document_request_templates t
  WHERE ((t.id = document_request_items.document_request_template_id) AND (t.workspace_id IS NOT NULL) AND is_workspace_admin(t.workspace_id)))));
CREATE POLICY document_request_items_select ON public.document_request_items AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM document_request_templates t
  WHERE ((t.id = document_request_items.document_request_template_id) AND ((t.workspace_id IS NULL) OR is_workspace_member(t.workspace_id))))));
CREATE POLICY document_request_items_update ON public.document_request_items AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM document_request_templates t
  WHERE ((t.id = document_request_items.document_request_template_id) AND (t.workspace_id IS NOT NULL) AND is_workspace_admin(t.workspace_id)))));
CREATE POLICY document_request_templates_delete ON public.document_request_templates AS PERMISSIVE FOR DELETE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY document_request_templates_insert ON public.document_request_templates AS PERMISSIVE FOR INSERT TO public WITH CHECK (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY document_request_templates_select ON public.document_request_templates AS PERMISSIVE FOR SELECT TO public USING (((workspace_id IS NULL) OR is_workspace_member(workspace_id) OR has_config_object_share_access('document_request_templates'::text, id)));
CREATE POLICY document_request_templates_update ON public.document_request_templates AS PERMISSIVE FOR UPDATE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY document_requests_delete ON public.document_requests AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'documents.request'::text));
CREATE POLICY document_requests_insert ON public.document_requests AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'documents.request'::text));
CREATE POLICY document_requests_select ON public.document_requests AS PERMISSIVE FOR SELECT TO public USING ((has_permission(workspace_id, 'documents.view'::text) OR is_portal_user_for_entity(entity_type, entity_id)));
CREATE POLICY document_requests_update ON public.document_requests AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'documents.request'::text));
CREATE POLICY draft_saves_delete ON public.draft_saves AS PERMISSIVE FOR DELETE TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY draft_saves_insert ON public.draft_saves AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND is_workspace_member(workspace_id)));
CREATE POLICY draft_saves_select ON public.draft_saves AS PERMISSIVE FOR SELECT TO public USING (((user_id = ( SELECT auth.uid() AS uid)) AND is_workspace_member(workspace_id)));
CREATE POLICY draft_saves_update ON public.draft_saves AS PERMISSIVE FOR UPDATE TO public USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY due_date_rules_delete ON public.due_date_rules AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'engagements.manage'::text));
CREATE POLICY due_date_rules_insert ON public.due_date_rules AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'engagements.manage'::text));
CREATE POLICY due_date_rules_select ON public.due_date_rules AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY due_date_rules_update ON public.due_date_rules AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'engagements.manage'::text)) WITH CHECK (has_permission(workspace_id, 'engagements.manage'::text));
CREATE POLICY email_log_select ON public.email_log AS PERMISSIVE FOR SELECT TO public USING (has_permission(workspace_id, 'messages.view'::text));
CREATE POLICY email_log_write ON public.email_log AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'messages.send'::text));
CREATE POLICY email_templates_delete ON public.email_templates AS PERMISSIVE FOR DELETE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY email_templates_insert ON public.email_templates AS PERMISSIVE FOR INSERT TO public WITH CHECK (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY email_templates_select ON public.email_templates AS PERMISSIVE FOR SELECT TO public USING (((workspace_id IS NULL) OR is_workspace_member(workspace_id) OR has_config_object_share_access('email_templates'::text, id)));
CREATE POLICY email_templates_update ON public.email_templates AS PERMISSIVE FOR UPDATE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY engagement_assignment_history_select ON public.engagement_assignment_history AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM engagements e
  WHERE ((e.id = engagement_assignment_history.engagement_id) AND has_permission(e.workspace_id, 'engagements.view'::text)))));
CREATE POLICY engagement_letter_public_signatures_select ON public.engagement_letter_public_signatures AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY engagement_letter_templates_delete ON public.engagement_letter_templates AS PERMISSIVE FOR DELETE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY engagement_letter_templates_insert ON public.engagement_letter_templates AS PERMISSIVE FOR INSERT TO public WITH CHECK (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY engagement_letter_templates_select ON public.engagement_letter_templates AS PERMISSIVE FOR SELECT TO public USING (((workspace_id IS NULL) OR is_workspace_member(workspace_id) OR has_config_object_share_access('engagement_letter_templates'::text, id)));
CREATE POLICY engagement_letter_templates_update ON public.engagement_letter_templates AS PERMISSIVE FOR UPDATE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY engagement_pricing_delete ON public.engagement_pricing AS PERMISSIVE FOR DELETE TO public USING (is_workspace_admin(workspace_id));
CREATE POLICY engagement_pricing_select ON public.engagement_pricing AS PERMISSIVE FOR SELECT TO public USING (has_permission(workspace_id, 'billing.view'::text));
CREATE POLICY engagement_pricing_update ON public.engagement_pricing AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'billing.manage'::text)) WITH CHECK (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY engagement_pricing_write ON public.engagement_pricing AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY engagement_review_actions_select ON public.engagement_review_actions AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM engagement_shares es
  WHERE ((es.id = engagement_review_actions.engagement_share_id) AND (is_workspace_member(es.workspace_id) OR is_workspace_member(es.shared_with_workspace_id))))));
CREATE POLICY engagement_shares_select ON public.engagement_shares AS PERMISSIVE FOR SELECT TO public USING ((is_workspace_member(workspace_id) OR is_workspace_member(shared_with_workspace_id)));
CREATE POLICY engagement_status_history_select ON public.engagement_status_history AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM engagements e
  WHERE ((e.id = engagement_status_history.engagement_id) AND has_permission(e.workspace_id, 'engagements.view'::text)))));
CREATE POLICY engagement_tax_details_delete ON public.engagement_tax_details AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'engagements.manage'::text));
CREATE POLICY engagement_tax_details_insert ON public.engagement_tax_details AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'engagements.manage'::text));
CREATE POLICY engagement_tax_details_select ON public.engagement_tax_details AS PERMISSIVE FOR SELECT TO public USING ((has_permission(workspace_id, 'engagements.view'::text) OR has_pending_engagement_share_access(engagement_id)));
CREATE POLICY engagement_tax_details_update ON public.engagement_tax_details AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'engagements.manage'::text));
CREATE POLICY engagements_delete ON public.engagements AS PERMISSIVE FOR DELETE TO public USING (is_workspace_admin(workspace_id));
CREATE POLICY engagements_insert ON public.engagements AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'engagements.manage'::text));
CREATE POLICY engagements_select ON public.engagements AS PERMISSIVE FOR SELECT TO public USING ((has_permission(workspace_id, 'engagements.view'::text) OR has_pending_engagement_share_access(id) OR is_portal_user_for_entity('engagement'::text, id)));
CREATE POLICY engagements_update ON public.engagements AS PERMISSIVE FOR UPDATE TO public USING ((has_permission(workspace_id, 'engagements.manage'::text) OR has_permission(workspace_id, 'engagements.assign'::text))) WITH CHECK ((has_permission(workspace_id, 'engagements.manage'::text) OR has_permission(workspace_id, 'engagements.assign'::text)));
CREATE POLICY feature_flags_select ON public.feature_flags AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.role() AS role) = 'authenticated'::text));
CREATE POLICY firm_connections_delete ON public.firm_connections AS PERMISSIVE FOR DELETE TO public USING (is_workspace_admin(parent_workspace_id));
CREATE POLICY firm_connections_insert ON public.firm_connections AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_workspace_admin(parent_workspace_id));
CREATE POLICY firm_connections_select ON public.firm_connections AS PERMISSIVE FOR SELECT TO public USING ((is_workspace_member(parent_workspace_id) OR is_workspace_member(child_workspace_id)));
CREATE POLICY firm_connections_select_platform_admin ON public.firm_connections AS PERMISSIVE FOR SELECT TO public USING (is_platform_admin());
CREATE POLICY firm_connections_select_portal_user ON public.firm_connections AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM client_portal_users cpu
  WHERE ((cpu.user_id = auth.uid()) AND (cpu.status = 'active'::text) AND (cpu.workspace_id = firm_connections.child_workspace_id)))));
CREATE POLICY firm_connections_update ON public.firm_connections AS PERMISSIVE FOR UPDATE TO public USING (is_workspace_admin(parent_workspace_id));
CREATE POLICY firm_tax_profile_select ON public.firm_tax_profile AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY internal_message_threads_select ON public.internal_message_threads AS PERMISSIVE FOR SELECT TO public USING ((is_workspace_member(workspace_id) AND ((auth.uid() = user_a_id) OR (auth.uid() = user_b_id))));
CREATE POLICY internal_messages_insert ON public.internal_messages AS PERMISSIVE FOR INSERT TO public WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM internal_message_threads t
  WHERE ((t.id = internal_messages.thread_id) AND is_workspace_member(t.workspace_id) AND ((auth.uid() = t.user_a_id) OR (auth.uid() = t.user_b_id)))))));
CREATE POLICY internal_messages_select ON public.internal_messages AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM internal_message_threads t
  WHERE ((t.id = internal_messages.thread_id) AND is_workspace_member(t.workspace_id) AND ((auth.uid() = t.user_a_id) OR (auth.uid() = t.user_b_id))))));
CREATE POLICY internal_messages_update ON public.internal_messages AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM internal_message_threads t
  WHERE ((t.id = internal_messages.thread_id) AND is_workspace_member(t.workspace_id) AND ((auth.uid() = t.user_a_id) OR (auth.uid() = t.user_b_id)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM internal_message_threads t
  WHERE ((t.id = internal_messages.thread_id) AND is_workspace_member(t.workspace_id) AND ((auth.uid() = t.user_a_id) OR (auth.uid() = t.user_b_id))))));
CREATE POLICY invoices_delete ON public.invoices AS PERMISSIVE FOR DELETE TO public USING (is_workspace_admin(workspace_id));
CREATE POLICY invoices_select ON public.invoices AS PERMISSIVE FOR SELECT TO public USING ((has_permission(workspace_id, 'billing.view'::text) OR is_portal_user(client_id)));
CREATE POLICY invoices_update ON public.invoices AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'billing.manage'::text)) WITH CHECK (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY invoices_write ON public.invoices AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY irs_notices_delete ON public.irs_notices AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'engagements.manage'::text));
CREATE POLICY irs_notices_insert ON public.irs_notices AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'engagements.manage'::text));
CREATE POLICY irs_notices_select ON public.irs_notices AS PERMISSIVE FOR SELECT TO public USING ((has_permission(workspace_id, 'engagements.view'::text) OR is_portal_user_for_entity(entity_type, entity_id)));
CREATE POLICY irs_notices_update ON public.irs_notices AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'engagements.manage'::text));
CREATE POLICY learning_courses_delete ON public.learning_courses AS PERMISSIVE FOR DELETE TO public USING (has_permission(owner_workspace_id, 'learning_hub.manage'::text));
CREATE POLICY learning_courses_insert ON public.learning_courses AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(owner_workspace_id, 'learning_hub.manage'::text));
CREATE POLICY learning_courses_select ON public.learning_courses AS PERMISSIVE FOR SELECT TO public USING ((has_learning_hub_access(owner_workspace_id) AND ((status = 'published'::text) OR is_workspace_member(owner_workspace_id))));
CREATE POLICY learning_courses_update ON public.learning_courses AS PERMISSIVE FOR UPDATE TO public USING (has_permission(owner_workspace_id, 'learning_hub.manage'::text));
CREATE POLICY learning_module_completions_select ON public.learning_module_completions AS PERMISSIVE FOR SELECT TO public USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (learning_modules m
     JOIN learning_courses c ON ((c.id = m.course_id)))
  WHERE ((m.id = learning_module_completions.module_id) AND has_permission(c.owner_workspace_id, 'learning_hub.manage'::text))))));
CREATE POLICY learning_modules_delete ON public.learning_modules AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM learning_courses c
  WHERE ((c.id = learning_modules.course_id) AND has_permission(c.owner_workspace_id, 'learning_hub.manage'::text)))));
CREATE POLICY learning_modules_insert ON public.learning_modules AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM learning_courses c
  WHERE ((c.id = learning_modules.course_id) AND has_permission(c.owner_workspace_id, 'learning_hub.manage'::text)))));
CREATE POLICY learning_modules_select ON public.learning_modules AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM learning_courses c
  WHERE ((c.id = learning_modules.course_id) AND has_learning_hub_access(c.owner_workspace_id) AND ((c.status = 'published'::text) OR is_workspace_member(c.owner_workspace_id))))));
CREATE POLICY learning_modules_update ON public.learning_modules AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM learning_courses c
  WHERE ((c.id = learning_modules.course_id) AND has_permission(c.owner_workspace_id, 'learning_hub.manage'::text)))));
CREATE POLICY learning_quiz_options_delete ON public.learning_quiz_options AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM ((learning_quiz_questions q
     JOIN learning_modules m ON ((m.id = q.module_id)))
     JOIN learning_courses c ON ((c.id = m.course_id)))
  WHERE ((q.id = learning_quiz_options.question_id) AND has_permission(c.owner_workspace_id, 'learning_hub.manage'::text)))));
CREATE POLICY learning_quiz_options_insert ON public.learning_quiz_options AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM ((learning_quiz_questions q
     JOIN learning_modules m ON ((m.id = q.module_id)))
     JOIN learning_courses c ON ((c.id = m.course_id)))
  WHERE ((q.id = learning_quiz_options.question_id) AND has_permission(c.owner_workspace_id, 'learning_hub.manage'::text)))));
CREATE POLICY learning_quiz_options_select ON public.learning_quiz_options AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM ((learning_quiz_questions q
     JOIN learning_modules m ON ((m.id = q.module_id)))
     JOIN learning_courses c ON ((c.id = m.course_id)))
  WHERE ((q.id = learning_quiz_options.question_id) AND has_permission(c.owner_workspace_id, 'learning_hub.manage'::text)))));
CREATE POLICY learning_quiz_options_update ON public.learning_quiz_options AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM ((learning_quiz_questions q
     JOIN learning_modules m ON ((m.id = q.module_id)))
     JOIN learning_courses c ON ((c.id = m.course_id)))
  WHERE ((q.id = learning_quiz_options.question_id) AND has_permission(c.owner_workspace_id, 'learning_hub.manage'::text)))));
CREATE POLICY learning_quiz_questions_delete ON public.learning_quiz_questions AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM (learning_modules m
     JOIN learning_courses c ON ((c.id = m.course_id)))
  WHERE ((m.id = learning_quiz_questions.module_id) AND has_permission(c.owner_workspace_id, 'learning_hub.manage'::text)))));
CREATE POLICY learning_quiz_questions_insert ON public.learning_quiz_questions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM (learning_modules m
     JOIN learning_courses c ON ((c.id = m.course_id)))
  WHERE ((m.id = learning_quiz_questions.module_id) AND has_permission(c.owner_workspace_id, 'learning_hub.manage'::text)))));
CREATE POLICY learning_quiz_questions_select ON public.learning_quiz_questions AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (learning_modules m
     JOIN learning_courses c ON ((c.id = m.course_id)))
  WHERE ((m.id = learning_quiz_questions.module_id) AND has_learning_hub_access(c.owner_workspace_id) AND ((c.status = 'published'::text) OR is_workspace_member(c.owner_workspace_id))))));
CREATE POLICY learning_quiz_questions_update ON public.learning_quiz_questions AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM (learning_modules m
     JOIN learning_courses c ON ((c.id = m.course_id)))
  WHERE ((m.id = learning_quiz_questions.module_id) AND has_permission(c.owner_workspace_id, 'learning_hub.manage'::text)))));
CREATE POLICY library_folders_delete ON public.library_folders AS PERMISSIVE FOR DELETE TO public USING ((is_workspace_member(workspace_id) AND (((item_type = 'pipeline'::text) AND has_permission(workspace_id, 'pipelines.manage'::text)) OR ((item_type = 'workflow'::text) AND has_permission(workspace_id, 'automations.manage'::text)) OR ((item_type = 'website'::text) AND has_permission(workspace_id, 'site_pages.manage'::text)) OR ((item_type = ANY (ARRAY['email_sms_template'::text, 'form_template'::text])) AND is_workspace_admin(workspace_id)))));
CREATE POLICY library_folders_insert ON public.library_folders AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_workspace_member(workspace_id) AND (((item_type = 'pipeline'::text) AND has_permission(workspace_id, 'pipelines.manage'::text)) OR ((item_type = 'workflow'::text) AND has_permission(workspace_id, 'automations.manage'::text)) OR ((item_type = 'website'::text) AND has_permission(workspace_id, 'site_pages.manage'::text)) OR ((item_type = ANY (ARRAY['email_sms_template'::text, 'form_template'::text])) AND is_workspace_admin(workspace_id)))));
CREATE POLICY library_folders_select ON public.library_folders AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY library_folders_update ON public.library_folders AS PERMISSIVE FOR UPDATE TO public USING ((is_workspace_member(workspace_id) AND (((item_type = 'pipeline'::text) AND has_permission(workspace_id, 'pipelines.manage'::text)) OR ((item_type = 'workflow'::text) AND has_permission(workspace_id, 'automations.manage'::text)) OR ((item_type = 'website'::text) AND has_permission(workspace_id, 'site_pages.manage'::text)) OR ((item_type = ANY (ARRAY['email_sms_template'::text, 'form_template'::text])) AND is_workspace_admin(workspace_id)))));
CREATE POLICY login_history_select ON public.login_history AS PERMISSIVE FOR SELECT TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id))));
CREATE POLICY message_threads_delete ON public.message_threads AS PERMISSIVE FOR DELETE TO public USING (is_workspace_admin(workspace_id));
CREATE POLICY message_threads_select ON public.message_threads AS PERMISSIVE FOR SELECT TO public USING ((has_permission(workspace_id, 'messages.view'::text) OR is_portal_user_for_entity(entity_type, entity_id)));
CREATE POLICY message_threads_update ON public.message_threads AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'messages.view'::text)) WITH CHECK (has_permission(workspace_id, 'messages.view'::text));
CREATE POLICY message_threads_write ON public.message_threads AS PERMISSIVE FOR INSERT TO public WITH CHECK ((has_permission(workspace_id, 'messages.view'::text) OR ((entity_type = 'client'::text) AND is_portal_user(entity_id) AND (created_by = ( SELECT auth.uid() AS uid)))));
CREATE POLICY messages_delete ON public.messages AS PERMISSIVE FOR DELETE TO public USING (is_workspace_admin(workspace_id));
CREATE POLICY messages_select ON public.messages AS PERMISSIVE FOR SELECT TO public USING ((has_permission(workspace_id, 'messages.view'::text) OR ((is_internal = false) AND (EXISTS ( SELECT 1
   FROM message_threads t
  WHERE ((t.id = messages.thread_id) AND is_portal_user_for_entity(t.entity_type, t.entity_id)))))));
CREATE POLICY messages_update ON public.messages AS PERMISSIVE FOR UPDATE TO public USING ((has_permission(workspace_id, 'messages.view'::text) OR (EXISTS ( SELECT 1
   FROM message_threads t
  WHERE ((t.id = messages.thread_id) AND is_portal_user_for_entity(t.entity_type, t.entity_id)))))) WITH CHECK ((has_permission(workspace_id, 'messages.view'::text) OR (EXISTS ( SELECT 1
   FROM message_threads t
  WHERE ((t.id = messages.thread_id) AND is_portal_user_for_entity(t.entity_type, t.entity_id))))));
CREATE POLICY messages_write ON public.messages AS PERMISSIVE FOR INSERT TO public WITH CHECK ((has_permission(workspace_id, 'messages.send'::text) OR (is_internal AND has_permission(workspace_id, 'messages.internal_note'::text)) OR ((sender_type = 'client'::text) AND (is_internal = false) AND (sender_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM message_threads t
  WHERE ((t.id = messages.thread_id) AND is_portal_user_for_entity(t.entity_type, t.entity_id)))))));
CREATE POLICY network_message_threads_select ON public.network_message_threads AS PERMISSIVE FOR SELECT TO public USING ((is_workspace_member(workspace_a_id) OR is_workspace_member(workspace_b_id)));
CREATE POLICY network_messages_insert ON public.network_messages AS PERMISSIVE FOR INSERT TO public WITH CHECK (((sender_user_id = auth.uid()) AND is_workspace_member(sender_workspace_id) AND (EXISTS ( SELECT 1
   FROM network_message_threads t
  WHERE ((t.id = network_messages.thread_id) AND ((network_messages.sender_workspace_id = t.workspace_a_id) OR (network_messages.sender_workspace_id = t.workspace_b_id)))))));
CREATE POLICY network_messages_select ON public.network_messages AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM network_message_threads t
  WHERE ((t.id = network_messages.thread_id) AND (is_workspace_member(t.workspace_a_id) OR is_workspace_member(t.workspace_b_id))))));
CREATE POLICY network_messages_update ON public.network_messages AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM network_message_threads t
  WHERE ((t.id = network_messages.thread_id) AND (is_workspace_member(t.workspace_a_id) OR is_workspace_member(t.workspace_b_id))))));
CREATE POLICY notes_delete ON public.notes AS PERMISSIVE FOR DELETE TO public USING (((author_id = ( SELECT auth.uid() AS uid)) OR is_workspace_admin(workspace_id)));
CREATE POLICY notes_insert ON public.notes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((is_workspace_member(workspace_id) AND (author_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY notes_select ON public.notes AS PERMISSIVE FOR SELECT TO public USING ((is_workspace_member(workspace_id) AND ((NOT is_private) OR (author_id = ( SELECT auth.uid() AS uid)) OR is_workspace_admin(workspace_id))));
CREATE POLICY notes_update ON public.notes AS PERMISSIVE FOR UPDATE TO public USING (((author_id = ( SELECT auth.uid() AS uid)) OR is_workspace_admin(workspace_id))) WITH CHECK (((author_id = ( SELECT auth.uid() AS uid)) OR is_workspace_admin(workspace_id)));
CREATE POLICY notification_preferences_delete ON public.notification_preferences AS PERMISSIVE FOR DELETE TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY notification_preferences_insert ON public.notification_preferences AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY notification_preferences_select ON public.notification_preferences AS PERMISSIVE FOR SELECT TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY notification_preferences_update ON public.notification_preferences AS PERMISSIVE FOR UPDATE TO public USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY notification_queue_insert ON public.notification_queue AS PERMISSIVE FOR INSERT TO public WITH CHECK (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY notification_queue_select ON public.notification_queue AS PERMISSIVE FOR SELECT TO public USING (((recipient_user_id = ( SELECT auth.uid() AS uid)) OR ((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)) OR is_platform_it()));
CREATE POLICY office_locations_delete ON public.office_locations AS PERMISSIVE FOR DELETE TO public USING (is_workspace_admin(workspace_id));
CREATE POLICY office_locations_insert ON public.office_locations AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_workspace_admin(workspace_id));
CREATE POLICY office_locations_select ON public.office_locations AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY office_locations_update ON public.office_locations AS PERMISSIVE FOR UPDATE TO public USING (is_workspace_admin(workspace_id)) WITH CHECK (is_workspace_admin(workspace_id));
CREATE POLICY organizer_fields_delete ON public.organizer_fields AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM organizer_templates t
  WHERE ((t.id = organizer_fields.organizer_template_id) AND (t.workspace_id IS NOT NULL) AND is_workspace_admin(t.workspace_id)))));
CREATE POLICY organizer_fields_insert ON public.organizer_fields AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM organizer_templates t
  WHERE ((t.id = organizer_fields.organizer_template_id) AND (t.workspace_id IS NOT NULL) AND is_workspace_admin(t.workspace_id)))));
CREATE POLICY organizer_fields_select ON public.organizer_fields AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM organizer_templates t
  WHERE ((t.id = organizer_fields.organizer_template_id) AND ((t.workspace_id IS NULL) OR is_workspace_member(t.workspace_id) OR is_portal_member(t.workspace_id))))));
CREATE POLICY organizer_fields_update ON public.organizer_fields AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM organizer_templates t
  WHERE ((t.id = organizer_fields.organizer_template_id) AND (t.workspace_id IS NOT NULL) AND is_workspace_admin(t.workspace_id)))));
CREATE POLICY organizer_information_request_items_select ON public.organizer_information_request_items AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (organizer_information_requests req
     JOIN organizer_responses r ON ((r.id = req.organizer_response_id)))
  WHERE ((req.id = organizer_information_request_items.request_id) AND (has_permission(req.workspace_id, 'organizers.review'::text) OR is_portal_user(r.client_id))))));
CREATE POLICY organizer_information_requests_select ON public.organizer_information_requests AS PERMISSIVE FOR SELECT TO public USING ((has_permission(workspace_id, 'organizers.review'::text) OR (EXISTS ( SELECT 1
   FROM organizer_responses r
  WHERE ((r.id = organizer_information_requests.organizer_response_id) AND is_portal_user(r.client_id))))));
CREATE POLICY organizer_response_answers_delete ON public.organizer_response_answers AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM organizer_responses r
  WHERE ((r.id = organizer_response_answers.organizer_response_id) AND has_permission(r.workspace_id, 'engagements.manage'::text)))));
CREATE POLICY organizer_response_answers_insert ON public.organizer_response_answers AS PERMISSIVE FOR INSERT TO public WITH CHECK (((EXISTS ( SELECT 1
   FROM organizer_responses r
  WHERE ((r.id = organizer_response_answers.organizer_response_id) AND has_permission(r.workspace_id, 'engagements.manage'::text)))) OR (EXISTS ( SELECT 1
   FROM organizer_responses r
  WHERE ((r.id = organizer_response_answers.organizer_response_id) AND is_portal_user(r.client_id) AND (r.status = ANY (ARRAY['not_started'::text, 'in_progress'::text])))))));
CREATE POLICY organizer_response_answers_select ON public.organizer_response_answers AS PERMISSIVE FOR SELECT TO public USING (((EXISTS ( SELECT 1
   FROM organizer_responses r
  WHERE ((r.id = organizer_response_answers.organizer_response_id) AND (has_permission(r.workspace_id, 'engagements.view'::text) OR is_portal_user(r.client_id))))) OR (EXISTS ( SELECT 1
   FROM organizer_responses r
  WHERE ((r.id = organizer_response_answers.organizer_response_id) AND has_pending_engagement_share_access(r.engagement_id))))));
CREATE POLICY organizer_response_answers_update ON public.organizer_response_answers AS PERMISSIVE FOR UPDATE TO public USING (((EXISTS ( SELECT 1
   FROM organizer_responses r
  WHERE ((r.id = organizer_response_answers.organizer_response_id) AND has_permission(r.workspace_id, 'engagements.manage'::text)))) OR (EXISTS ( SELECT 1
   FROM organizer_responses r
  WHERE ((r.id = organizer_response_answers.organizer_response_id) AND is_portal_user(r.client_id) AND (r.status = ANY (ARRAY['not_started'::text, 'in_progress'::text])))))));
CREATE POLICY organizer_responses_delete ON public.organizer_responses AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'engagements.manage'::text));
CREATE POLICY organizer_responses_insert ON public.organizer_responses AS PERMISSIVE FOR INSERT TO public WITH CHECK ((has_permission(workspace_id, 'engagements.manage'::text) OR (is_portal_user(client_id) AND (status = ANY (ARRAY['not_started'::text, 'in_progress'::text])))));
CREATE POLICY organizer_responses_select ON public.organizer_responses AS PERMISSIVE FOR SELECT TO public USING ((has_permission(workspace_id, 'engagements.view'::text) OR is_portal_user(client_id) OR has_pending_engagement_share_access(engagement_id)));
CREATE POLICY organizer_responses_update ON public.organizer_responses AS PERMISSIVE FOR UPDATE TO public USING ((has_permission(workspace_id, 'engagements.manage'::text) OR (is_portal_user(client_id) AND (status = ANY (ARRAY['not_started'::text, 'in_progress'::text])))));
CREATE POLICY organizer_service_routes_delete ON public.organizer_service_routes AS PERMISSIVE FOR DELETE TO public USING (is_workspace_admin(workspace_id));
CREATE POLICY organizer_service_routes_insert ON public.organizer_service_routes AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_workspace_admin(workspace_id));
CREATE POLICY organizer_service_routes_select ON public.organizer_service_routes AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY organizer_service_routes_update ON public.organizer_service_routes AS PERMISSIVE FOR UPDATE TO public USING (is_workspace_admin(workspace_id));
CREATE POLICY organizer_templates_delete ON public.organizer_templates AS PERMISSIVE FOR DELETE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY organizer_templates_insert ON public.organizer_templates AS PERMISSIVE FOR INSERT TO public WITH CHECK (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY organizer_templates_select ON public.organizer_templates AS PERMISSIVE FOR SELECT TO public USING (((workspace_id IS NULL) OR is_workspace_member(workspace_id) OR has_config_object_share_access('organizer_templates'::text, id) OR is_portal_member(workspace_id)));
CREATE POLICY organizer_templates_update ON public.organizer_templates AS PERMISSIVE FOR UPDATE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY payment_methods_delete ON public.payment_methods AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY payment_methods_select ON public.payment_methods AS PERMISSIVE FOR SELECT TO public USING (has_permission(workspace_id, 'billing.view'::text));
CREATE POLICY payment_methods_update ON public.payment_methods AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'billing.manage'::text)) WITH CHECK (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY payment_methods_write ON public.payment_methods AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY payment_plans_delete ON public.payment_plans AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY payment_plans_insert ON public.payment_plans AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY payment_plans_select ON public.payment_plans AS PERMISSIVE FOR SELECT TO public USING ((has_permission(workspace_id, 'billing.view'::text) OR (EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = payment_plans.invoice_id) AND is_portal_user(i.client_id))))));
CREATE POLICY payment_plans_update ON public.payment_plans AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY payments_delete ON public.payments AS PERMISSIVE FOR DELETE TO public USING (is_workspace_admin(workspace_id));
CREATE POLICY payments_select ON public.payments AS PERMISSIVE FOR SELECT TO public USING ((has_permission(workspace_id, 'billing.view'::text) OR is_portal_user(client_id)));
CREATE POLICY payments_update ON public.payments AS PERMISSIVE FOR UPDATE TO public USING ((has_permission(workspace_id, 'billing.manage'::text) OR has_permission(workspace_id, 'billing.refund'::text))) WITH CHECK ((has_permission(workspace_id, 'billing.manage'::text) OR has_permission(workspace_id, 'billing.refund'::text)));
CREATE POLICY payments_write ON public.payments AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY pending_engagement_letter_sends_select ON public.pending_engagement_letter_sends AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY pending_portal_invites_select ON public.pending_portal_invites AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY permissions_select ON public.permissions AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.role() AS role) = 'authenticated'::text));
CREATE POLICY pipeline_runs_select ON public.pipeline_runs AS PERMISSIVE FOR SELECT TO public USING (
CASE entity_type
    WHEN 'client'::text THEN has_permission(workspace_id, 'clients.view'::text)
    WHEN 'engagement'::text THEN has_permission(workspace_id, 'engagements.view'::text)
    ELSE false
END);
CREATE POLICY pipeline_runs_update ON public.pipeline_runs AS PERMISSIVE FOR UPDATE TO public USING (
CASE entity_type
    WHEN 'client'::text THEN has_permission(workspace_id, 'clients.edit'::text)
    WHEN 'engagement'::text THEN has_permission(workspace_id, 'engagements.manage'::text)
    ELSE false
END);
CREATE POLICY pipeline_stages_select ON public.pipeline_stages AS PERMISSIVE FOR SELECT TO public USING (
CASE entity_type
    WHEN 'client'::text THEN has_permission(workspace_id, 'clients.view'::text)
    WHEN 'engagement'::text THEN has_permission(workspace_id, 'engagements.view'::text)
    ELSE false
END);
CREATE POLICY pipeline_stages_update ON public.pipeline_stages AS PERMISSIVE FOR UPDATE TO public USING (
CASE entity_type
    WHEN 'client'::text THEN has_permission(workspace_id, 'clients.edit'::text)
    WHEN 'engagement'::text THEN (has_permission(workspace_id, 'engagements.manage'::text) OR (( SELECT auth.uid() AS uid) = assigned_staff_id))
    ELSE false
END) WITH CHECK (
CASE entity_type
    WHEN 'client'::text THEN has_permission(workspace_id, 'clients.edit'::text)
    WHEN 'engagement'::text THEN (has_permission(workspace_id, 'engagements.manage'::text) OR (( SELECT auth.uid() AS uid) = assigned_staff_id))
    ELSE false
END);
CREATE POLICY platform_subscription_plans_admin_write ON public.platform_subscription_plans AS PERMISSIVE FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY platform_subscription_plans_select ON public.platform_subscription_plans AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY platform_system_credentials_select ON public.platform_system_credentials AS PERMISSIVE FOR SELECT TO public USING (is_platform_it());
CREATE POLICY pricing_rules_delete ON public.pricing_rules AS PERMISSIVE FOR DELETE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY pricing_rules_insert ON public.pricing_rules AS PERMISSIVE FOR INSERT TO public WITH CHECK (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY pricing_rules_select ON public.pricing_rules AS PERMISSIVE FOR SELECT TO public USING (((workspace_id IS NULL) OR is_workspace_member(workspace_id) OR has_config_object_share_access('pricing_rules'::text, id)));
CREATE POLICY pricing_rules_update ON public.pricing_rules AS PERMISSIVE FOR UPDATE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY process_stages_delete ON public.process_stages AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM processes p
  WHERE ((p.id = process_stages.process_id) AND (p.workspace_id IS NOT NULL) AND has_permission(p.workspace_id, 'pipelines.manage'::text)))));
CREATE POLICY process_stages_insert ON public.process_stages AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM processes p
  WHERE ((p.id = process_stages.process_id) AND (p.workspace_id IS NOT NULL) AND has_permission(p.workspace_id, 'pipelines.manage'::text)))));
CREATE POLICY process_stages_select ON public.process_stages AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM processes p
  WHERE ((p.id = process_stages.process_id) AND ((p.workspace_id IS NULL) OR is_workspace_member(p.workspace_id))))));
CREATE POLICY process_stages_update ON public.process_stages AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM processes p
  WHERE ((p.id = process_stages.process_id) AND (p.workspace_id IS NOT NULL) AND has_permission(p.workspace_id, 'pipelines.manage'::text)))));
CREATE POLICY process_tasks_delete ON public.process_tasks AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM (process_stages ps
     JOIN processes p ON ((p.id = ps.process_id)))
  WHERE ((ps.id = process_tasks.process_stage_id) AND (p.workspace_id IS NOT NULL) AND has_permission(p.workspace_id, 'pipelines.manage'::text)))));
CREATE POLICY process_tasks_insert ON public.process_tasks AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM (process_stages ps
     JOIN processes p ON ((p.id = ps.process_id)))
  WHERE ((ps.id = process_tasks.process_stage_id) AND (p.workspace_id IS NOT NULL) AND has_permission(p.workspace_id, 'pipelines.manage'::text)))));
CREATE POLICY process_tasks_select ON public.process_tasks AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (process_stages ps
     JOIN processes p ON ((p.id = ps.process_id)))
  WHERE ((ps.id = process_tasks.process_stage_id) AND ((p.workspace_id IS NULL) OR is_workspace_member(p.workspace_id))))));
CREATE POLICY process_tasks_update ON public.process_tasks AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM (process_stages ps
     JOIN processes p ON ((p.id = ps.process_id)))
  WHERE ((ps.id = process_tasks.process_stage_id) AND (p.workspace_id IS NOT NULL) AND has_permission(p.workspace_id, 'pipelines.manage'::text)))));
CREATE POLICY processes_delete ON public.processes AS PERMISSIVE FOR DELETE TO public USING (((workspace_id IS NOT NULL) AND has_permission(workspace_id, 'pipelines.manage'::text)));
CREATE POLICY processes_insert ON public.processes AS PERMISSIVE FOR INSERT TO public WITH CHECK (((workspace_id IS NOT NULL) AND has_permission(workspace_id, 'pipelines.manage'::text)));
CREATE POLICY processes_select ON public.processes AS PERMISSIVE FOR SELECT TO public USING (((workspace_id IS NULL) OR is_workspace_member(workspace_id) OR has_config_object_share_access('processes'::text, id)));
CREATE POLICY processes_update ON public.processes AS PERMISSIVE FOR UPDATE TO public USING (((workspace_id IS NOT NULL) AND has_permission(workspace_id, 'pipelines.manage'::text)));
CREATE POLICY provider_status_select ON public.provider_status AS PERMISSIVE FOR SELECT TO public USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
CREATE POLICY quotes_delete ON public.quotes AS PERMISSIVE FOR DELETE TO public USING (is_workspace_admin(workspace_id));
CREATE POLICY quotes_select ON public.quotes AS PERMISSIVE FOR SELECT TO public USING ((has_permission(workspace_id, 'billing.view'::text) OR is_portal_user(client_id)));
CREATE POLICY quotes_update ON public.quotes AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'billing.manage'::text)) WITH CHECK (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY quotes_write ON public.quotes AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY recurring_billing_delete ON public.recurring_billing AS PERMISSIVE FOR DELETE TO public USING (is_workspace_admin(workspace_id));
CREATE POLICY recurring_billing_select ON public.recurring_billing AS PERMISSIVE FOR SELECT TO public USING (has_permission(workspace_id, 'billing.view'::text));
CREATE POLICY recurring_billing_update ON public.recurring_billing AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'billing.manage'::text)) WITH CHECK (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY recurring_billing_write ON public.recurring_billing AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'billing.manage'::text));
CREATE POLICY role_permission_overrides_select ON public.role_permission_overrides AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY role_permission_overrides_write ON public.role_permission_overrides AS PERMISSIVE FOR ALL TO public USING (has_permission(workspace_id, 'roles.manage'::text)) WITH CHECK (has_permission(workspace_id, 'roles.manage'::text));
CREATE POLICY role_permissions_delete ON public.role_permissions AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM roles r
  WHERE ((r.id = role_permissions.role_id) AND (r.workspace_id IS NOT NULL) AND has_permission(r.workspace_id, 'roles.manage'::text)))));
CREATE POLICY role_permissions_insert ON public.role_permissions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM roles r
  WHERE ((r.id = role_permissions.role_id) AND (r.workspace_id IS NOT NULL) AND has_permission(r.workspace_id, 'roles.manage'::text)))));
CREATE POLICY role_permissions_select ON public.role_permissions AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM roles r
  WHERE ((r.id = role_permissions.role_id) AND ((r.workspace_id IS NULL) OR is_workspace_member(r.workspace_id))))));
CREATE POLICY roles_delete ON public.roles AS PERMISSIVE FOR DELETE TO public USING (((workspace_id IS NOT NULL) AND has_permission(workspace_id, 'roles.manage'::text)));
CREATE POLICY roles_insert ON public.roles AS PERMISSIVE FOR INSERT TO public WITH CHECK (((workspace_id IS NOT NULL) AND has_permission(workspace_id, 'roles.manage'::text)));
CREATE POLICY roles_select ON public.roles AS PERMISSIVE FOR SELECT TO public USING (((workspace_id IS NULL) OR is_workspace_member(workspace_id)));
CREATE POLICY roles_update ON public.roles AS PERMISSIVE FOR UPDATE TO public USING (((workspace_id IS NOT NULL) AND has_permission(workspace_id, 'roles.manage'::text)));
CREATE POLICY service_categories_delete ON public.service_categories AS PERMISSIVE FOR DELETE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY service_categories_insert ON public.service_categories AS PERMISSIVE FOR INSERT TO public WITH CHECK (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY service_categories_select ON public.service_categories AS PERMISSIVE FOR SELECT TO public USING (((workspace_id IS NULL) OR is_workspace_member(workspace_id) OR has_config_object_share_access('service_categories'::text, id)));
CREATE POLICY service_categories_update ON public.service_categories AS PERMISSIVE FOR UPDATE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY services_delete ON public.services AS PERMISSIVE FOR DELETE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY services_insert ON public.services AS PERMISSIVE FOR INSERT TO public WITH CHECK (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY services_select ON public.services AS PERMISSIVE FOR SELECT TO public USING (((workspace_id IS NULL) OR is_workspace_member(workspace_id) OR has_config_object_share_access('services'::text, id) OR is_portal_member(workspace_id)));
CREATE POLICY services_update ON public.services AS PERMISSIVE FOR UPDATE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY signature_request_signers_delete ON public.signature_request_signers AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM signature_requests r
  WHERE ((r.id = signature_request_signers.signature_request_id) AND has_permission(r.workspace_id, 'signatures.request'::text)))));
CREATE POLICY signature_request_signers_insert ON public.signature_request_signers AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM signature_requests r
  WHERE ((r.id = signature_request_signers.signature_request_id) AND has_permission(r.workspace_id, 'signatures.request'::text)))));
CREATE POLICY signature_request_signers_select ON public.signature_request_signers AS PERMISSIVE FOR SELECT TO public USING (((EXISTS ( SELECT 1
   FROM signature_requests r
  WHERE ((r.id = signature_request_signers.signature_request_id) AND has_permission(r.workspace_id, 'signatures.view'::text)))) OR (EXISTS ( SELECT 1
   FROM (signature_requests r
     JOIN attachments a ON ((a.id = r.attachment_id)))
  WHERE ((r.id = signature_request_signers.signature_request_id) AND is_portal_user_for_entity(a.entity_type, a.entity_id))))));
CREATE POLICY signature_request_signers_update ON public.signature_request_signers AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM signature_requests r
  WHERE ((r.id = signature_request_signers.signature_request_id) AND has_permission(r.workspace_id, 'signatures.request'::text)))));
CREATE POLICY signature_requests_delete ON public.signature_requests AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'signatures.request'::text));
CREATE POLICY signature_requests_insert ON public.signature_requests AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'signatures.request'::text));
CREATE POLICY signature_requests_select ON public.signature_requests AS PERMISSIVE FOR SELECT TO public USING ((has_permission(workspace_id, 'signatures.view'::text) OR (EXISTS ( SELECT 1
   FROM attachments a
  WHERE ((a.id = signature_requests.attachment_id) AND is_portal_user_for_entity(a.entity_type, a.entity_id))))));
CREATE POLICY signature_requests_update ON public.signature_requests AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'signatures.request'::text));
CREATE POLICY site_funnels_delete ON public.site_funnels AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'site_pages.manage'::text));
CREATE POLICY site_funnels_insert ON public.site_funnels AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'site_pages.manage'::text));
CREATE POLICY site_funnels_select ON public.site_funnels AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY site_funnels_update ON public.site_funnels AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'site_pages.manage'::text));
CREATE POLICY site_page_sections_delete ON public.site_page_sections AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM site_pages p
  WHERE ((p.id = site_page_sections.page_id) AND has_permission(p.workspace_id, 'site_pages.manage'::text)))));
CREATE POLICY site_page_sections_insert ON public.site_page_sections AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM site_pages p
  WHERE ((p.id = site_page_sections.page_id) AND has_permission(p.workspace_id, 'site_pages.manage'::text)))));
CREATE POLICY site_page_sections_select ON public.site_page_sections AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM site_pages p
  WHERE ((p.id = site_page_sections.page_id) AND is_workspace_member(p.workspace_id)))));
CREATE POLICY site_page_sections_update ON public.site_page_sections AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM site_pages p
  WHERE ((p.id = site_page_sections.page_id) AND has_permission(p.workspace_id, 'site_pages.manage'::text)))));
CREATE POLICY site_pages_delete ON public.site_pages AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'site_pages.manage'::text));
CREATE POLICY site_pages_insert ON public.site_pages AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'site_pages.manage'::text));
CREATE POLICY site_pages_select ON public.site_pages AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY site_pages_update ON public.site_pages AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'site_pages.manage'::text));
CREATE POLICY site_websites_delete ON public.site_websites AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'site_pages.manage'::text));
CREATE POLICY site_websites_insert ON public.site_websites AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'site_pages.manage'::text));
CREATE POLICY site_websites_select ON public.site_websites AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY site_websites_update ON public.site_websites AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'site_pages.manage'::text));
CREATE POLICY sms_log_select ON public.sms_log AS PERMISSIVE FOR SELECT TO public USING (has_permission(workspace_id, 'messages.view'::text));
CREATE POLICY sms_log_write ON public.sms_log AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'messages.send'::text));
CREATE POLICY sms_templates_delete ON public.sms_templates AS PERMISSIVE FOR DELETE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY sms_templates_insert ON public.sms_templates AS PERMISSIVE FOR INSERT TO public WITH CHECK (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY sms_templates_select ON public.sms_templates AS PERMISSIVE FOR SELECT TO public USING (((workspace_id IS NULL) OR is_workspace_member(workspace_id) OR has_config_object_share_access('sms_templates'::text, id)));
CREATE POLICY sms_templates_update ON public.sms_templates AS PERMISSIVE FOR UPDATE TO public USING (((workspace_id IS NOT NULL) AND is_workspace_admin(workspace_id)));
CREATE POLICY system_failure_log_select ON public.system_failure_log AS PERMISSIVE FOR SELECT TO public USING (is_platform_it());
CREATE POLICY system_settings_delete ON public.system_settings AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'settings.manage'::text));
CREATE POLICY system_settings_insert ON public.system_settings AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'settings.manage'::text));
CREATE POLICY system_settings_select ON public.system_settings AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY system_settings_update ON public.system_settings AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'settings.manage'::text)) WITH CHECK (has_permission(workspace_id, 'settings.manage'::text));
CREATE POLICY task_dependencies_delete ON public.task_dependencies AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'engagements.manage'::text));
CREATE POLICY task_dependencies_select ON public.task_dependencies AS PERMISSIVE FOR SELECT TO public USING (has_permission(workspace_id, 'engagements.view'::text));
CREATE POLICY task_dependencies_write ON public.task_dependencies AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'engagements.manage'::text));
CREATE POLICY tasks_delete ON public.tasks AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'engagements.manage'::text));
CREATE POLICY tasks_insert ON public.tasks AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'engagements.manage'::text));
CREATE POLICY tasks_select ON public.tasks AS PERMISSIVE FOR SELECT TO public USING (has_permission(workspace_id, 'engagements.view'::text));
CREATE POLICY tasks_select_portal ON public.tasks AS PERMISSIVE FOR SELECT TO public USING (((visibility = 'client'::text) AND (((client_id IS NOT NULL) AND is_portal_user(client_id)) OR ((engagement_id IS NOT NULL) AND is_portal_accessible_entity_id(engagement_id)))));
CREATE POLICY tasks_update ON public.tasks AS PERMISSIVE FOR UPDATE TO public USING ((has_permission(workspace_id, 'engagements.manage'::text) OR (( SELECT auth.uid() AS uid) = assigned_staff_id))) WITH CHECK ((has_permission(workspace_id, 'engagements.manage'::text) OR (( SELECT auth.uid() AS uid) = assigned_staff_id)));
CREATE POLICY tax_years_select_all ON public.tax_years AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY trusted_devices_delete ON public.trusted_devices AS PERMISSIVE FOR DELETE TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY trusted_devices_insert ON public.trusted_devices AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY trusted_devices_select ON public.trusted_devices AS PERMISSIVE FOR SELECT TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY trusted_devices_update ON public.trusted_devices AS PERMISSIVE FOR UPDATE TO public USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY user_calendar_connections_select ON public.user_calendar_connections AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY user_profiles_insert_self ON public.user_profiles AS PERMISSIVE FOR INSERT TO public WITH CHECK ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY user_profiles_select ON public.user_profiles AS PERMISSIVE FOR SELECT TO public USING (((id = ( SELECT auth.uid() AS uid)) OR is_platform_it() OR (EXISTS ( SELECT 1
   FROM (workspace_users a
     JOIN workspace_users b ON ((b.workspace_id = a.workspace_id)))
  WHERE ((a.user_id = ( SELECT auth.uid() AS uid)) AND (a.status = 'active'::text) AND (b.user_id = user_profiles.id) AND (b.status = 'active'::text))))));
CREATE POLICY user_profiles_update_self ON public.user_profiles AS PERMISSIVE FOR UPDATE TO public USING ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY user_widget_preferences_delete ON public.user_widget_preferences AS PERMISSIVE FOR DELETE TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY user_widget_preferences_insert ON public.user_widget_preferences AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY user_widget_preferences_select ON public.user_widget_preferences AS PERMISSIVE FOR SELECT TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY user_widget_preferences_update ON public.user_widget_preferences AS PERMISSIVE FOR UPDATE TO public USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY user_zoom_connections_select ON public.user_zoom_connections AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY webhook_events_select ON public.webhook_events AS PERMISSIVE FOR SELECT TO public USING ((((workspace_id IS NOT NULL) AND is_workspace_member(workspace_id)) OR is_platform_admin()));
CREATE POLICY workspace_billing_charge_attempts_select ON public.workspace_billing_charge_attempts AS PERMISSIVE FOR SELECT TO public USING (is_workspace_admin(workspace_id));
CREATE POLICY workspace_email_domains_delete ON public.workspace_email_domains AS PERMISSIVE FOR DELETE TO authenticated USING (has_permission(workspace_id, 'settings.manage'::text));
CREATE POLICY workspace_email_domains_insert ON public.workspace_email_domains AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_permission(workspace_id, 'settings.manage'::text));
CREATE POLICY workspace_email_domains_select ON public.workspace_email_domains AS PERMISSIVE FOR SELECT TO authenticated USING (has_permission(workspace_id, 'settings.manage'::text));
CREATE POLICY workspace_email_domains_update ON public.workspace_email_domains AS PERMISSIVE FOR UPDATE TO authenticated USING (has_permission(workspace_id, 'settings.manage'::text)) WITH CHECK (has_permission(workspace_id, 'settings.manage'::text));
CREATE POLICY workspace_feature_flags_delete ON public.workspace_feature_flags AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'feature_flags.manage'::text));
CREATE POLICY workspace_feature_flags_insert ON public.workspace_feature_flags AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'feature_flags.manage'::text));
CREATE POLICY workspace_feature_flags_select ON public.workspace_feature_flags AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY workspace_feature_flags_update ON public.workspace_feature_flags AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'feature_flags.manage'::text)) WITH CHECK (has_permission(workspace_id, 'feature_flags.manage'::text));
CREATE POLICY workspace_invitations_insert ON public.workspace_invitations AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'users.invite'::text));
CREATE POLICY workspace_invitations_select ON public.workspace_invitations AS PERMISSIVE FOR SELECT TO public USING (has_permission(workspace_id, 'users.invite'::text));
CREATE POLICY workspace_invitations_update ON public.workspace_invitations AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'users.remove'::text)) WITH CHECK (has_permission(workspace_id, 'users.remove'::text));
CREATE POLICY workspace_retention_policies_delete ON public.workspace_retention_policies AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'security.manage'::text));
CREATE POLICY workspace_retention_policies_insert ON public.workspace_retention_policies AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'security.manage'::text));
CREATE POLICY workspace_retention_policies_select ON public.workspace_retention_policies AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY workspace_retention_policies_update ON public.workspace_retention_policies AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'security.manage'::text)) WITH CHECK (has_permission(workspace_id, 'security.manage'::text));
CREATE POLICY workspace_security_policies_delete ON public.workspace_security_policies AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'security.manage'::text));
CREATE POLICY workspace_security_policies_insert ON public.workspace_security_policies AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'security.manage'::text));
CREATE POLICY workspace_security_policies_select ON public.workspace_security_policies AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY workspace_security_policies_update ON public.workspace_security_policies AS PERMISSIVE FOR UPDATE TO public USING (has_permission(workspace_id, 'security.manage'::text)) WITH CHECK (has_permission(workspace_id, 'security.manage'::text));
CREATE POLICY workspace_subscription_invoices_select ON public.workspace_subscription_invoices AS PERMISSIVE FOR SELECT TO authenticated USING ((is_workspace_member(workspace_id) OR is_platform_admin()));
CREATE POLICY workspace_subscriptions_select ON public.workspace_subscriptions AS PERMISSIVE FOR SELECT TO authenticated USING ((is_workspace_member(workspace_id) OR is_platform_admin()));
CREATE POLICY workspace_tags_no_direct_write ON public.workspace_tags AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY workspace_tags_select ON public.workspace_tags AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY "Platform admins can view usage meters" ON public.workspace_usage_meters AS PERMISSIVE FOR SELECT TO public USING (is_platform_admin());
CREATE POLICY "Workspace members can view their own usage meters" ON public.workspace_usage_meters AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY workspace_users_delete ON public.workspace_users AS PERMISSIVE FOR DELETE TO public USING (has_permission(workspace_id, 'users.remove'::text));
CREATE POLICY workspace_users_insert ON public.workspace_users AS PERMISSIVE FOR INSERT TO public WITH CHECK (has_permission(workspace_id, 'users.manage'::text));
CREATE POLICY workspace_users_select ON public.workspace_users AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(workspace_id));
CREATE POLICY workspace_users_select_platform_admin ON public.workspace_users AS PERMISSIVE FOR SELECT TO public USING (is_platform_admin());
CREATE POLICY workspace_users_update ON public.workspace_users AS PERMISSIVE FOR UPDATE TO public USING ((has_permission(workspace_id, 'users.manage'::text) OR ((user_id = auth.uid()) AND (status = 'invited'::text))));
CREATE POLICY workspaces_delete ON public.workspaces AS PERMISSIVE FOR DELETE TO public USING (is_platform_admin());
CREATE POLICY workspaces_insert ON public.workspaces AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_platform_admin());
CREATE POLICY workspaces_select ON public.workspaces AS PERMISSIVE FOR SELECT TO public USING (is_workspace_member(id));
CREATE POLICY workspaces_select_platform_admin ON public.workspaces AS PERMISSIVE FOR SELECT TO public USING (is_platform_it());
CREATE POLICY workspaces_update ON public.workspaces AS PERMISSIVE FOR UPDATE TO public USING (has_permission(id, 'workspace.manage'::text));
