-- Public Organizer portal-account authorization fix.
--
-- Root cause: link_public_portal_account() only ever checked that the
-- caller-supplied p_email matched p_auth_user_id's own auth.users row -- it
-- never checked p_auth_user_id = auth.uid(). Its two anon-reachable callers
-- (submit_public_organizer_response_with_signup, capture_public_lead_from_
-- contact_step) both invoke it immediately after supabase.auth.signUp(),
-- before the visitor has clicked their confirmation-email link -- at that
-- point auth.uid() is null (this project requires email confirmation before
-- a session exists; see app/auth/confirm/route.ts and the "Check your email
-- ... to confirm your new client portal account" copy in
-- PublicOrganizerForm.tsx), so simply requiring auth.uid() = p_auth_user_id
-- at the old call sites would break every legitimate signup. Separately,
-- submit_public_organizer_response_with_signup's optional p_client_id let a
-- caller attach the submission (and, via link_public_portal_account, a
-- portal account) to ANY existing client in the token's workspace, with no
-- check that it related to the submitter's own email/phone at all.
--
-- Fix, in two parts:
--  1. Client binding: p_client_id is no longer trusted by
--     submit_public_organizer_response_with_signup -- the client is always
--     (re-)derived via find_or_create_public_lead() from the submitter's own
--     email/phone, exactly like every other public capture path already
--     does (capture_public_lead_from_contact_step, the public booking API).
--  2. Identity binding: neither anon-reachable function creates the
--     client_portal_users row directly anymore. A new activate_public_
--     portal_signup(p_token), grantable to `authenticated` only, does that
--     -- called from app/auth/confirm/route.ts strictly AFTER
--     exchangeCodeForSession()/verifyOtp() has established a real session,
--     so it can trust auth.uid() and the confirmed auth.users.email
--     directly instead of any caller-supplied value. The organizer's public
--     token (already visible to the browser -- it's the page's own URL) is
--     carried through signUp()'s user_metadata (pending_portal_token),
--     mirroring the existing pending_invite_token/pending_signup_next
--     pattern in this same file, and re-resolved to a workspace server-side
--     exactly like the submit RPCs already do.
--  3. Defense in depth: link_public_portal_account itself now enforces
--     auth.uid() = p_auth_user_id unconditionally, requires the auth
--     user's email to be confirmed, and requires p_client_id to actually
--     belong to p_workspace_id -- so it is safe even if some future caller
--     is added without following the two rules above.
--  4. Organizer-engagement gate: a confirmed session + a matching/creatable
--     client alone is not proof of engagement with a SPECIFIC organizer --
--     the public token is meant to be shared, so anyone who finds it could
--     otherwise call activate_public_portal_signup directly and self-grant
--     portal access to their own pre-existing client record (entered by
--     staff through some unrelated channel) despite never having submitted
--     anything. activate_public_portal_signup now additionally requires an
--     existing organizer_responses row for the exact (client, template)
--     pair with is_public_submission = true -- the one column set only by
--     the two public submission RPCs below, never by execute_automation_step
--     or copy_shared_engagement (the only other functions that write to
--     organizer_responses, for staff/automation- and ERO-sharing-originated
--     rows respectively).
--
-- A follow-up review found sign_public_engagement_letter_with_signup shares
-- the exact same identity-binding shape (calls link_public_portal_account
-- immediately after signUp(), before confirmation) -- it is fixed here the
-- same way, via a narrowly-scoped activate_public_engagement_letter_signup
-- rather than folding it into activate_public_portal_signup, since the two
-- workflows resolve a different template table and have no other overlap.
-- engagement_letter_public_signatures needs no is_public_submission-style
-- flag: unlike organizer_responses, only two functions ever write to it
-- (sign_public_engagement_letter and sign_public_engagement_letter_with_
-- signup, both genuinely public paths -- there is no staff/automation/ERO-
-- sharing writer), so the mere existence of a row for the exact (client,
-- template) pair is already fully reliable evidence of a real public
-- signing.
--
-- Scope: this migration touches the four functions in the original
-- vulnerable chain (link_public_portal_account, submit_public_organizer_
-- response_with_signup, capture_public_lead_from_contact_step,
-- activate_public_portal_signup) plus, from the follow-up review,
-- sign_public_engagement_letter_with_signup and the new
-- activate_public_engagement_letter_signup. sign_public_engagement_letter
-- (the non-signup variant) is untouched -- it never called
-- link_public_portal_account. No RLS, grants outside this fix, tables, or
-- other unrelated functions are touched.

