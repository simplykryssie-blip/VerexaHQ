-- Customer-owned domain portability (platform-level, not workspace-specific).
--
-- Governing rule: Verexa configures customer domains. Verexa does not own
-- customer domains. Three distinct layers, kept distinct on purpose:
--   1. CUSTOMER-OWNED DOMAIN -- the actual domain, registered and owned by
--      the customer at their own registrar. Verexa never touches this.
--   2. VEREXA DOMAIN CONFIGURATION -- this table (and site_websites.
--      custom_domain) is Verexa's own record of "which workspace currently
--      configures this domain for which service," not a claim of ownership.
--   3. THIRD-PARTY PROVIDER CONFIGURATION -- Resend's domain record (email)
--      and Vercel's project-domain attachment (website) are configuration
--      Verexa maintains on the customer's behalf, not a store of customer
--      property.
--
-- Root cause being fixed here: a workspace that stops paying (and so is no
-- longer "active" -- suspended/archived/permanently_archived) could not
-- reach the page OR call the API routes needed to self-service disconnect
-- its own sending domain or release its own website custom domain --
-- app/(app)/layout.tsx substitutes the whole app shell with
-- SuspendedWorkspaceScreen for every route except a short allowlist, and
-- the disconnect API route itself additionally 403'd on
-- isWorkspaceStatusOperational(). That is exactly the moment a customer
-- leaving Verexa is most likely to be in -- forcing "contact Verexa to
-- release the domain," the pattern this phase exists to eliminate. Fixed
-- at the application layer (new /settings/domains surface, reachable
-- regardless of status; the disconnect API route no longer requires an
-- operational workspace) and here at the data layer: the release action
-- itself must not depend on has_permission-only checks gaining a
-- workspace-status dependency later, so it goes through a dedicated
-- SECURITY DEFINER RPC that deliberately omits is_workspace_operational --
-- the same "always available regardless of billing status" category as
-- the existing billing-recovery routes (see lib/workspace.ts's
-- workspaceOperationalError comment).
--
-- Backward compatible: every existing row gets released_at = null (its
-- real current state -- still actively configured), so no existing
-- customer domain is touched, hidden, or reinterpreted by this migration.

-- released_at distinguishes an active Verexa domain-configuration claim
-- (null) from a historical one (set) -- point 2 above. The customer-owned
-- domain itself is untouched either way; this only ever describes
-- Verexa's own configuration record. A released row is kept, not deleted,
-- so "which workspace used to configure this domain" stays answerable
-- (support, abuse investigation, re-claim conflicts) without resurrecting
-- it as an active claim.
alter table public.workspace_email_domains
  add column if not exists released_at timestamptz;

comment on column public.workspace_email_domains.released_at is
  'Null = this workspace currently configures this domain for sending (an active Verexa domain-configuration claim). Set = released; kept as history, not an active claim. The customer''s ownership of the domain itself is never represented by this column.';

-- Platform-wide: a domain can be an ACTIVE claim for at most one workspace
-- at a time, enforced at the database layer so tenant isolation doesn't
-- depend on every call site remembering to check other workspaces first.
-- Scoped to released_at is null so a released domain can always be
-- reclaimed (by the same workspace re-adding it, or a different one, each
-- still subject to the real DNS ownership check below) without the
-- history row in the way. This is a claim registry, not an ownership
-- check -- actually sending email from an unverified claim is still
-- blocked by Resend's own DNS verification, so this index alone can never
-- let a domain be used without the customer having proven DNS control of
-- it, only decide who gets to attempt that proof first.
create unique index if not exists workspace_email_domains_domain_active_unique
  on public.workspace_email_domains (domain)
  where released_at is null;

-- Releases a workspace's own sending domain -- deliberately does NOT call
-- is_workspace_operational(). Still requires the same settings.manage
-- permission the existing write policies on this table require (no
-- weakening of who may act), just not that the workspace also be
-- currently paying. The caller (app/api/email-domain/disconnect) handles
-- the actual Resend-side release (deleteResendDomain) before calling this
-- -- that is third-party-provider cleanup, not something a SQL function
-- can do, since it requires an outbound HTTPS call.
create or replace function public.release_workspace_email_domain(p_domain_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_is_primary boolean;
  v_released_at timestamptz;
begin
  select workspace_id, is_primary, released_at into v_workspace_id, v_is_primary, v_released_at
  from public.workspace_email_domains where id = p_domain_id;

  if v_workspace_id is null then
    raise exception 'sending domain not found';
  end if;
  if not has_permission(v_workspace_id, 'settings.manage') then
    raise exception 'insufficient permissions to manage this workspace''s integrations';
  end if;
  if v_released_at is not null then
    return; -- already released; idempotent, not an error
  end if;

  update public.workspace_email_domains
  set released_at = now(), is_primary = false
  where id = p_domain_id;

  if v_is_primary then
    update public.workspace_email_domains
    set is_primary = true
    where id = (
      select id from public.workspace_email_domains
      where workspace_id = v_workspace_id and released_at is null
      order by created_at asc
      limit 1
    );
  end if;
end;
$$;

revoke all on function public.release_workspace_email_domain(uuid) from public;
grant execute on function public.release_workspace_email_domain(uuid) to authenticated;

create or replace function public.release_website_custom_domain(p_website_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
begin
  select workspace_id into v_workspace_id from public.site_websites where id = p_website_id;

  if v_workspace_id is null then
    raise exception 'website not found';
  end if;
  if not has_permission(v_workspace_id, 'site_pages.manage') then
    raise exception 'insufficient permissions to manage this website';
  end if;

  update public.site_websites
  set custom_domain = null, domain_verified = false, domain_verified_at = null
  where id = p_website_id;
end;
$$;

revoke all on function public.release_website_custom_domain(uuid) from public;
grant execute on function public.release_website_custom_domain(uuid) to authenticated;
