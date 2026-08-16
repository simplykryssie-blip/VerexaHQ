-- Lead subsystem: the genuinely missing pieces. Everything else the user
-- asked for already existed -- create (NewClientButton defaults
-- lifecycle_status to 'lead'), update (existing client edit forms),
-- assign/reassign (ClientAssignmentForm.tsx already edits
-- relationship_manager_id), convert to client (ConvertLeadButton.tsx),
-- service selected (client_service_interests), and a Leads list
-- (Contacts -> Leads tab).
--
-- What's missing: no "lost" outcome (ConvertLeadButton only handles
-- lead -> active), and the lead pipeline was defined but completely
-- inert. validate_client_lifecycle_status() (pre-existing) reveals the
-- schema's actual design: clients.lifecycle_status itself doubles as the
-- lead-stage key, validated directly against lead_stages.key alongside
-- the hardcoded client statuses -- but nothing in the UI could ever move
-- a lead's lifecycle_status to a lead_stages.key other than the literal
-- default 'lead', so the pipeline was never actually reachable. Adding
-- 'lost' to the allow-list makes both usable.
alter table public.clients add column lost_reason text;

create or replace function public.validate_client_lifecycle_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.lifecycle_status in ('active', 'inactive', 'archived', 'lost') then
    return new;
  end if;
  if exists (select 1 from public.lead_stages where workspace_id = new.workspace_id and key = new.lifecycle_status) then
    return new;
  end if;
  raise exception 'Invalid lifecycle_status "%" for this workspace.', new.lifecycle_status;
end;
$function$;
