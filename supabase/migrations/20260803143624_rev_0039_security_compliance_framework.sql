alter table public.user_profiles
  add column failed_login_count integer not null default 0,
  add column locked_until timestamptz,
  add column mfa_enabled boolean not null default false,
  add column mfa_enrolled_at timestamptz;

comment on column public.user_profiles.locked_until is 'Account lockout expiry after too many failed logins; null = not locked.';

create table public.workspace_security_policies (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  password_min_length integer not null default 12,
  password_require_uppercase boolean not null default true,
  password_require_number boolean not null default true,
  password_require_symbol boolean not null default false,
  password_expiry_days integer,
  session_timeout_minutes integer not null default 60,
  max_failed_login_attempts integer not null default 5,
  lockout_duration_minutes integer not null default 15,
  mfa_required boolean not null default false,
  mfa_required_for_roles text[] not null default '{}',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table public.workspace_security_policies is 'Workspace-configurable identity security policy: password rules, session timeout, lockout thresholds, MFA requirements. password_expiry_days null = passwords never expire.';

create trigger set_updated_at before update on public.workspace_security_policies for each row execute function public.set_updated_at();
create trigger audit_workspace_security_policies after insert or update or delete on public.workspace_security_policies for each row execute function public.audit_trigger_fn();

alter table public.workspace_security_policies enable row level security;

create policy workspace_security_policies_select on public.workspace_security_policies
  for select using (public.is_workspace_member(workspace_id));
create policy workspace_security_policies_insert on public.workspace_security_policies
  for insert with check (public.has_permission(workspace_id, 'security.manage'));
create policy workspace_security_policies_update on public.workspace_security_policies
  for update using (public.has_permission(workspace_id, 'security.manage')) with check (public.has_permission(workspace_id, 'security.manage'));
create policy workspace_security_policies_delete on public.workspace_security_policies
  for delete using (public.has_permission(workspace_id, 'security.manage'));

create table public.login_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  ip_address inet,
  user_agent text,
  success boolean not null,
  failure_reason text,
  created_at timestamptz not null default now()
);
comment on table public.login_history is 'Append-only login attempt log. Written by a server-side auth hook via record_login_attempt(), never directly by clients.';

create index login_history_user_idx on public.login_history (user_id, created_at desc);
create index login_history_workspace_idx on public.login_history (workspace_id, created_at desc);
create index login_history_failed_idx on public.login_history (created_at desc) where not success;

alter table public.login_history enable row level security;

create policy login_history_select on public.login_history
  for select using (
    user_id = (select auth.uid())
    or (workspace_id is not null and public.is_workspace_admin(workspace_id))
  );

create or replace function public.record_login_attempt(
  p_user_id uuid,
  p_workspace_id uuid,
  p_success boolean,
  p_ip_address inet default null,
  p_user_agent text default null,
  p_failure_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy record;
begin
  insert into public.login_history (user_id, workspace_id, ip_address, user_agent, success, failure_reason)
  values (p_user_id, p_workspace_id, p_ip_address, p_user_agent, p_success, p_failure_reason);

  if p_success then
    update public.user_profiles set failed_login_count = 0, locked_until = null, last_seen_at = now() where id = p_user_id;
  else
    select * into v_policy from public.workspace_security_policies where workspace_id = p_workspace_id;
    update public.user_profiles
    set failed_login_count = failed_login_count + 1,
        locked_until = case
          when failed_login_count + 1 >= coalesce(v_policy.max_failed_login_attempts, 5)
          then now() + make_interval(mins => coalesce(v_policy.lockout_duration_minutes, 15))
          else locked_until
        end
    where id = p_user_id;
  end if;
end;
$$;
comment on function public.record_login_attempt(uuid, uuid, boolean, inet, text, text) is 'Server-side only: records a login attempt and applies the workspace''s lockout policy. Not callable by anon/authenticated -- a client-supplied success flag can''t be trusted.';

revoke execute on function public.record_login_attempt(uuid, uuid, boolean, inet, text, text) from public, anon, authenticated;

create or replace function public.is_account_locked(p_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((select locked_until > now() from public.user_profiles where id = p_user_id), false);
$$;

revoke execute on function public.is_account_locked(uuid) from public;
grant execute on function public.is_account_locked(uuid) to authenticated;

create table public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_fingerprint text not null,
  device_name text,
  last_seen_at timestamptz not null default now(),
  trusted_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (user_id, device_fingerprint)
);
comment on table public.trusted_devices is 'Devices a user has marked trusted, to skip MFA prompts until expires_at.';

create index trusted_devices_user_idx on public.trusted_devices (user_id);

alter table public.trusted_devices enable row level security;

create policy trusted_devices_select on public.trusted_devices
  for select using (user_id = (select auth.uid()));
create policy trusted_devices_insert on public.trusted_devices
  for insert with check (user_id = (select auth.uid()));
create policy trusted_devices_update on public.trusted_devices
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy trusted_devices_delete on public.trusted_devices
  for delete using (user_id = (select auth.uid()));

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  consent_type text not null check (consent_type in (
    'terms_of_service', 'privacy_policy', 'e_signature_consent', 'portal_invitation', 'communication_preferences'
  )),
  version text not null,
  accepted_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  check (user_id is not null or client_id is not null)
);
comment on table public.consent_records is 'Append-only consent trail: ToS/privacy policy acceptance, e-signature consent, portal invitation acceptance, communication preferences -- always timestamped, versioned, user/client-tracked, and IP-stamped.';