create or replace function public.link_public_portal_account(
  p_workspace_id uuid,
  p_client_id uuid,
  p_auth_user_id uuid,
  p_email text,
  p_name text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_auth_email text;
  v_email_confirmed boolean;
  v_is_primary boolean;
begin
  -- The calling session's own identity is the only identity this function
  -- will ever trust -- a caller-supplied p_auth_user_id that doesn't match
  -- auth.uid() is never proof of anything.
  if p_auth_user_id is distinct from auth.uid() then
    raise exception 'account verification failed';
  end if;

  select email, (email_confirmed_at is not null)
    into v_auth_email, v_email_confirmed
  from auth.users
  where id = p_auth_user_id;

  if v_auth_email is null or lower(v_auth_email) <> lower(btrim(p_email)) then
    raise exception 'account verification failed';
  end if;
  if not coalesce(v_email_confirmed, false) then
    raise exception 'email must be confirmed before portal access can be granted';
  end if;

  if not exists (
    select 1 from public.clients where id = p_client_id and workspace_id = p_workspace_id
  ) then
    raise exception 'client does not belong to this workspace';
  end if;

  if exists (
    select 1 from public.client_portal_users where client_id = p_client_id and user_id = p_auth_user_id
  ) then
    return;
  end if;

  v_is_primary := not exists (
    select 1 from public.client_portal_users where client_id = p_client_id and status = 'active'
  );

  insert into public.client_portal_users (client_id, workspace_id, invited_email, invited_name, is_primary, status, user_id, accepted_at)
  values (p_client_id, p_workspace_id, lower(btrim(p_email)), nullif(btrim(p_name), ''), v_is_primary, 'active', p_auth_user_id, now());
end;
$function$;

create or replace function public.submit_public_organizer_response_with_signup(
  p_token uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_answers jsonb,
  p_auth_user_id uuid,
  p_client_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_template_id uuid;
  v_requires_signup boolean;
  v_client_id uuid;
  v_client_name text;
  v_response_id uuid;
  v_answer jsonb;
  v_signature_request_id uuid;
  v_field record;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;
  if p_auth_user_id is null then
    raise exception 'A portal account is required for this link';
  end if;

  select id, workspace_id, requires_portal_signup into v_template_id, v_workspace_id, v_requires_signup
  from public.organizer_templates
  where public_token = p_token and is_public = true and status = 'published';

  if v_template_id is null then
    raise exception 'This link is no longer available';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if not v_requires_signup then
    raise exception 'This organizer does not use portal signup';
  end if;

  -- p_client_id is no longer trusted (it let a caller attach the submission
  -- to any client in this workspace regardless of who they actually are) --
  -- the client is always (re-)derived from the submitter's own contact
  -- details, same as every other public capture path in this app. The
  -- parameter is kept on the signature for backward compatibility with the
  -- current frontend, which may still send it; the value is ignored.
  v_client_id := public.find_or_create_public_lead(v_workspace_id, p_first_name, p_last_name, p_email, p_phone);
  v_client_name := btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));

  insert into public.organizer_responses (workspace_id, client_id, organizer_template_id, status, submitted_at, is_public_submission)
  values (v_workspace_id, v_client_id, v_template_id, 'submitted', now(), true)
  returning id into v_response_id;

  for v_answer in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    insert into public.organizer_response_answers (organizer_response_id, organizer_field_id, value, instance_index)
    select v_response_id, (v_answer->>'field_id')::uuid, v_answer->'value', coalesce((v_answer->>'instance_index')::int, 0)
    where exists (
      select 1 from public.organizer_fields f where f.id = (v_answer->>'field_id')::uuid and f.organizer_template_id = v_template_id
    );
  end loop;

  perform public.resolve_organizer_response_service(v_response_id);

  -- The portal account itself is no longer created here -- at this point
  -- p_auth_user_id's email is not yet confirmed and auth.uid() is null, so
  -- there is no session to trust. See activate_public_portal_signup(),
  -- called from app/auth/confirm/route.ts once the visitor actually
  -- confirms their email.

  for v_field in
    select f.id, f.client_profile_field
    from public.organizer_fields f
    where f.organizer_template_id = v_template_id and f.client_profile_field is not null and f.parent_field_id is null
  loop
    perform public._propose_client_field_from_organizer_answer(
      v_workspace_id, v_client_id, v_response_id, v_field.id, v_field.client_profile_field,
      (select a.value from public.organizer_response_answers a where a.organizer_response_id = v_response_id and a.organizer_field_id = v_field.id and a.instance_index = 0)
    );
  end loop;

  v_signature_request_id := public.resolve_and_sign_organizer_response(v_response_id, v_workspace_id, v_template_id, v_client_name, p_email);

  return jsonb_build_object('ok', true, 'client_id', v_client_id, 'response_id', v_response_id, 'signature_request_id', v_signature_request_id);
