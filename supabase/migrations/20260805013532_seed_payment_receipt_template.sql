
insert into public.email_templates (workspace_id, slug, name, category, subject, body_html, status, merge_fields)
values
  (null, 'payment-receipt', 'Payment receipt', 'billing',
   'Payment received -- Invoice {{invoice_number}}',
   '<p>Hi,</p><p>We received your payment of <strong>${{amount}}</strong> on {{payment_date}} for invoice <strong>{{invoice_number}}</strong>.</p><p>Thank you.</p>',
   'published', '["invoice_number","amount","payment_date"]'::jsonb)
on conflict (workspace_id, slug) do nothing;
