-- known_automation_trigger_types(): the authoritative list validate_automation
-- (recovered in the next migration) consults to reject an unrecognized
-- trigger_type string before a workflow can ever publish with one -- a
-- typo'd or renamed trigger type previously published silently and simply
-- never fired. Body captured live from production during this
-- reconciliation; it already includes entries from main's own later,
-- unrelated feature work (digital_product.*, service.*, product.*) that
-- PR #337's original list did not have, as well as PR #337's own missing-
-- trigger additions (task.assigned, task.reassigned, invoice.created,
-- payment.failed).
create or replace function public.known_automation_trigger_types()
returns text[]
language sql
immutable
as $function$
  select array[
    'engagement.status_changed', 'organizer.submitted', 'client.tag_added', 'client.portal_created',
    'client.service_interest_selected', 'engagement.created', 'appointment.status_changed', 'appointment.booked',
    'engagement_letter.signed', 'document_request.completed', 'organizer_information_request.resolved',
    'organizer_response.review_decided', 'engagement.stage_entered', 'lead.created', 'lead.updated',
    'lead.assigned', 'lead.stage_entered', 'lead.status_changed', 'lead.converted_to_client', 'lead.marked_lost',
    'quote.created', 'quote.sent', 'quote.accepted', 'quote.declined', 'document_request.sent', 'document.uploaded',
    'task.created', 'task.completed', 'client_message.received', 'task.overdue', 'webhook.received',
    'engagement.due_date_reminder', 'quote.expiring_reminder', 'client.birthday_reminder', 'email.opened',
    'email.clicked', 'email.bounced', 'sms.delivered', 'sms.failed', 'invoice.sent', 'invoice.paid',
    'invoice.overdue', 'payment_plan.installment_paid', 'engagement_share.created', 'firm_package.purchased',
    'partner_package.purchased', 'firm_package.canceled', 'partner_onboarding.created',
    'partner_onboarding.status_changed',
    'task.assigned', 'task.reassigned', 'invoice.created', 'payment.failed',
    'digital_product.purchased', 'digital_product.canceled', 'service.purchased', 'service.canceled',
    'product.purchased', 'product.canceled'
  ]::text[];
$function$;
