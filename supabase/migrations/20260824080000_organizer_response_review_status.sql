-- Staff had no way to mark a submitted organizer as approved, denied, or
-- needing more info from the client -- the only status was the client-side
-- submitted/reviewed flag. Reuses the existing review_status enum
-- (Pending/In Review/Approved/Rejected/Corrections Requested) already used
-- on engagements, for the same vocabulary staff already know.
alter table public.organizer_responses add column if not exists review_status public.review_status;
alter table public.organizer_responses add column if not exists review_note text;
alter table public.organizer_responses add column if not exists reviewed_by uuid references auth.users(id);
alter table public.organizer_responses add column if not exists reviewed_at timestamptz;

create or replace function public.set_organizer_response_review_status(
  p_response_id uuid,
  p_status public.review_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_status text;
begin
  select workspace_id, status into v_workspace_id, v_status
  from public.organizer_responses where id = p_response_id;

  if v_workspace_id is null then
    raise exception 'organizer response not found';
  end if;
  if not public.has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'insufficient permissions';
  end if;
  if v_status not in ('submitted', 'reviewed') then
    raise exception 'this organizer has not been submitted yet';
  end if;

  update public.organizer_responses
  set review_status = p_status,
      review_note = p_note,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      status = 'reviewed'
  where id = p_response_id;
end;
$function$;

revoke all on function public.set_organizer_response_review_status(uuid, public.review_status, text) from public, anon;
grant execute on function public.set_organizer_response_review_status(uuid, public.review_status, text) to authenticated, service_role;
