-- Multi-domain sending support for ERO Office / Service Bureau workspaces.
-- Every workspace was previously capped at exactly one sending domain
-- (unique(workspace_id)) -- fine for a solo practice, but an ERO Office or
-- Service Bureau workspace can legitimately operate under more than one
-- brand/domain (confirmed live: a workspace wanting to send from both its
-- own domain and a second firm's domain under the same account). Reworked
-- to the same "many rows, exactly one marked primary" shape already used
-- by client_emails/client_phones/client_addresses: a partial unique index
-- replaces the per-workspace uniqueness. The one-domain cap for every
-- other workspace type is enforced at the app layer (same place the old
-- cap was enforced -- this table never had a DB-level row-count
-- constraint beyond "at most one", only the UNIQUE(workspace_id) this
-- migration relaxes), not duplicated here as a DB-level check.

alter table public.workspace_email_domains drop constraint workspace_email_domains_workspace_id_key;
alter table public.workspace_email_domains add column is_primary boolean not null default true;

create unique index workspace_email_domains_one_primary_idx
  on public.workspace_email_domains (workspace_id)
  where is_primary;

-- Atomic flip-primary RPC, same shape as set_client_address_primary.
-- sendEmailViaResend prefers the primary verified domain when a workspace
-- has more than one, so this is how a workspace picks which one that is.
create or replace function public.set_workspace_email_domain_primary(p_domain_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_status text;
begin
  select workspace_id, status into v_workspace_id, v_status from public.workspace_email_domains where id = p_domain_id;
  if v_workspace_id is null then
    raise exception 'sending domain not found';
  end if;
  if not has_permission(v_workspace_id, 'settings.manage') then
    raise exception 'insufficient permissions to manage this workspace''s integrations';
  end if;
  if v_status <> 'verified' then
    raise exception 'only a verified domain can be set as primary';
  end if;

  update public.workspace_email_domains set is_primary = false where workspace_id = v_workspace_id and is_primary and id <> p_domain_id;
  update public.workspace_email_domains set is_primary = true where id = p_domain_id;
end;
$$;

revoke all on function public.set_workspace_email_domain_primary(uuid) from public;
grant execute on function public.set_workspace_email_domain_primary(uuid) to authenticated;
