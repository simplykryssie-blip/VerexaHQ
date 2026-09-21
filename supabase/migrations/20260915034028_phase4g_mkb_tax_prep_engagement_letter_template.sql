-- ============================================================================
-- MIGRATION RECONCILIATION PHASE 1.9 -- RECOVERED FROM PRODUCTION (PR #268)
--
-- Did not previously exist in Git main. Applied directly to production
-- during the MKB Tax Prep + Client Review + F1/F2/NW-1 security work
-- (PR #268, branch claude/verexa-schema-mismatch-i8c19u, never merged).
-- This filename's version already exactly matches the real recorded
-- production version in supabase_migrations.schema_migrations -- no rename
-- needed. Content verified byte-for-byte (modulo a single trailing
-- newline) against schema_migrations.statements. Confidence: A -- exact
-- original recovered.
-- ============================================================================
-- Phase 4G: MKB's Individual/Schedule C service has no engagement_letter_template_id
-- wired at all (confirmed live in Phase 4E-F and re-verified this phase), so the
-- quote+EL gating design has no real template to resolve through the normal
-- service-default path (used by the send_engagement_letter automation action and
-- the manual send flow's default template). MKB's only existing
-- engagement_letter_templates row ("SOFTWARE LICENSE AGREEMENT AND SERVICE
-- COMMITMENT") is unrelated and explicitly must not be reused.
--
-- This creates a STRUCTURAL PLACEHOLDER template only -- section headers and
-- merge fields, no invented legal/liability language -- left in status='draft'
-- (not published) because real engagement-letter content requires the firm's
-- own business/legal review before it is fit for a real client. Nothing in the
-- send/signature/automation engine requires status='published' to function
-- (confirmed by reading execute_automation_step's send_engagement_letter branch
-- and validate_automation_step: both only check that engagement_letter_template_id
-- is non-null, never template status), so this is safe to wire and exercise in
-- testing without representing it as ready for production client use.
do $$
declare
  v_template_id uuid := gen_random_uuid();
begin
  insert into public.engagement_letter_templates (id, workspace_id, name, slug, body_html, status, source_type, requires_signature, merge_fields)
  values (
    v_template_id,
    '2896bf43-95db-420f-9bb5-8854f537bbd1',
    'Individual/Schedule C Tax Preparation Engagement Letter (DRAFT -- Pending Firm Review)',
    'individual-schedule-c-engagement-letter-draft',
    '<p><strong>&#9888; DRAFT -- placeholder structure only. Do not send to a real client until the firm/legal team has reviewed and approved the actual engagement terms below.</strong></p>' ||
    '<h2>{{firm_name}}</h2>' ||
    '<p>{{current_date}}</p>' ||
    '<p>Dear {{client_name}},</p>' ||
    '<h3>Scope of Engagement</h3>' ||
    '<p>[Insert the firm''s description of the Individual/Schedule C tax preparation services covered by this engagement.]</p>' ||
    '<h3>Fees</h3>' ||
    '<p>[Insert the firm''s fee arrangement, payment terms, and any refund/bank-product disclosures.]</p>' ||
    '<h3>Client Responsibilities</h3>' ||
    '<p>[Insert the firm''s standard client-responsibility and document-accuracy language.]</p>' ||
    '<h3>Terms and Limitations</h3>' ||
    '<p>[Insert the firm''s standard terms, limitation of liability, and any state-specific required disclosures. Verexa does not prepare, review, or endorse legal or tax-engagement language -- this section must be supplied and approved by the firm.]</p>' ||
    '<p>By signing below, {{client_name}} agrees to the terms of this engagement letter.</p>',
    'draft',
    'richtext',
    true,
    '["client_name", "client_email", "firm_name", "firm_address", "firm_phone", "current_date"]'::jsonb
  );

  update public.services
  set engagement_letter_template_id = v_template_id
  where id = 'f0526ed4-5927-42c1-8fd9-eb019eb386ee'
    and workspace_id = '2896bf43-95db-420f-9bb5-8854f537bbd1';
end $$;