end;
$function$;

create or replace function public.capture_public_lead_from_contact_step(
  p_token uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_service_ids uuid[],
  p_auth_user_id uuid default null::uuid,
  p_middle_name text default null::text,
  p_suffix text default null::text,
  p_mailing_street text default null::text,
  p_mailing_city text default null::text,
  p_mailing_state text default null::text,
  p_mailing_zip text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_has_address boolean;
  v_service_id uuid;
begin
  select ot.workspace_id into v_workspace_id
  from public.organizer_templates ot
  where ot.public_token = p_token and ot.is_public = true and ot.status = 'published';

  if v_workspace_id is null then
    raise exception 'This link is no longer available';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;

  v_client_id := public.find_or_create_public_lead(v_workspace_id, p_first_name, p_last_name, p_email, p_phone);

  update public.clients
  set middle_name = coalesce(middle_name, nullif(btrim(p_middle_name), '')),
      suffix = coalesce(suffix, nullif(btrim(p_suffix), ''))
  where id = v_client_id;

  if p_mailing_street is not null or p_mailing_city is not null or p_mailing_state is not null or p_mailing_zip is not null then
    select exists(select 1 from public.client_addresses where client_id = v_client_id and address_type = 'mailing') into v_has_address;
    if not v_has_address then
      insert into public.client_addresses (client_id, workspace_id, address_type, is_primary, display_order, street, city, state, zip)
      values (v_client_id, v_workspace_id, 'mailing', true, 0, nullif(btrim(p_mailing_street), ''), nullif(btrim(p_mailing_city), ''), nullif(btrim(p_mailing_state), ''), nullif(btrim(p_mailing_zip), ''));
    end if;
  end if;

  foreach v_service_id in array coalesce(p_service_ids, array[]::uuid[])
  loop
    insert into public.client_service_interests (client_id, workspace_id, service_category_id, service_id, source)
    select v_client_id, v_workspace_id, s.service_category_id, s.id, 'public_organizer_signup'
    from public.services s
    where s.id = v_service_id;
  end loop;

  -- Portal-account creation is deferred to activate_public_portal_signup()
  -- (see submit_public_organizer_response_with_signup above for why); this
  -- function no longer calls link_public_portal_account directly. The
  -- p_auth_user_id parameter is kept on the signature for backward
  -- compatibility with the current frontend; the value is no longer used.

  perform public._notify_admins_of_new_public_lead(v_workspace_id, v_client_id);

  return jsonb_build_object('client_id', v_client_id);
end;
$function$;

-- New: called only from app/auth/confirm/route.ts, strictly after a real
-- session has been established for the just-confirmed user (exchangeCode
-- ForSession/verifyOtp). Derives every security-relevant value from that
-- session -- auth.uid() and the confirmed auth.users.email -- never from a
-- parameter, and re-resolves the workspace from the same public organizer
-- token used at signup time (itself not a secret -- it's the page's own
-- URL), exactly like submit_public_organizer_response_with_signup and
-- capture_public_lead_from_contact_step already do.
--
-- A real confirmed session + a matching/creatable client is NOT, by
-- itself, proof this user ever engaged with THIS organizer -- the token is
-- intentionally public, so anyone who finds it (it's meant to be shared)
-- and happens to already be a client of this same firm under another
-- channel could otherwise self-grant portal access with no submission at
-- all. is_public_submission is a real, not-null, default-false column set
-- only by submit_public_organizer_response/_with_signup -- never by
-- execute_automation_step or copy_shared_engagement, the only other two
-- functions that insert into organizer_responses (staff/automation- and
-- ERO-sharing-originated rows respectively). Requiring an existing
-- is_public_submission=true row for this exact (client, template) pair
-- before granting access ties activation to actual prior public engagement
-- with this specific organizer, not merely to a matching email.
create or replace function public.activate_public_portal_signup(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_auth_user_id uuid;
  v_email text;
  v_email_confirmed boolean;
  v_meta jsonb;
  v_first_name text;
  v_last_name text;
  v_workspace_id uuid;
  v_template_id uuid;
  v_client_id uuid;
begin
  v_auth_user_id := auth.uid();
  if v_auth_user_id is null then
    raise exception 'authentication required';
  end if;

  select email, (email_confirmed_at is not null), raw_user_meta_data
    into v_email, v_email_confirmed, v_meta
  from auth.users
  where id = v_auth_user_id;

  if v_email is null then
    raise exception 'account not found';
  end if;
  if not coalesce(v_email_confirmed, false) then
    raise exception 'email must be confirmed before portal access can be granted';
  end if;

  select id, workspace_id into v_template_id, v_workspace_id
  from public.organizer_templates
  where public_token = p_token and is_public = true and status = 'published';

  if v_workspace_id is null then
    raise exception 'This organizer link is no longer available';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  v_first_name := nullif(btrim(coalesce(v_meta->>'first_name', '')), '');
  v_last_name := nullif(btrim(coalesce(v_meta->>'last_name', '')), '');

  v_client_id := public.find_or_create_public_lead(v_workspace_id, v_first_name, v_last_name, v_email, null);

  if not exists (
    select 1 from public.organizer_responses
    where client_id = v_client_id
      and organizer_template_id = v_template_id
      and is_public_submission = true
  ) then
    raise exception 'no public organizer submission found for this account and link';
  end if;

  perform public.link_public_portal_account(
    v_workspace_id, v_client_id, v_auth_user_id, v_email,
    btrim(coalesce(v_first_name, '') || ' ' || coalesce(v_last_name, ''))
  );

  return jsonb_build_object('ok', true, 'workspace_id', v_workspace_id, 'client_id', v_client_id);
end;
$function$;

revoke all on function public.activate_public_portal_signup(uuid) from public;
revoke all on function public.activate_public_portal_signup(uuid) from anon;
grant execute on function public.activate_public_portal_signup(uuid) to authenticated;

-- sign_public_engagement_letter_with_signup: same fix as
-- submit_public_organizer_response_with_signup above -- no longer creates
-- the portal account directly (auth.uid() is null at this point, before
-- confirmation). Everything else (validation, server-side letter
-- rendering, the engagement_letter_public_signatures insert) is unchanged,
-- so the signature record is still written pre-confirmation exactly as
-- before -- only the portal-linking moment moves to after confirmation.
create or replace function public.sign_public_engagement_letter_with_signup(
  p_token uuid,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_typed_name text,
  p_auth_user_id uuid,
  p_signature_type text default 'typed'::text,
  p_signature_image_path text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_template record;
  v_client_id uuid;
  v_client_name text;
  v_resolved_html text;
  v_signature_id uuid;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'Email is required';
  end if;
  if p_typed_name is null or btrim(p_typed_name) = '' then
    raise exception 'A typed signature is required';
  end if;
  if p_signature_image_path is null or btrim(p_signature_image_path) = '' then
    raise exception 'A drawn signature is required';
  end if;
  if p_auth_user_id is null then
    raise exception 'A portal account is required for this link';
  end if;

  select elt.id, elt.workspace_id, elt.body_html, elt.requires_portal_signup,
         w.name as firm_name, public.format_mailing_address(w.mailing_address) as firm_address, w.phone as firm_phone
  into v_template
  from public.engagement_letter_templates elt
  join public.workspaces w on w.id = elt.workspace_id
  where elt.public_token = p_token and elt.is_public = true and elt.status = 'published';

  if v_template.id is null then
    raise exception 'This link is no longer available';
  end if;
  if not v_template.requires_portal_signup then
    raise exception 'This engagement letter does not use portal signup';
  end if;

  v_client_id := public.find_or_create_public_lead(v_template.workspace_id, p_first_name, p_last_name, p_email, p_phone);
  v_client_name := btrim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));
  v_resolved_html := public.render_engagement_letter_merge_fields(v_template.body_html, v_client_name, v_template.firm_name, v_template.firm_address, v_template.firm_phone);

  insert into public.engagement_letter_public_signatures (
    workspace_id, engagement_letter_template_id, client_id,
    signer_name, signer_email, signer_phone, resolved_body_html, typed_name,
    signature_type, signature_image_path
  ) values (
    v_template.workspace_id, v_template.id, v_client_id,
    v_client_name, btrim(p_email), nullif(btrim(coalesce(p_phone, '')), ''), v_resolved_html, btrim(p_typed_name),
    'drawn', p_signature_image_path
  )
  returning id into v_signature_id;

  -- The portal account itself is no longer created here -- see
  -- activate_public_engagement_letter_signup(), called from
  -- app/auth/confirm/route.ts once the visitor actually confirms their
  -- email. auth.uid() is null at this point (pre-confirmation), so there
  -- is no session for link_public_portal_account's hardened check to trust.

  return jsonb_build_object('ok', true, 'signature_id', v_signature_id);
end;
$function$;

-- New: mirrors activate_public_portal_signup's shape, scoped to
-- engagement_letter_templates instead of organizer_templates. Called only
-- from app/auth/confirm/route.ts strictly after a real session has been
-- established (exchangeCodeForSession/verifyOtp). Derives every
-- security-relevant value from that session -- auth.uid() and the
-- confirmed auth.users.email -- never from a parameter. The engagement
-- gate here needs no is_public_submission-style flag: only the two public
-- signing functions ever write to engagement_letter_public_signatures, so
-- an existing row for the exact (client, template) pair is already fully
-- reliable evidence of a genuine public signing.
create or replace function public.activate_public_engagement_letter_signup(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_auth_user_id uuid;
  v_email text;
  v_email_confirmed boolean;
  v_meta jsonb;
  v_first_name text;
  v_last_name text;
  v_workspace_id uuid;
  v_template_id uuid;
  v_client_id uuid;
begin
  v_auth_user_id := auth.uid();
  if v_auth_user_id is null then
    raise exception 'authentication required';
  end if;

  select email, (email_confirmed_at is not null), raw_user_meta_data
    into v_email, v_email_confirmed, v_meta
  from auth.users
  where id = v_auth_user_id;

  if v_email is null then
    raise exception 'account not found';
  end if;
  if not coalesce(v_email_confirmed, false) then
    raise exception 'email must be confirmed before portal access can be granted';
  end if;

  select id, workspace_id into v_template_id, v_workspace_id
  from public.engagement_letter_templates
  where public_token = p_token and is_public = true and status = 'published';

  if v_workspace_id is null then
    raise exception 'This engagement letter link is no longer available';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  v_first_name := nullif(btrim(coalesce(v_meta->>'first_name', '')), '');
  v_last_name := nullif(btrim(coalesce(v_meta->>'last_name', '')), '');

  v_client_id := public.find_or_create_public_lead(v_workspace_id, v_first_name, v_last_name, v_email, null);

  if not exists (
    select 1 from public.engagement_letter_public_signatures
    where client_id = v_client_id
      and engagement_letter_template_id = v_template_id
  ) then
    raise exception 'no signed engagement letter found for this account and link';
  end if;

  perform public.link_public_portal_account(
    v_workspace_id, v_client_id, v_auth_user_id, v_email,
    btrim(coalesce(v_first_name, '') || ' ' || coalesce(v_last_name, ''))
  );

  return jsonb_build_object('ok', true, 'workspace_id', v_workspace_id, 'client_id', v_client_id);
end;
$function$;

revoke all on function public.activate_public_engagement_letter_signup(uuid) from public;
revoke all on function public.activate_public_engagement_letter_signup(uuid) from anon;
grant execute on function public.activate_public_engagement_letter_signup(uuid) to authenticated;
