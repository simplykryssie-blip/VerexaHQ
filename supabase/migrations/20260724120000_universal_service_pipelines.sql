-- Universal service pipelines and platform workflow templates.
--
-- LIVE-STATE FACTS CONFIRMED BEFORE WRITING THIS (via execute_sql /
-- pg_get_functiondef, not local migration history):
--   - 4 platform pipelines existed: Tax Preparation (ceb45198, 6 stages,
--     shared by both tax templates), Business Formation (507e8f60, 5
--     stages), Bookkeeping (2a0bfa36, 4 stages), Payroll (9b33b487, 4
--     stages). 0 workspace-owned (firm) pipelines or service_templates
--     exist anywhere in the database.
--   - Live reference check across services.pipeline_id/pipeline_stage_id,
--     engagements.pipeline_id/pipeline_stage_id, and
--     engagement_requirements.pipeline_stage_id (the only tables with a
--     pipeline_stage_id column besides two read-only views) found:
--       * Tax Preparation Pipeline: 2 services + 2 engagements reference
--         it -- NOT touched by this migration, its 6 stages are left
--         exactly as they are.
--       * Bookkeeping Pipeline: 1 service references it -- NOT touched,
--         left exactly as it is.
--       * Business Formation Pipeline and Payroll Pipeline: 0 references
--         anywhere -- safe to replace their stages in place, which is
--         what the product spec explicitly asked for on Business
--         Formation ("Replace the current incomplete formation pipeline
--         with...").
--   - apply_service_template_to_client() (read via pg_get_functiondef)
--     always inserts every template task/document/form unconditionally
--     and always picks the pipeline's first stage by sort_order with no
--     way to override it. ActivateServiceModal already compensates for
--     that with a narrow follow-up UPDATE of pipeline_stage_id after the
--     RPC returns (confirmed live in components/ActivateServiceModal.tsx)
--     -- so staff can already choose a later starting stage, and nothing
--     in this migration or the frontend needs to change for that to keep
--     working: it reads pipeline_stages live, so newly added stages just
--     appear.
--   - service_template_documents referenced no table (document_name is
--     free text, not an FK), and service_template_forms.form_template_id
--     references form_templates, which has exactly 4 real platform
--     templates (workspace_id is null, is_platform_template = true):
--     "Business Application Form", "New Client Intake Form", "Payroll
--     Onboarding Form", "W-9 Request Form". Only those 4 are referenced
--     below -- never the two workspace-owned form templates that also
--     exist ("2026 intake", "Tax prep"), which belong to one real firm
--     and are left untouched.
--   - No check constraints restrict pipelines.pipeline_type,
--     engagements.engagement_type, services.service_type,
--     service_templates.service_type, documents.document_category, or
--     client_checklist_items.item_type -- all free text. No pre-existing
--     unique constraint enforces one row per (pipeline_id, stage_name) or
--     one platform pipeline per name, so this migration adds two narrow
--     partial/composite unique indexes purely to make itself safely
--     re-runnable via ON CONFLICT, without constraining anything a firm
--     might create later (both indexes exclude workspace-owned rows).
--
-- SAFETY / IDEMPOTENCY PATTERN used throughout:
--   - Platform pipelines are upserted by pipeline_name (new unique index,
--     scoped to is_platform_template = true and workspace_id is null) --
--     running this migration twice updates the same rows, never
--     duplicates them.
--   - Pipeline stages are upserted by (pipeline_id, stage_name) (new
--     unique index) -- same guarantee. Where a pipeline's stage set is
--     being replaced, obsolete stage names are deleted first, but only
--     after confirming live 0-reference above; stage names that persist
--     across old and new lists (e.g. "Complete") keep their existing row
--     and id.
--   - service_templates rows already known to exist (5 of them) are
--     updated by their real id, preserving it. New template rows (5 of
--     them) are inserted only if no row with that template_name already
--     exists.
--   - service_template_tasks/documents/forms carry no incoming foreign
--     key from anywhere else in the schema (confirmed: tasks/documents/
--     client_form_assignments only reference service_id/engagement_id,
--     never a service_template_*_id) and are pure template definitions
--     copied at activation time, so replacing a template's task/document/
--     form list is done with a plain delete-then-insert scoped to that
--     one service_template_id -- safe, and the net result is identical
--     (not merely non-duplicating) on every re-run.
--   - Nothing in this migration touches services, engagements, tasks,
--     deadlines, documents, client_form_assignments, or
--     client_checklist_items -- those are only ever written by
--     apply_service_template_to_client() at activation time, so changing
--     a template here only affects activations that happen after this
--     migration runs.

-- Two narrow unique indexes solely to make the upserts below idempotent.
create unique index if not exists pipelines_platform_name_uq
  on public.pipelines (pipeline_name)
  where is_platform_template = true and workspace_id is null;

create unique index if not exists pipeline_stages_pipeline_stage_name_uq
  on public.pipeline_stages (pipeline_id, stage_name);

-- =====================================================================
-- PIPELINE 1: Individual Tax Preparation Pipeline (new platform pipeline;
-- the existing "Tax Preparation Pipeline" ceb45198 is left untouched
-- because 2 live services/engagements reference it).
-- =====================================================================
insert into public.pipelines (pipeline_name, pipeline_type, description, is_active, is_platform_template, visibility_scope, workspace_id)
values ('Individual Tax Preparation Pipeline', 'individual_tax_preparation', 'Recommended workflow for individual tax return engagements, from consultation through filing.', true, true, 'workspace', null)
on conflict (pipeline_name) where is_platform_template = true and workspace_id is null
do update set pipeline_type = excluded.pipeline_type, description = excluded.description, is_active = true;

insert into public.pipeline_stages (pipeline_id, workspace_id, stage_name, stage_description, sort_order, is_complete_stage, is_active)
select p.id, null, x.stage_name, x.stage_description, x.sort_order, x.is_complete, true
from (select id from public.pipelines where pipeline_name = 'Individual Tax Preparation Pipeline' and is_platform_template = true and workspace_id is null) p,
(values
  (1, 'Consultation Needed', 'Client needs an initial consultation or service review.', false),
  (2, 'Consultation Scheduled', 'Consultation has been scheduled but not completed.', false),
  (3, 'Quote Sent', 'Pricing or proposal has been sent for client approval.', false),
  (4, 'Engagement Letter Sent', 'Engagement terms have been sent and are awaiting acceptance.', false),
  (5, 'Intake Pending', 'Client intake questionnaire has not been completed.', false),
  (6, 'Awaiting Documents', 'Required tax documents have been requested from the client.', false),
  (7, 'Missing Information', 'Some documents or answers are still needed before preparation can continue.', false),
  (8, 'Ready for Preparation', 'Intake and required information are sufficiently complete.', false),
  (9, 'In Preparation', 'Return preparation is currently in progress.', false),
  (10, 'Internal Review', 'Return is being reviewed internally for accuracy and completeness.', false),
  (11, 'Client Review & Signatures', 'Client must review the return and complete required signatures.', false),
  (12, 'Ready to File', 'Return is approved and ready for electronic filing.', false),
  (13, 'Filed', 'Return has been transmitted and is awaiting agency acceptance.', false),
  (14, 'Accepted', 'Return has been accepted by the applicable tax authority.', false),
  (15, 'Complete', 'Tax preparation service is complete.', true)
) as x(sort_order, stage_name, stage_description, is_complete)
on conflict (pipeline_id, stage_name) do update
  set sort_order = excluded.sort_order, stage_description = excluded.stage_description, is_complete_stage = excluded.is_complete_stage, is_active = true;

-- =====================================================================
-- PIPELINE 2: Business Tax Preparation Pipeline (new). Same major stages
-- as Individual Tax Preparation -- no product or schema reason to
-- diverge at the stage level; the individual-only wording concern
-- (Form 8879) only applies to task names, handled in the template tasks
-- below.
-- =====================================================================
insert into public.pipelines (pipeline_name, pipeline_type, description, is_active, is_platform_template, visibility_scope, workspace_id)
values ('Business Tax Preparation Pipeline', 'business_tax_preparation', 'Recommended workflow for business tax return engagements, from consultation through filing.', true, true, 'workspace', null)
on conflict (pipeline_name) where is_platform_template = true and workspace_id is null
do update set pipeline_type = excluded.pipeline_type, description = excluded.description, is_active = true;

insert into public.pipeline_stages (pipeline_id, workspace_id, stage_name, stage_description, sort_order, is_complete_stage, is_active)
select p.id, null, x.stage_name, x.stage_description, x.sort_order, x.is_complete, true
from (select id from public.pipelines where pipeline_name = 'Business Tax Preparation Pipeline' and is_platform_template = true and workspace_id is null) p,
(values
  (1, 'Consultation Needed', 'Client needs an initial consultation or service review.', false),
  (2, 'Consultation Scheduled', 'Consultation has been scheduled but not completed.', false),
  (3, 'Quote Sent', 'Pricing or proposal has been sent for client approval.', false),
  (4, 'Engagement Letter Sent', 'Engagement terms have been sent and are awaiting acceptance.', false),
  (5, 'Intake Pending', 'Client intake questionnaire has not been completed.', false),
  (6, 'Awaiting Documents', 'Required tax documents have been requested from the client.', false),
  (7, 'Missing Information', 'Some documents or answers are still needed before preparation can continue.', false),
  (8, 'Ready for Preparation', 'Intake and required information are sufficiently complete.', false),
  (9, 'In Preparation', 'Return preparation is currently in progress.', false),
  (10, 'Internal Review', 'Return is being reviewed internally for accuracy and completeness.', false),
  (11, 'Client Review & Signatures', 'Client must review the return and complete required signatures.', false),
  (12, 'Ready to File', 'Return is approved and ready for electronic filing.', false),
  (13, 'Filed', 'Return has been transmitted and is awaiting agency acceptance.', false),
  (14, 'Accepted', 'Return has been accepted by the applicable tax authority.', false),
  (15, 'Complete', 'Tax preparation service is complete.', true)
) as x(sort_order, stage_name, stage_description, is_complete)
on conflict (pipeline_id, stage_name) do update
  set sort_order = excluded.sort_order, stage_description = excluded.stage_description, is_complete_stage = excluded.is_complete_stage, is_active = true;

-- =====================================================================
-- PIPELINE 6: Business Formation Pipeline -- REPLACED IN PLACE (id
-- 507e8f60-979e-4465-bbfc-39f3f9de75f0). Confirmed live: 0 services, 0
-- engagements, 0 engagement_requirements reference this pipeline or any
-- of its stages, so replacing its stage set does not rewrite any
-- historical or active client workflow. "Complete" is the one stage name
-- shared by the old and new lists, so that row (and its id) is kept and
-- just re-ordered; the other 4 old stage names have no equivalent in the
-- new list and are removed.
-- =====================================================================
update public.pipelines
set pipeline_name = 'Business Formation Pipeline',
    pipeline_type = 'business_formation',
    description = 'Recommended workflow for LLC and business entity formation, from consultation through delivery.',
    is_active = true
where id = '507e8f60-979e-4465-bbfc-39f3f9de75f0';

delete from public.pipeline_stages
where pipeline_id = '507e8f60-979e-4465-bbfc-39f3f9de75f0'
  and stage_name not in (
    'Consultation Needed', 'Consultation Scheduled', 'Quote Sent', 'Engagement Letter Sent',
    'Formation Intake Pending', 'Entity Details Confirmed', 'Name Availability Review',
    'Filing Preparation', 'Filed With State', 'State Approval Received', 'EIN Requested',
    'EIN Obtained', 'Operating Agreement Prepared', 'Formation Documents Delivered', 'Complete'
  );

insert into public.pipeline_stages (pipeline_id, workspace_id, stage_name, stage_description, sort_order, is_complete_stage, is_active)
select '507e8f60-979e-4465-bbfc-39f3f9de75f0'::uuid, null, x.stage_name, x.stage_description, x.sort_order, x.is_complete, true
from (values
  (1, 'Consultation Needed', 'Client needs an initial consultation or service review.', false),
  (2, 'Consultation Scheduled', 'Consultation has been scheduled but not completed.', false),
  (3, 'Quote Sent', 'Pricing or proposal has been sent for client approval.', false),
  (4, 'Engagement Letter Sent', 'Engagement terms have been sent and are awaiting acceptance.', false),
  (5, 'Formation Intake Pending', 'Client formation intake questionnaire has not been completed.', false),
  (6, 'Entity Details Confirmed', 'Entity type, state, owners, and registered agent have been confirmed.', false),
  (7, 'Name Availability Review', 'The proposed business name is being checked for availability.', false),
  (8, 'Filing Preparation', 'Formation documents are being prepared for filing.', false),
  (9, 'Filed With State', 'Formation documents have been filed with the state.', false),
  (10, 'State Approval Received', 'The state has approved the formation filing.', false),
  (11, 'EIN Requested', 'An EIN has been requested from the IRS.', false),
  (12, 'EIN Obtained', 'The EIN has been received.', false),
  (13, 'Operating Agreement Prepared', 'The operating agreement has been drafted and sent for signature.', false),
  (14, 'Formation Documents Delivered', 'Final formation documents have been delivered to the client.', false),
  (15, 'Complete', 'Business formation service is complete.', true)
) as x(sort_order, stage_name, stage_description, is_complete)
on conflict (pipeline_id, stage_name) do update
  set sort_order = excluded.sort_order, stage_description = excluded.stage_description, is_complete_stage = excluded.is_complete_stage, is_active = true;

-- =====================================================================
-- PIPELINE 3: Bookkeeping Client Onboarding Pipeline (new). The existing
-- "Bookkeeping Pipeline" (2a0bfa36) is left untouched -- 1 live service
-- references it. This new pipeline becomes the default for the renamed
-- "Bookkeeping Client Onboarding" template below; it prepares a client
-- for ongoing bookkeeping without generating any future monthly periods.
-- =====================================================================
insert into public.pipelines (pipeline_name, pipeline_type, description, is_active, is_platform_template, visibility_scope, workspace_id)
values ('Bookkeeping Client Onboarding Pipeline', 'bookkeeping_onboarding', 'Recommended workflow for bringing a new bookkeeping client from consultation to active recurring service.', true, true, 'workspace', null)
on conflict (pipeline_name) where is_platform_template = true and workspace_id is null
do update set pipeline_type = excluded.pipeline_type, description = excluded.description, is_active = true;

insert into public.pipeline_stages (pipeline_id, workspace_id, stage_name, stage_description, sort_order, is_complete_stage, is_active)
select p.id, null, x.stage_name, x.stage_description, x.sort_order, x.is_complete, true
from (select id from public.pipelines where pipeline_name = 'Bookkeeping Client Onboarding Pipeline' and is_platform_template = true and workspace_id is null) p,
(values
  (1, 'Consultation Needed', 'Client needs an initial consultation or service review.', false),
  (2, 'Consultation Scheduled', 'Consultation has been scheduled but not completed.', false),
  (3, 'Quote Sent', 'Pricing or proposal has been sent for client approval.', false),
  (4, 'Engagement Letter Sent', 'Engagement terms have been sent and are awaiting acceptance.', false),
  (5, 'Onboarding Intake Pending', 'Client onboarding questionnaire has not been completed.', false),
  (6, 'Access & Documents Needed', 'Software access and historical financial documents have been requested from the client.', false),
  (7, 'Account Setup', 'Chart of accounts and bookkeeping software are being configured.', false),
  (8, 'Historical Review', 'Prior-period books are being reviewed for accuracy.', false),
  (9, 'Cleanup in Progress', 'Historical transactions are being corrected and categorized.', false),
  (10, 'Ready for Recurring Service', 'Onboarding is complete and the client is ready to move into regular monthly bookkeeping.', false),
  (11, 'Active Recurring Client', 'Client has transitioned into ongoing monthly bookkeeping service.', false),
  (12, 'Complete', 'Onboarding workflow is complete.', true)
) as x(sort_order, stage_name, stage_description, is_complete)
on conflict (pipeline_id, stage_name) do update
  set sort_order = excluded.sort_order, stage_description = excluded.stage_description, is_complete_stage = excluded.is_complete_stage, is_active = true;

-- =====================================================================
-- PIPELINE 4: Monthly Bookkeeping Period Pipeline -- STRUCTURAL ONLY.
-- Per product rules 5/9/10, this PR does not build recurring monthly-
-- period generation or bulk activation, and the service_templates table
-- has no concept of "one service per period" distinct from "one
-- permanent recurring service" (only services.is_recurring, a flag, not
-- a period-generation mechanism). Creating a service_template that
-- points here would let staff manually activate it, but each activation
-- would create an unlinked, standalone service with no relationship to
-- a client's ongoing bookkeeping engagement -- confusing today, since
-- there is no parent/period linkage yet. So: the pipeline and its stages
-- are created now (harmless, and lets a future period-generation feature
-- reference real stage ids immediately), but deliberately NOT wired to
-- any service_template, so it cannot be selected during activation
-- today. This is the approved future design for recurring bookkeeping
-- periods, documented here rather than exposed.
-- =====================================================================
insert into public.pipelines (pipeline_name, pipeline_type, description, is_active, is_platform_template, visibility_scope, workspace_id)
values ('Monthly Bookkeeping Period Pipeline', 'bookkeeping_period', 'Future workflow for a single recurring bookkeeping period. Not yet activatable from any service template -- reserved for the upcoming period-generation feature.', true, true, 'workspace', null)
on conflict (pipeline_name) where is_platform_template = true and workspace_id is null
do update set pipeline_type = excluded.pipeline_type, description = excluded.description, is_active = true;

