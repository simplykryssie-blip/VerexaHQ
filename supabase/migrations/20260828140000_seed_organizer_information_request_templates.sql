-- send_organizer_information_request() (organizer_information_request_items.sql)
-- has queued notifications under template_key 'organizer-information-request'
-- on both the Email and SMS channels since it shipped, but no migration ever
-- created that template for any workspace -- every attempt to notify a
-- client this way has failed with "No published {Email,SMS} template for
-- key 'organizer-information-request'" (confirmed live in notification_queue).
-- Same "fixed system plumbing every workspace needs" reasoning as the portal
-- invite/appointment-reminder/staff-notification templates in
-- 20260826210000: backfilled into every existing workspace, and added to
-- create_workspace() so new workspaces get it too.

insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, status)
select w.id, 'Organizer Information Request', 'organizer-information-request', 'internal',
  'We need more information on your organizer',
  $body$Hello,

{{message}}

Please log in to your portal to review and respond:

{{portal_link}}

Thank you,
Your tax team$body$,
  '["message", "portal_link"]'::jsonb,
  'published'
from public.workspaces w
where not exists (
  select 1 from public.email_templates existing
  where existing.workspace_id = w.id and existing.slug = 'organizer-information-request'
);

insert into public.sms_templates (workspace_id, name, slug, body, merge_fields, status)
select w.id, 'Organizer Information Request', 'organizer-information-request',
  'We need more info on your organizer: {{message}} Log in to respond: {{portal_link}}',
  '["message", "portal_link"]'::jsonb,
  'published'
from public.workspaces w
where not exists (
  select 1 from public.sms_templates existing
  where existing.workspace_id = w.id and existing.slug = 'organizer-information-request'
);

