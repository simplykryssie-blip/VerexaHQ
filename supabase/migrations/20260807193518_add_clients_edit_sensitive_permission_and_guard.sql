-- 1. New permission, same pattern as the existing clients.* rows
insert into permissions (key, category, description)
values ('clients.edit_sensitive', 'clients', 'Edit sensitive client fields (date of birth, SSN, EIN, ITIN)');

-- 2. Grant to the 6 roles confirmed to already hold plain clients.edit
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r, permissions p
where p.key = 'clients.edit_sensitive'
  and r.id in (
    'b6f4bd5d-4f58-4281-836b-1829da2d8d25', -- Admin
    '48b794f5-6779-49cd-8844-462ea9ed7109', -- Administrative Staff
    'd0d9f37f-3fe4-448d-a71f-b54c37e1fcaa', -- ERO
    '1540d630-4937-437c-97e2-d18b2db22d3c', -- Manager
    '68b91a4e-0b16-4ad3-8322-1935931d854a', -- Owner
    'b4ace40a-dd09-4717-903c-0b20bccf1338'  -- PTIN Preparer
  );

-- 3. Grant Receptionist plain clients.edit (had none before) -- NOT clients.edit_sensitive
insert into role_permissions (role_id, permission_id)
select '2468e7c7-eb95-45c7-be83-9388300b9996', p.id -- Receptionist
from permissions p
where p.key = 'clients.edit';

-- 4. Column-level guard, since RLS can't see individual columns
create or replace function guard_client_sensitive_fields()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if (
    new.date_of_birth is distinct from old.date_of_birth
    or new.ssn_encrypted is distinct from old.ssn_encrypted
    or new.ssn_hash is distinct from old.ssn_hash
    or new.ssn_last4 is distinct from old.ssn_last4
    or new.ein_encrypted is distinct from old.ein_encrypted
    or new.ein_hash is distinct from old.ein_hash
    or new.ein_last4 is distinct from old.ein_last4
    or new.itin_encrypted is distinct from old.itin_encrypted
    or new.itin_hash is distinct from old.itin_hash
    or new.itin_last4 is distinct from old.itin_last4
  ) and not has_permission(new.workspace_id, 'clients.edit_sensitive') then
    raise exception 'insufficient permissions to edit sensitive client fields (date of birth, SSN, EIN, ITIN)';
  end if;
  return new;
end;
$$;

create trigger trg_guard_client_sensitive_fields
  before update on clients
  for each row
  execute function guard_client_sensitive_fields();
