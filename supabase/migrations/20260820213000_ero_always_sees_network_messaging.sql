-- can_use_network_messaging previously just checked "does this workspace
-- have at least one messageable peer," which meant an ERO/SB with zero
-- connected PTINs yet saw no Messages nav item at all -- reported live:
-- MKB is workspace_type='ero_office' but had no connections, so the tab
-- was invisible. Being an ERO/SB should be sufficient on its own (the
-- point of the tab existing is partly to make the feature discoverable
-- before they've connected anyone); a connected PTIN still needs an
-- actual connection to have anyone to message.
create or replace function public.can_use_network_messaging(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    case
      when (select w.workspace_type from public.workspaces w where w.id = p_workspace_id) in ('ero_office', 'service_bureau')
        then public.is_workspace_member(p_workspace_id)
      else exists (select 1 from public.get_messageable_network_workspaces(p_workspace_id))
    end;
$function$;
