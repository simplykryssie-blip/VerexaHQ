
insert into public.email_templates (workspace_id, slug, name, category, subject, body_html, status, merge_fields)
values
  (null, 'invoice-due-reminder', 'Invoice due reminder', 'billing',
   'Invoice {{invoice_number}} is due soon',
   '<p>Hi,</p><p>Invoice <strong>{{invoice_number}}</strong> for <strong>${{amount_due}}</strong> is due on {{due_date}}.</p><p>Please sign in to your client portal to review and pay.</p>',
   'published', '["invoice_number","amount_due","due_date"]'::jsonb),
  (null, 'signature-due-reminder', 'Signature due reminder', 'documents',
   '{{document_title}} needs your signature',
   '<p>Hi {{signer_name}},</p><p>The document <strong>{{document_title}}</strong> is awaiting your signature and is due {{due_date}}.</p><p>Use the signing link you were sent to review and sign.</p>',
   'published', '["signer_name","document_title","due_date"]'::jsonb),
  (null, 'workflow-stage-due-reminder', 'Workflow stage due reminder', 'operations',
   'Stage "{{stage_name}}" is due soon',
   '<p>Hi,</p><p>The workflow stage <strong>{{stage_name}}</strong> assigned to you is due {{due_date}}.</p>',
   'published', '["stage_name","due_date"]'::jsonb)
on conflict (workspace_id, slug) do nothing;