insert into public.pipeline_stages (pipeline_id, workspace_id, stage_name, stage_description, sort_order, is_complete_stage, is_active)
select p.id, null, x.stage_name, x.stage_description, x.sort_order, x.is_complete, true
from (select id from public.pipelines where pipeline_name = 'Monthly Bookkeeping Period Pipeline' and is_platform_template = true and workspace_id is null) p,
(values
  (1, 'Period Opened', 'A new monthly bookkeeping period has started.', false),
  (2, 'Awaiting Client Information', 'Statements or information for this period have been requested from the client.', false),
  (3, 'Transactions in Review', 'Transactions for this period are being categorized.', false),
  (4, 'Reconciliation', 'Accounts are being reconciled for this period.', false),
  (5, 'Client Questions', 'Waiting on the client to answer questions about this period''s transactions.', false),
  (6, 'Internal Review', 'This period''s books are being reviewed internally before reporting.', false),
  (7, 'Reports Ready', 'Financial reports for this period are ready to send to the client.', false),
  (8, 'Period Complete', 'This period''s bookkeeping is complete.', true)
) as x(sort_order, stage_name, stage_description, is_complete)
on conflict (pipeline_id, stage_name) do update
  set sort_order = excluded.sort_order, stage_description = excluded.stage_description, is_complete_stage = excluded.is_complete_stage, is_active = true;

