-- Testing accept_firm_connection_invite (previous migration) surfaced a
-- real bug in it: its internal call to create_workspace(p_name,
-- p_workspace_type) is genuinely ambiguous between the two live
-- create_workspace overloads (text,text,text) and (text,text,text,uuid)
-- -- Postgres raises "is not unique" rather than picking one, so the
-- ERO/Service Bureau invite-acceptance flow this was meant to fix was
-- actually still broken.
--
-- The 3-arg overload is fully redundant: the 4-arg one already reproduces
-- its exact behavior when p_owner_user_id is omitted (falls back to
-- auth.uid(), skips the service-role check entirely, since that check
-- only runs when p_owner_user_id is not null). The 3-arg overload's only
-- effect at this point is causing this ambiguity, so it's dropped outright
-- rather than worked around.
drop function if exists public.create_workspace(text, text, text);

create or replace function public.accept_firm_connection_invite(p_token uuid, p_name text, p_workspace_type text default 'independent_ptin'::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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
$function$;
