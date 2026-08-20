-- Requested: some legitimate clients genuinely share a phone or email
-- (spouses, business partners) -- the duplicate check should still warn,
-- but not hard-block. p_force_create lets the caller proceed after the
-- user has explicitly confirmed "this isn't actually the same person."
create or replace function public.create_client(
  p_workspace_id uuid,
  p_client_type text,
  p_first_name text default null::text,
  p_last_name text default null::text,
  p_business_name text default null::text,
  p_date_of_birth date default null::date,
  p_primary_email text default null::text,
  p_primary_phone text default null::text,
  p_ssn text default null::text,
  p_ein text default null::text,
  p_itin text default null::text,
  p_force_create boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_normalized_email citext;
  v_normalized_phone text;
  v_ssn_hash text;
  v_ein_hash text;
  v_existing record;
  v_new_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'clients.create') then
    raise exception 'insufficient permissions to create a client in this workspace';
  end if;

  v_normalized_email := nullif(lower(btrim(p_primary_email)), '');
  v_normalized_phone := nullif(regexp_replace(coalesce(p_primary_phone, ''), '\D', '', 'g'), '');
  v_ssn_hash := case when p_ssn is not null and btrim(p_ssn) <> ''
    then encode(digest(regexp_replace(p_ssn, '\D', '', 'g') || p_workspace_id::text, 'sha256'), 'hex') end;
  v_ein_hash := case when p_ein is not null and btrim(p_ein) <> ''
    then encode(digest(regexp_replace(p_ein, '\D', '', 'g') || p_workspace_id::text, 'sha256'), 'hex') end;

  if not p_force_create then
    select id, array_remove(array[
        case when v_ssn_hash is not null and ssn_hash = v_ssn_hash then 'ssn' end,
        case when v_ein_hash is not null and ein_hash = v_ein_hash then 'ein' end,
        case when v_normalized_email is not null and normalized_email = v_normalized_email then 'email' end,
        case when v_normalized_phone is not null and normalized_phone = v_normalized_phone then 'phone' end
      ], null) as matched_on
    into v_existing
    from public.clients
    where workspace_id = p_workspace_id
      and merged_into_client_id is null
      and (
        (v_ssn_hash is not null and ssn_hash = v_ssn_hash)
        or (v_ein_hash is not null and ein_hash = v_ein_hash)
        or (v_normalized_email is not null and normalized_email = v_normalized_email)
        or (v_normalized_phone is not null and normalized_phone = v_normalized_phone)
      )
    limit 1;

    if v_existing.id is not null then
      return jsonb_build_object('client_id', v_existing.id, 'is_new', false, 'duplicate_matched_on', to_jsonb(v_existing.matched_on));
    end if;
  end if;

  insert into public.clients (
    workspace_id, client_type, first_name, last_name, business_name, date_of_birth,
    primary_email, primary_phone, normalized_email, normalized_phone,
    ssn_encrypted, ssn_last4, ssn_hash, ein_encrypted, ein_last4, ein_hash,
    itin_encrypted, itin_last4, itin_hash, created_by
  ) values (
    p_workspace_id, p_client_type, p_first_name, p_last_name, p_business_name, p_date_of_birth,
    p_primary_email, p_primary_phone, v_normalized_email, v_normalized_phone,
    public.encrypt_client_secret(p_ssn), nullif(right(regexp_replace(coalesce(p_ssn, ''), '\D', '', 'g'), 4), ''), v_ssn_hash,
    public.encrypt_client_secret(p_ein), nullif(right(regexp_replace(coalesce(p_ein, ''), '\D', '', 'g'), 4), ''), v_ein_hash,
    public.encrypt_client_secret(p_itin), nullif(right(regexp_replace(coalesce(p_itin, ''), '\D', '', 'g'), 4), ''),
    case when p_itin is not null and btrim(p_itin) <> '' then encode(digest(regexp_replace(p_itin, '\D', '', 'g') || p_workspace_id::text, 'sha256'), 'hex') end,
    auth.uid()
  )
  returning id into v_new_id;

  return jsonb_build_object('client_id', v_new_id, 'is_new', true, 'duplicate_matched_on', '[]'::jsonb);
end;
$function$;