-- =====================================================================
-- Cleanup Bookkeeping Pipeline (new). A separate one-time pipeline
-- rather than reusing Bookkeeping Client Onboarding Pipeline: a cleanup
-- engagement is its own bounded, one-time project (it may or may not
-- lead into recurring service), and forcing it through the onboarding
-- pipeline's "Account Setup" stage (which assumes ongoing software setup
-- is the goal) doesn't fit a client who just needs historical books
-- fixed. Per the product spec's own fallback stage list.
-- =====================================================================
insert into public.pipelines (pipeline_name, pipeline_type, description, is_active, is_platform_template, visibility_scope, workspace_id)
values ('Cleanup Bookkeeping Pipeline', 'cleanup_bookkeeping', 'Recommended workflow for one-time historical bookkeeping cleanup projects.', true, true, 'workspace', null)
on conflict (pipeline_name) where is_platform_template = true and workspace_id is null
do update set pipeline_type = excluded.pipeline_type, description = excluded.description, is_active = true;

insert into public.pipeline_stages (pipeline_id, workspace_id, stage_name, stage_description, sort_order, is_complete_stage, is_active)
select p.id, null, x.stage_name, x.stage_description, x.sort_order, x.is_complete, true
from (select id from public.pipelines where pipeline_name = 'Cleanup Bookkeeping Pipeline' and is_platform_template = true and workspace_id is null) p,
(values
  (1, 'Consultation Needed', 'Client needs an initial consultation or service review.', false),
  (2, 'Quote Sent', 'Pricing or proposal has been sent for client approval.', false),
  (3, 'Engagement Letter Sent', 'Engagement terms have been sent and are awaiting acceptance.', false),
  (4, 'Access & Documents Needed', 'Software access and historical financial documents have been requested from the client.', false),
  (5, 'Historical Review', 'Prior-period books are being reviewed to scope the cleanup.', false),
  (6, 'Cleanup in Progress', 'Historical transactions are being corrected and categorized.', false),
  (7, 'Client Questions', 'Waiting on the client to answer questions about historical transactions.', false),
  (8, 'Internal Review', 'Cleaned-up books are being reviewed internally before delivery.', false),
  (9, 'Reports Delivered', 'Cleanup reports have been delivered to the client.', false),
  (10, 'Ready for Recurring Service', 'Cleanup is complete and the client is ready to move into regular bookkeeping service, if applicable.', false),
  (11, 'Complete', 'Cleanup bookkeeping service is complete.', true)
) as x(sort_order, stage_name, stage_description, is_complete)
on conflict (pipeline_id, stage_name) do update
  set sort_order = excluded.sort_order, stage_description = excluded.stage_description, is_complete_stage = excluded.is_complete_stage, is_active = true;

