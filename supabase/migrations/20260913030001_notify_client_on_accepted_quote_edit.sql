-- If staff edit a quote after the client has already accepted it, the
-- client should hear about it -- otherwise they're working off a stale
-- number. Fires only when the actual priced content changes (not on the
-- internal engagement_id/invoice_id backfill updates accept_quote itself
-- makes to an already-'accepted' row).
create or replace function public.notify_client_of_quote_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_id uuid;
  v_email text;
begin
  if new.status <> 'accepted' or old.status <> 'accepted' then
    return new;
  end if;
  if new.line_items is not distinct from old.line_items
     and new.subtotal is not distinct from old.subtotal
     and new.discount_amount is not distinct from old.discount_amount
     and new.tax_amount is not distinct from old.tax_amount
     and new.total_amount is not distinct from old.total_amount
     and new.title is not distinct from old.title
     and new.valid_until is not distinct from old.valid_until
     and new.notes is not distinct from old.notes
  then
    return new;
  end if;

  select cpu.user_id, u.email into v_user_id, v_email
  from public.client_portal_users cpu
  join auth.users u on u.id = cpu.user_id
  where cpu.client_id = new.client_id and cpu.is_primary = true and cpu.status = 'active';

  if v_user_id is null then
    return new;
  end if;

  if public.is_notification_enabled(v_user_id, new.workspace_id, 'quote_updated', 'Email') then
    insert into public.notification_queue (workspace_id, channel, template_key, event_type, payload, recipient_user_id, recipient_email, entity_type, entity_id)
    values (new.workspace_id, 'Email', 'quote-updated', 'quote_updated',
            jsonb_build_object('quote_number', coalesce(new.quote_number, ''), 'title', new.title, 'total_amount', to_char(new.total_amount, 'FM999,999,990.00')),
            v_user_id, v_email, 'client', new.client_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_client_of_quote_change on public.quotes;
create trigger trg_notify_client_of_quote_change
  after update on public.quotes
  for each row execute function public.notify_client_of_quote_change();

-- Global default so this sends for every workspace immediately, same
-- pattern as invoice-due-reminder/signature-due-reminder/etc. A firm can
-- override it later with its own workspace-scoped copy of this slug.
insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, status)
select null, 'Quote Updated', 'quote-updated', 'billing',
  'Your quote {{quote_number}} has been updated',
  E'Hi,\n\nYour accepted quote {{quote_number}} ("{{title}}") has been updated by our team. The new total is ${{total_amount}}.\n\nPlease log in to your client portal to review the changes.\n\nIf you have any questions, please contact our office.\n\nThank you.',
  '["quote_number", "title", "total_amount"]'::jsonb, 'published'
where not exists (
  select 1 from public.email_templates where workspace_id is null and slug = 'quote-updated'
);
