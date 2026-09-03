
-- Feeds the Document Center's own Activity tab AND the existing Client/
-- Engagement Timeline tabs for free, by writing with entity_type/entity_id
-- set to the *parent* client/engagement rather than the attachment/request
-- itself -- the same convention record_engagement_created already uses.
-- (audit_trigger_fn already logs raw before/after to audit_log for
-- compliance; this is the separate human-readable feed, reusing its
-- existing shape rather than inventing a new one.)
create or replace function public.record_attachment_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
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
$$;

create trigger trg_record_attachment_activity after insert or update or delete on public.attachments
  for each row execute function public.record_attachment_activity();

revoke execute on function public.record_attachment_activity() from public, anon, authenticated;

create or replace function public.record_document_request_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (
    new.workspace_id, auth.uid(), new.entity_type, new.entity_id, 'DOCUMENT_REQUEST_CREATED', 'DOCUMENT_REQUEST_CREATED',
    'Requested documents: ' || new.title,
    jsonb_build_object('document_request_id', new.id)
  );
  return new;
end;
$$;

create trigger trg_record_document_request_activity after insert on public.document_requests
  for each row execute function public.record_document_request_activity();

revoke execute on function public.record_document_request_activity() from public, anon, authenticated;

create or replace function public.record_signature_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
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
$$;

create trigger trg_record_signature_activity after update of status on public.signature_request_signers
  for each row when (new.status <> 'pending') execute function public.record_signature_activity();

revoke execute on function public.record_signature_activity() from public, anon, authenticated;