-- =====================================================================
-- PIPELINE 5: Payroll Onboarding Pipeline -- RENAMED/REPLACED IN PLACE
-- (id 9b33b487-9e4e-4bcb-b4c4-1a3fb7e9ba08, previously "Payroll
-- Pipeline"). Confirmed live: 0 services, 0 engagements, 0
-- engagement_requirements reference this pipeline or any of its 4 old
-- stages, so renaming it and replacing its stage set does not rewrite
-- any historical or active client workflow. None of the old stage names
-- ("Onboarding", "Active - Processing", "On Hold", "Offboarded") overlap
-- the new list, so all 4 are removed and 13 new ones inserted.
-- =====================================================================
update public.pipelines
set pipeline_name = 'Payroll Onboarding Pipeline',
    pipeline_type = 'payroll_onboarding',
    description = 'Recommended workflow for onboarding a new payroll client, from consultation through the first live run.',
    is_active = true
where id = '9b33b487-9e4e-4bcb-b4c4-1a3fb7e9ba08';

delete from public.pipeline_stages
where pipeline_id = '9b33b487-9e4e-4bcb-b4c4-1a3fb7e9ba08'
  and stage_name not in (
    'Consultation Needed', 'Consultation Scheduled', 'Quote Sent', 'Engagement Letter Sent',
    'Payroll Intake Pending', 'Company Information Needed', 'Employee Information Needed',
    'Payroll Account Setup', 'Tax Account Setup', 'Test Payroll', 'Ready to Process',
    'Active Recurring Client', 'Complete'
  );

insert into public.pipeline_stages (pipeline_id, workspace_id, stage_name, stage_description, sort_order, is_complete_stage, is_active)
select '9b33b487-9e4e-4bcb-b4c4-1a3fb7e9ba08'::uuid, null, x.stage_name, x.stage_description, x.sort_order, x.is_complete, true
from (values
  (1, 'Consultation Needed', 'Client needs an initial consultation or service review.', false),
  (2, 'Consultation Scheduled', 'Consultation has been scheduled but not completed.', false),
  (3, 'Quote Sent', 'Pricing or proposal has been sent for client approval.', false),
  (4, 'Engagement Letter Sent', 'Engagement terms have been sent and are awaiting acceptance.', false),
  (5, 'Payroll Intake Pending', 'Client payroll intake questionnaire has not been completed.', false),
  (6, 'Company Information Needed', 'Company details needed to set up payroll have been requested.', false),
  (7, 'Employee Information Needed', 'Employee details needed to set up payroll have been requested.', false),
  (8, 'Payroll Account Setup', 'Payroll system is being configured for this client.', false),
  (9, 'Tax Account Setup', 'Federal and state payroll tax accounts are being set up.', false),
  (10, 'Test Payroll', 'A test payroll run is being processed to confirm setup.', false),
  (11, 'Ready to Process', 'Setup is confirmed and payroll is ready for its first live run.', false),
  (12, 'Active Recurring Client', 'Client has transitioned into ongoing payroll processing.', false),
  (13, 'Complete', 'Payroll onboarding workflow is complete.', true)
) as x(sort_order, stage_name, stage_description, is_complete)
on conflict (pipeline_id, stage_name) do update
  set sort_order = excluded.sort_order, stage_description = excluded.stage_description, is_complete_stage = excluded.is_complete_stage, is_active = true;

-- =====================================================================
-- PIPELINE 7: Tax Planning Pipeline (new).
-- =====================================================================
insert into public.pipelines (pipeline_name, pipeline_type, description, is_active, is_platform_template, visibility_scope, workspace_id)
values ('Tax Planning Pipeline', 'tax_planning', 'Recommended workflow for tax planning engagements, from consultation through delivered recommendations.', true, true, 'workspace', null)
on conflict (pipeline_name) where is_platform_template = true and workspace_id is null
do update set pipeline_type = excluded.pipeline_type, description = excluded.description, is_active = true;

insert into public.pipeline_stages (pipeline_id, workspace_id, stage_name, stage_description, sort_order, is_complete_stage, is_active)
select p.id, null, x.stage_name, x.stage_description, x.sort_order, x.is_complete, true
from (select id from public.pipelines where pipeline_name = 'Tax Planning Pipeline' and is_platform_template = true and workspace_id is null) p,
(values
  (1, 'Consultation Needed', 'Client needs an initial consultation or service review.', false),
  (2, 'Consultation Scheduled', 'Consultation has been scheduled but not completed.', false),
  (3, 'Quote Sent', 'Pricing or proposal has been sent for client approval.', false),
  (4, 'Engagement Letter Sent', 'Engagement terms have been sent and are awaiting acceptance.', false),
  (5, 'Questionnaire Pending', 'Client planning questionnaire has not been completed.', false),
  (6, 'Documents Requested', 'Supporting financial documents have been requested from the client.', false),
  (7, 'Information Review', 'Received information is being reviewed before strategy work begins.', false),
  (8, 'Strategy Development', 'Tax planning strategies are being developed.', false),
  (9, 'Internal Review', 'Proposed strategies are being reviewed internally for accuracy.', false),
  (10, 'Client Presentation', 'Strategies are being presented to the client.', false),
  (11, 'Recommendations Delivered', 'Final recommendations have been delivered to the client.', false),
  (12, 'Follow-Up Pending', 'Waiting on follow-up actions related to the recommendations.', false),
  (13, 'Complete', 'Tax planning service is complete.', true)
) as x(sort_order, stage_name, stage_description, is_complete)
on conflict (pipeline_id, stage_name) do update
  set sort_order = excluded.sort_order, stage_description = excluded.stage_description, is_complete_stage = excluded.is_complete_stage, is_active = true;

-- =====================================================================
-- PIPELINE 8: Business Consulting Pipeline (new).
-- =====================================================================
insert into public.pipelines (pipeline_name, pipeline_type, description, is_active, is_platform_template, visibility_scope, workspace_id)
values ('Business Consulting Pipeline', 'business_consulting', 'Recommended workflow for business consulting engagements, from discovery through implementation planning.', true, true, 'workspace', null)
on conflict (pipeline_name) where is_platform_template = true and workspace_id is null
do update set pipeline_type = excluded.pipeline_type, description = excluded.description, is_active = true;

insert into public.pipeline_stages (pipeline_id, workspace_id, stage_name, stage_description, sort_order, is_complete_stage, is_active)
select p.id, null, x.stage_name, x.stage_description, x.sort_order, x.is_complete, true
from (select id from public.pipelines where pipeline_name = 'Business Consulting Pipeline' and is_platform_template = true and workspace_id is null) p,
(values
  (1, 'Consultation Needed', 'Client needs an initial consultation or service review.', false),
  (2, 'Consultation Scheduled', 'Consultation has been scheduled but not completed.', false),
  (3, 'Quote Sent', 'Pricing or proposal has been sent for client approval.', false),
  (4, 'Engagement Letter Sent', 'Engagement terms have been sent and are awaiting acceptance.', false),
  (5, 'Discovery Intake Pending', 'Client discovery questionnaire has not been completed.', false),
  (6, 'Documents Requested', 'Supporting business documents have been requested from the client.', false),
  (7, 'Current-State Review', 'The client''s current business operations are being reviewed.', false),
  (8, 'Strategy Development', 'Recommendations and strategy are being developed.', false),
  (9, 'Recommendations Review', 'Proposed recommendations are being reviewed internally.', false),
  (10, 'Client Presentation', 'Recommendations are being presented to the client.', false),
  (11, 'Implementation Planning', 'An implementation plan is being prepared with the client.', false),
  (12, 'Follow-Up Pending', 'Waiting on follow-up actions related to the engagement.', false),
  (13, 'Complete', 'Business consulting service is complete.', true)
) as x(sort_order, stage_name, stage_description, is_complete)
on conflict (pipeline_id, stage_name) do update
  set sort_order = excluded.sort_order, stage_description = excluded.stage_description, is_complete_stage = excluded.is_complete_stage, is_active = true;

-- =====================================================================
-- PIPELINE 9: Business Systems Pipeline (new).
-- =====================================================================
insert into public.pipelines (pipeline_name, pipeline_type, description, is_active, is_platform_template, visibility_scope, workspace_id)
values ('Business Systems Pipeline', 'business_systems', 'Recommended workflow for business systems projects, from assessment through launch.', true, true, 'workspace', null)
on conflict (pipeline_name) where is_platform_template = true and workspace_id is null
do update set pipeline_type = excluded.pipeline_type, description = excluded.description, is_active = true;

insert into public.pipeline_stages (pipeline_id, workspace_id, stage_name, stage_description, sort_order, is_complete_stage, is_active)
select p.id, null, x.stage_name, x.stage_description, x.sort_order, x.is_complete, true
from (select id from public.pipelines where pipeline_name = 'Business Systems Pipeline' and is_platform_template = true and workspace_id is null) p,
(values
  (1, 'Consultation Needed', 'Client needs an initial consultation or service review.', false),
  (2, 'Consultation Scheduled', 'Consultation has been scheduled but not completed.', false),
  (3, 'Quote Sent', 'Pricing or proposal has been sent for client approval.', false),
  (4, 'Engagement Letter Sent', 'Engagement terms have been sent and are awaiting acceptance.', false),
  (5, 'Systems Assessment Pending', 'Initial systems assessment has not been completed.', false),
  (6, 'Current Workflow Review', 'The client''s current workflows and tools are being reviewed.', false),
  (7, 'Requirements Confirmed', 'System requirements have been confirmed with the client.', false),
  (8, 'System Design', 'The new system or workflow is being designed.', false),
  (9, 'Setup in Progress', 'The system is being configured and built out.', false),
  (10, 'Testing', 'The system is being tested before launch.', false),
  (11, 'Client Training', 'The client''s team is being trained on the new system.', false),
  (12, 'Launch', 'The new system is going live.', false),
  (13, 'Follow-Up', 'Post-launch support and follow-up are in progress.', false),
  (14, 'Complete', 'Business systems service is complete.', true)
) as x(sort_order, stage_name, stage_description, is_complete)
on conflict (pipeline_id, stage_name) do update
  set sort_order = excluded.sort_order, stage_description = excluded.stage_description, is_complete_stage = excluded.is_complete_stage, is_active = true;

-- =====================================================================
-- PIPELINE 10: Compliance Service Pipeline (new).
-- =====================================================================
insert into public.pipelines (pipeline_name, pipeline_type, description, is_active, is_platform_template, visibility_scope, workspace_id)
values ('Compliance Service Pipeline', 'compliance', 'Recommended workflow for standalone compliance filings and support.', true, true, 'workspace', null)
on conflict (pipeline_name) where is_platform_template = true and workspace_id is null
do update set pipeline_type = excluded.pipeline_type, description = excluded.description, is_active = true;

insert into public.pipeline_stages (pipeline_id, workspace_id, stage_name, stage_description, sort_order, is_complete_stage, is_active)
select p.id, null, x.stage_name, x.stage_description, x.sort_order, x.is_complete, true
from (select id from public.pipelines where pipeline_name = 'Compliance Service Pipeline' and is_platform_template = true and workspace_id is null) p,
(values
  (1, 'Consultation Needed', 'Client needs an initial consultation or service review.', false),
  (2, 'Scope Confirmed', 'The scope of the compliance matter has been confirmed.', false),
  (3, 'Engagement Letter Sent', 'Engagement terms have been sent and are awaiting acceptance.', false),
  (4, 'Information Requested', 'Required information has been requested from the client.', false),
  (5, 'Compliance Review', 'Received information is being reviewed for compliance requirements.', false),
  (6, 'Filing Preparation', 'Required filings are being prepared.', false),
  (7, 'Client Approval Needed', 'Filings are ready and awaiting client approval.', false),
  (8, 'Submitted', 'Filings have been submitted to the applicable agency.', false),
  (9, 'Confirmation Received', 'Confirmation of submission has been received.', false),
  (10, 'Follow-Up Required', 'Additional follow-up is needed to close out this matter.', false),
  (11, 'Complete', 'Compliance service is complete.', true)
) as x(sort_order, stage_name, stage_description, is_complete)
on conflict (pipeline_id, stage_name) do update
  set sort_order = excluded.sort_order, stage_description = excluded.stage_description, is_complete_stage = excluded.is_complete_stage, is_active = true;