create or replace function public.create_workspace(p_name text, p_workspace_type text default 'independent_ptin'::text, p_timezone text default 'America/New_York'::text, p_owner_user_id uuid default null::uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_owner_role_id uuid;
  v_slug text;
  v_suffix int := 0;
  v_owner_uid uuid;
begin
  if p_owner_user_id is not null then
    if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
      raise exception 'p_owner_user_id can only be set by a service-role caller';
    end if;
    v_owner_uid := p_owner_user_id;
  else
    v_owner_uid := auth.uid();
  end if;

  if v_owner_uid is null then
    raise exception 'create_workspace requires an authenticated user';
  end if;

  if exists (select 1 from public.client_portal_users where user_id = v_owner_uid and status = 'active') then
    raise exception 'this account is a client portal account and cannot create a staff workspace';
  end if;

  select id into v_owner_role_id from public.roles where workspace_id is null and slug = 'owner';
  if v_owner_role_id is null then
    raise exception 'system owner role is not seeded';
  end if;

  v_slug := regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  if v_slug = '' then
    v_slug := 'workspace';
  end if;
  while exists (select 1 from public.workspaces where slug = v_slug || case when v_suffix = 0 then '' else '-' || v_suffix end) loop
    v_suffix := v_suffix + 1;
  end loop;
  if v_suffix > 0 then
    v_slug := v_slug || '-' || v_suffix;
  end if;

  insert into public.workspaces (name, slug, workspace_type, timezone, created_by, primary_contact_email)
  values (p_name, v_slug, p_workspace_type, p_timezone, v_owner_uid, (select email from auth.users where id = v_owner_uid))
  returning id into v_workspace_id;

  insert into public.workspace_users (workspace_id, user_id, role_id, is_owner, status, joined_at)
  values (v_workspace_id, v_owner_uid, v_owner_role_id, true, 'active', now());

  insert into public.branding (workspace_id, display_name)
  values (v_workspace_id, p_name);

  insert into public.workspace_feature_flags (workspace_id, feature_flag_id, is_enabled)
  select v_workspace_id, id, true from public.feature_flags where is_core;

  -- Fixed system plumbing every workspace needs regardless of the "no
  -- preloaded content" policy for opt-in business content (organizer
  -- templates/services/pipelines): invite_to_portal, the appointment
  -- reminder cron, notify-staff automation actions, and the organizer
  -- "needs more info" notification all depend on one of these existing to
  -- send anything at all.
  insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, status)
  values
    (
      v_workspace_id, 'Client Portal Invite', 'portal-invite-email', 'onboarding',
      'Welcome to {{FirmName}} -- Activate Your Client Portal',
      $body1$Hello {{ClientFirstName}},

Welcome to {{FirmName}}! We're excited to work with you.

To get started, we've created your secure client portal. This portal will be your one-stop location to complete your onboarding, securely upload documents, communicate with our team, review requests, sign documents electronically, and stay informed throughout your engagement.

Your Next Steps

1. Click the secure link below to activate your client portal.
2. Create your password and enable two-factor authentication (recommended).
3. Complete your Core Client Profile. This one-time profile includes your basic information, such as your name, date of birth, Social Security Number or ITIN, address, and contact information. You can update this information anytime if it changes.
4. Complete any organizers or questionnaires our team has assigned to you.
5. Upload any requested documents through the secure portal.

Activate Your Portal

{{PortalActivationButton}}

If the button doesn't work, copy and paste this link into your browser:

{{PortalActivationLink}}

Assigned Tasks

The following items are currently waiting for you:

{{AssignedOrganizerList}}

Don't worry if additional requests appear later. As we review your information, we may request additional documents or ask follow-up questions to ensure we have everything needed to complete your services accurately.

Need Help?

If you have any questions or experience trouble accessing your portal, please contact our office.

{{FirmName}}

Phone: {{FirmPhone}}

Email: {{FirmEmail}}

Website: {{FirmWebsite}}

For your protection, please do not email sensitive information such as Social Security Numbers, tax documents, or financial records. Always upload confidential information through your secure client portal.

We appreciate the opportunity to serve you and look forward to working with you.

Sincerely,

{{FirmName}}

{{FirmAddress}}$body1$,
      '["ClientFirstName", "FirmName", "PortalActivationButton", "PortalActivationLink", "AssignedOrganizerList", "FirmPhone", "FirmEmail", "FirmWebsite", "FirmAddress"]'::jsonb,
      'published'
    ),
    (
      v_workspace_id, 'Appointment Reminder', 'appointment-reminder', 'appointments',
      'Upcoming appointment: {{title}}',
      $body2$Hi,

This is a reminder about the upcoming appointment "{{title}}" on {{start_at}}.

Location: {{location}}

Thank you.$body2$,
      '["title", "start_at", "location"]'::jsonb,
      'published'
    ),
    (
      v_workspace_id, 'Automation Staff Notification', 'automation-staff-notification', 'internal',
      '{{firm_name}}: {{message}}',
      $body3$Hi,

{{message}}

Client: {{client_name}}
Engagement: {{engagement_number}}

-- {{firm_name}} automations$body3$,
      '["message", "client_name", "engagement_number", "firm_name", "status"]'::jsonb,
      'published'
    ),
    (
      v_workspace_id, 'Organizer Information Request', 'organizer-information-request', 'internal',
      'We need more information on your organizer',
      $body4$Hello,

{{message}}

Please log in to your portal to review and respond:

{{portal_link}}

Thank you,
Your tax team$body4$,
      '["message", "portal_link"]'::jsonb,
      'published'
    );

  insert into public.sms_templates (workspace_id, name, slug, body, merge_fields, status)
  values (
    v_workspace_id, 'Organizer Information Request', 'organizer-information-request',
    'We need more info on your organizer: {{message}} Log in to respond: {{portal_link}}',
    '["message", "portal_link"]'::jsonb,
    'published'
  );

  update public.user_profiles set default_workspace_id = v_workspace_id
  where id = v_owner_uid and default_workspace_id is null;

  return v_workspace_id;
end;
$function$;