create index consent_records_user_idx on public.consent_records (user_id, consent_type);
create index consent_records_client_idx on public.consent_records (client_id, consent_type);
create index consent_records_workspace_idx on public.consent_records (workspace_id);

alter table public.consent_records enable row level security;

create policy consent_records_select on public.consent_records
  for select using (
    user_id = (select auth.uid())
    or (workspace_id is not null and public.is_workspace_member(workspace_id))
  );

create or replace function public.record_consent(
  p_consent_type text,
  p_version text,
  p_workspace_id uuid default null,
  p_client_id uuid default null,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_client_id is not null then
    if p_workspace_id is null or not public.is_workspace_member(p_workspace_id) then
      raise exception 'insufficient permissions to record consent for this client';
    end if;
  end if;

  insert into public.consent_records (workspace_id, user_id, client_id, consent_type, version, ip_address, user_agent)
  values (p_workspace_id, case when p_client_id is null then auth.uid() else null end, p_client_id, p_consent_type, p_version, p_ip_address, p_user_agent)
  returning id into v_id;

  return v_id;
end;
$$;
comment on function public.record_consent(text, text, uuid, uuid, inet, text) is 'Records a consent event for the calling user (p_client_id null) or, if staff, on behalf of a client in their workspace.';

revoke execute on function public.record_consent(text, text, uuid, uuid, inet, text) from public, anon;
grant execute on function public.record_consent(text, text, uuid, uuid, inet, text) to authenticated;

create table public.workspace_retention_policies (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  documents_retention_days integer,
  messages_retention_days integer,
  audit_logs_retention_days integer,
  archived_clients_retention_days integer,
  archived_engagements_retention_days integer,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table public.workspace_retention_policies is 'Per-workspace data retention windows. Every column defaults to null (retain indefinitely) -- retention periods are never hardcoded.';

create trigger set_updated_at before update on public.workspace_retention_policies for each row execute function public.set_updated_at();
create trigger audit_workspace_retention_policies after insert or update or delete on public.workspace_retention_policies for each row execute function public.audit_trigger_fn();

alter table public.workspace_retention_policies enable row level security;

create policy workspace_retention_policies_select on public.workspace_retention_policies
  for select using (public.is_workspace_member(workspace_id));
create policy workspace_retention_policies_insert on public.workspace_retention_policies
  for insert with check (public.has_permission(workspace_id, 'security.manage'));
create policy workspace_retention_policies_update on public.workspace_retention_policies
  for update using (public.has_permission(workspace_id, 'security.manage')) with check (public.has_permission(workspace_id, 'security.manage'));
create policy workspace_retention_policies_delete on public.workspace_retention_policies
  for delete using (public.has_permission(workspace_id, 'security.manage'));
