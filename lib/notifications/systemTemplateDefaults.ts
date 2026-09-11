// Compiled-in fallback copy for the handful of transactional sends the app
// itself depends on (portal invite activation, appointment reminders, an
// automation's staff-notification broadcast, the organizer "needs more
// info" notice). Per explicit product direction, no workspace gets ANY
// preloaded template row -- these used to be seeded into email_templates/
// sms_templates on every workspace so the lookups below would never come up
// empty, which is exactly the "preloaded content" the policy forbids. The
// content now lives here instead: a firm's own workspace-owned template
// (matched by slug) is still always preferred, and only an unconfigured
// workspace falls back to this, so nothing appears in any workspace's
// template list until a firm chooses to add one.
export const SYSTEM_EMAIL_TEMPLATE_DEFAULTS: Record<string, { subject: string; body_html: string }> = {
  "portal-invite-email": {
    subject: "Welcome to {{FirmName}} -- Activate Your Client Portal",
    body_html: `Hello {{ClientFirstName}},

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

{{FirmAddress}}`,
  },
  "appointment-reminder": {
    subject: "Upcoming appointment: {{title}}",
    body_html: `Hi,

This is a reminder about the upcoming appointment "{{title}}" on {{start_at}}.

Location: {{location}}

Thank you.`,
  },
  "automation-staff-notification": {
    subject: "{{firm_name}}: {{message}}",
    body_html: `Hi,

{{message}}

Client: {{client_name}}
Engagement: {{engagement_number}}

-- {{firm_name}} automations`,
  },
  "organizer-information-request": {
    subject: "We need more information on your organizer",
    body_html: `Hello,

{{message}}

Please log in to your portal to review and respond:

{{portal_link}}

Thank you,
Your tax team`,
  },
};

export const SYSTEM_SMS_TEMPLATE_DEFAULTS: Record<string, { body: string }> = {
  "organizer-information-request": {
    body: "We need more info on your organizer: {{message}} Log in to respond: {{portal_link}}",
  },
};

// renderPortalInviteEmail takes {subject, body} (not body_html) -- same
// content as SYSTEM_EMAIL_TEMPLATE_DEFAULTS["portal-invite-email"], just
// reshaped for the two portal-invite send paths that call it directly
// instead of going through the generic notification_queue dispatcher.
export const PORTAL_INVITE_EMAIL_DEFAULT = {
  subject: SYSTEM_EMAIL_TEMPLATE_DEFAULTS["portal-invite-email"].subject,
  body: SYSTEM_EMAIL_TEMPLATE_DEFAULTS["portal-invite-email"].body_html,
};
