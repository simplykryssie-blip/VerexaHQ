-- Organizer builder had no dedicated Name/Email/Phone/Website/Yes-No/
-- Section field types -- every organizer used two short_text boxes for a
-- person's name and short_text for email/phone, with no structure, no
-- input-appropriate keyboard/validation, and (for name specifically) no
-- single client_profile_field to prefill from or propose changes back to
-- as one unit. Adds the missing types plus the already-reserved but never
-- wired-up 'rich_text' (Content block) and new 'section' (non-repeating
-- divider/heading), matching Cognito Forms' field reference the user
-- pointed at. 'price' was intentionally left out -- Currency already
-- covers every dollar-amount case a tax organizer needs.
alter table public.organizer_fields drop constraint organizer_fields_field_type_check;
alter table public.organizer_fields add constraint organizer_fields_field_type_check check (
  field_type = any (array[
    'short_text', 'paragraph', 'name', 'email', 'phone', 'website',
    'number', 'currency', 'date', 'dropdown', 'checkbox', 'yes_no',
    'radio_button', 'multiple_choice', 'address', 'ssn', 'ein',
    'file_upload', 'signature', 'repeating_section', 'page_break',
    'section', 'rich_text'
  ])
);

-- A name field's first/last parts map to the client's separate
-- first_name/last_name columns as one unit. The client record has no home
-- for a middle name or suffix, so those two stay organizer-only -- not
-- proposed back, matching how mailing_address's street2 has no equivalent
-- on file today either.
alter table public.organizer_fields drop constraint organizer_fields_client_profile_field_check;
alter table public.organizer_fields add constraint organizer_fields_client_profile_field_check check (
  client_profile_field is null or client_profile_field = any (array[
    'full_name', 'first_name', 'last_name', 'business_name', 'primary_email',
    'primary_phone', 'mailing_address', 'date_of_birth'
  ])
);

-- Mirrors propose_client_mailing_address's shape exactly (same
-- _decide_client_field_change plumbing, same batch/notify pattern) but
-- against the two columns that already live directly on clients rather
-- than a satellite table.
create or replace function public.propose_client_full_name(
  p_first_name text,
  p_last_name text,
  p_organizer_response_id uuid default null,
  p_organizer_field_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_portal_user_id uuid;
  v_client_id uuid;
  v_workspace_id uuid;
  v_cur_first text;
  v_cur_last text;
  v_batch uuid := gen_random_uuid();
  v_source text := case when p_organizer_field_id is not null then 'organizer' else 'basic_info' end;
  v_any_queued boolean := false;
  v_decision text;
begin
  select cpu.id, cpu.client_id, cpu.workspace_id into v_portal_user_id, v_client_id, v_workspace_id
  from public.client_portal_users cpu where cpu.user_id = auth.uid() and cpu.status = 'active' limit 1;
  if v_client_id is null then
    raise exception 'no active portal identity for this user';
  end if;

  select first_name, last_name into v_cur_first, v_cur_last from public.clients where id = v_client_id;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'clients', 'first_name', null, v_cur_first, p_first_name, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.clients set first_name = p_first_name, updated_at = now() where id = v_client_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  v_decision := public._decide_client_field_change(v_workspace_id, v_client_id, 'clients', 'last_name', null, v_cur_last, p_last_name, v_source, p_organizer_response_id, p_organizer_field_id, v_batch, v_portal_user_id);
  if v_decision = 'applied' then update public.clients set last_name = p_last_name, updated_at = now() where id = v_client_id; end if;
  if v_decision = 'queued' then v_any_queued := true; end if;

  if v_any_queued then
    perform public._notify_admins_of_pending_client_change(v_workspace_id, v_client_id, v_batch);
  end if;
end;
$$;

revoke all on function public.propose_client_full_name(text, text, uuid, uuid) from public, anon;
grant execute on function public.propose_client_full_name(text, text, uuid, uuid) to authenticated;

-- Fix the live Form 1040 template so it actually uses the new types instead
-- of two short_text boxes for a name and short_text for email/phone --
-- confirmed zero organizer_response_answers exist for any of these four
-- fields yet, so this is a clean structural change, not a data migration.
update public.organizer_fields
set field_type = 'name', label = 'Full name', client_profile_field = 'full_name'
where id = '35b0918b-b15b-464f-ac7b-8dae602b7be0';

delete from public.organizer_fields where id = 'fb906f07-8e0f-4e6e-bddb-d15671b8dac3';

update public.organizer_fields set field_type = 'email' where id = '85f748b7-c254-4f05-acaf-b0bd0daa9c69';
update public.organizer_fields set field_type = 'phone' where id = 'ef84d4a3-38d9-42d1-93c0-dbb06b1b9ce3';
