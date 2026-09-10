-- ERO Profile needs an owner name (a plain workspace-level field, same
-- shape as phone/website/mailing_address which already live directly on
-- workspaces) and a firm-level CAF number (only user_profiles.caf_number,
-- personal, existed before -- this is the firm's own, alongside its
-- EIN/EFIN/PTIN in firm_tax_profile, masked and encrypted the same way).
alter table public.workspaces add column owner_name text;

alter table public.firm_tax_profile add column caf_encrypted bytea;
alter table public.firm_tax_profile add column caf_last4 text;

create or replace function public.set_firm_tax_profile(
  p_workspace_id uuid,
  p_ein text default null,
  p_efin text default null,
  p_ptin text default null,
  p_clear_ein boolean default false,
  p_clear_efin boolean default false,
  p_clear_ptin boolean default false,
  p_supported_filing_states text[] default null,
  p_regular_office_hours jsonb default null,
  p_tax_season_hours jsonb default null,
  p_caf text default null,
  p_clear_caf boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to manage this workspace''s tax profile';
  end if;

  if p_efin is not null and exists (
    select 1 from public.firm_tax_profile
    where efin_hash = public.hash_firm_secret(p_efin) and workspace_id <> p_workspace_id
  ) then
    raise exception 'This EFIN is already registered to another Verexa account.';
  end if;

  if p_ptin is not null and (
    exists (select 1 from public.firm_tax_profile where ptin_hash = public.hash_firm_secret(p_ptin) and workspace_id <> p_workspace_id)
    or exists (select 1 from public.user_profiles where ptin_hash = public.hash_firm_secret(p_ptin))
  ) then
    raise exception 'This PTIN is already registered to another Verexa account.';
  end if;

  insert into public.firm_tax_profile (workspace_id)
  values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  update public.firm_tax_profile set
    ein_encrypted = case when p_clear_ein then null when p_ein is not null then public.encrypt_firm_secret(p_ein) else ein_encrypted end,
    ein_last4 = case when p_clear_ein then null when p_ein is not null then right(regexp_replace(p_ein, '\D', '', 'g'), 4) else ein_last4 end,
    efin_encrypted = case when p_clear_efin then null when p_efin is not null then public.encrypt_firm_secret(p_efin) else efin_encrypted end,
    efin_last4 = case when p_clear_efin then null when p_efin is not null then right(regexp_replace(p_efin, '\D', '', 'g'), 4) else efin_last4 end,
    efin_hash = case when p_clear_efin then null when p_efin is not null then public.hash_firm_secret(p_efin) else efin_hash end,
    ptin_encrypted = case when p_clear_ptin then null when p_ptin is not null then public.encrypt_firm_secret(p_ptin) else ptin_encrypted end,
    ptin_last4 = case when p_clear_ptin then null when p_ptin is not null then right(regexp_replace(p_ptin, '\D', '', 'g'), 4) else ptin_last4 end,
    ptin_hash = case when p_clear_ptin then null when p_ptin is not null then public.hash_firm_secret(p_ptin) else ptin_hash end,
    caf_encrypted = case when p_clear_caf then null when p_caf is not null then public.encrypt_firm_secret(p_caf) else caf_encrypted end,
    caf_last4 = case when p_clear_caf then null when p_caf is not null then right(regexp_replace(p_caf, '\D', '', 'g'), 4) else caf_last4 end,
    supported_filing_states = coalesce(p_supported_filing_states, supported_filing_states),
    regular_office_hours = coalesce(p_regular_office_hours, regular_office_hours),
    tax_season_hours = coalesce(p_tax_season_hours, tax_season_hours),
    updated_by = auth.uid(),
    updated_at = now()
  where workspace_id = p_workspace_id;
end;
$function$;

create or replace function public.reveal_firm_caf(p_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_value text;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to reveal this workspace''s CAF number';
  end if;

  select public.decrypt_firm_secret(caf_encrypted) into v_value
  from public.firm_tax_profile where workspace_id = p_workspace_id;

  insert into public.audit_log (workspace_id, actor_id, entity_type, entity_id, action, severity)
  values (p_workspace_id, auth.uid(), 'firm_tax_profile', p_workspace_id, 'reveal_caf', 'warning');

  return v_value;
end;
$function$;

grant execute on function public.reveal_firm_caf(uuid) to authenticated;
