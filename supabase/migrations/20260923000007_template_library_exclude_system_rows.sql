-- Keep Verexa system-owned template masters out of tenant-scoped template libraries.
-- Marketplace/system RPCs are SECURITY DEFINER and can still read the masters.
-- Workspace users see only workspace-owned rows (plus explicit shared objects).

DROP POLICY IF EXISTS organizer_templates_select ON public.organizer_templates;
CREATE POLICY organizer_templates_select ON public.organizer_templates
FOR SELECT TO authenticated
USING (
  (workspace_id IS NOT NULL AND is_workspace_member(workspace_id))
  OR has_config_object_share_access('organizer_templates', id)
  OR (workspace_id IS NOT NULL AND is_portal_member(workspace_id))
);

DROP POLICY IF EXISTS organizer_fields_select ON public.organizer_fields;
CREATE POLICY organizer_fields_select ON public.organizer_fields
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organizer_templates t
    WHERE t.id = organizer_fields.organizer_template_id
      AND (
        (t.workspace_id IS NOT NULL AND is_workspace_member(t.workspace_id))
        OR has_config_object_share_access('organizer_templates', t.id)
        OR (t.workspace_id IS NOT NULL AND is_portal_member(t.workspace_id))
      )
  )
);

DROP POLICY IF EXISTS email_templates_select ON public.email_templates;
CREATE POLICY email_templates_select ON public.email_templates
FOR SELECT TO authenticated
USING (
  (workspace_id IS NOT NULL AND is_workspace_member(workspace_id))
  OR has_config_object_share_access('email_templates', id)
);

DROP POLICY IF EXISTS sms_templates_select ON public.sms_templates;
CREATE POLICY sms_templates_select ON public.sms_templates
FOR SELECT TO authenticated
USING (
  (workspace_id IS NOT NULL AND is_workspace_member(workspace_id))
  OR has_config_object_share_access('sms_templates', id)
);

DROP POLICY IF EXISTS engagement_letter_templates_select ON public.engagement_letter_templates;
CREATE POLICY engagement_letter_templates_select ON public.engagement_letter_templates
FOR SELECT TO authenticated
USING (
  (workspace_id IS NOT NULL AND is_workspace_member(workspace_id))
  OR has_config_object_share_access('engagement_letter_templates', id)
);

DROP POLICY IF EXISTS document_request_templates_select ON public.document_request_templates;
CREATE POLICY document_request_templates_select ON public.document_request_templates
FOR SELECT TO authenticated
USING (
  (workspace_id IS NOT NULL AND is_workspace_member(workspace_id))
  OR has_config_object_share_access('document_request_templates', id)
);