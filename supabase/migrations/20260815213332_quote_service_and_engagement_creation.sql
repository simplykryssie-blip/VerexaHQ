-- Phase 6 of the tax-client process: after a quote is accepted, create
-- the engagement it was quoted for, attached to the client, and drop it
-- into that service's pipeline (services.process_id) if one is
-- configured -- same "enter the pipeline at its first stage" behavior
-- create_engagement already gives staff-initiated engagement creation.
--
-- A quote needs to say which service it's for to make this possible.
-- Nullable: an existing-engagement quote (change order, add-on work)
-- doesn't need one, since engagement_id already points somewhere.
alter table public.quotes add column if not exists service_id uuid references public.services(id);

-- accept_quote can't just call the existing create_engagement() RPC --
-- that function requires has_permission(workspace_id, 'engagements.manage'),
-- which a client's own auth.uid() will never have (SECURITY DEFINER
-- changes the executing role, not what auth.uid() resolves to, so the
-- permission check would still run against the client and fail). Instead
-- accept_quote inlines the same insert + start_engagement_workflow call
-- create_engagement uses, appropriate here since this is a system-
-- initiated side effect of the client's own accept action, not a staff
-- action requiring engagements.manage.
create or replace function public.accept_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quote public.quotes;
  v_service record;
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
      insert into public.engagements (workspace_id, client_id, service_id, workflow_id, billing_rule_id, case_type)
      values (v_quote.workspace_id, v_quote.client_id, v_service.id, v_service.process_id, v_service.billing_rule_id, 'other')
      returning id into v_engagement_id;

      if v_service.process_id is not null then
        perform public.start_engagement_workflow(v_engagement_id, v_service.process_id);
      end if;

      update public.quotes set engagement_id = v_engagement_id where id = p_quote_id;
    end if;
  end if;

  perform public._notify_admins_of_quote_response(v_quote.workspace_id, v_quote.client_id, p_quote_id, 'accepted');
end;
$$;
