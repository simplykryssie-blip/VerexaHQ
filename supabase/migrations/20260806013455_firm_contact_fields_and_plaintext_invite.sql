alter table public.workspaces
  add column if not exists phone text,
  add column if not exists website text,
  add column if not exists mailing_address text;

update public.email_templates
set
  subject = 'Welcome to {{FirmName}} -- Activate Your Client Portal',
  body_html = $body$Hello {{ClientFirstName}},

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

{{FirmAddress}}$body$,
  merge_fields = '["ClientFirstName", "FirmName", "PortalActivationButton", "PortalActivationLink", "AssignedOrganizerList", "FirmPhone", "FirmEmail", "FirmWebsite", "FirmAddress"]'::jsonb,
  updated_at = now()
where slug = 'portal-invite-email' and workspace_id is null;
