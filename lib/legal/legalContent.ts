// The single canonical source for the Terms of Service and Privacy Policy
// body content -- plain data (not JSX), so it can be rendered two ways from
// the exact same source with no risk of drift between them: as real markup
// on /terms and /privacy (components/legal/LegalDocumentBody.tsx), and as a
// plain HTML string captured into platform_terms_acceptance_archive at
// acceptance time (lib/legal/renderLegalContentSnapshot.ts). Kept as plain
// data rather than rendered via react-dom/server because Next's app-router
// build rejects any module reachable from a Route Handler that imports
// react-dom/server.
export type LegalBlock = { type: "p"; html: string } | { type: "list"; items: string[] };

export type LegalSection = { title: string; blocks: LegalBlock[] };

export const TERMS_INTRO_HTML =
  "These Terms of Service (&ldquo;Terms&rdquo;) govern use of Verexa HQ CRM (&ldquo;Verexa,&rdquo; &ldquo;we,&rdquo; " +
  "&ldquo;us&rdquo;), a software platform for tax offices, accounting firms, and other professional service firms " +
  "(each, a &ldquo;Firm&rdquo;) to manage client engagements, documents, e-signatures, billing, and communications, " +
  "including a client-facing portal a Firm&rsquo;s own clients use. By creating an account or using Verexa, you agree " +
  "to these Terms on behalf of yourself and, if applicable, the Firm you represent.";

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: "1. Who these Terms apply to",
    blocks: [
      {
        type: "p",
        html:
          "A <strong>Firm</strong> is an organization that subscribes to Verexa. A <strong>Firm user</strong> is staff of that Firm with a Verexa login. A <strong>Client</strong> is a Firm&rsquo;s own client who is invited to use that Firm&rsquo;s client portal. These Terms apply to Firm users and Clients alike; where a provision applies to only one, it says so.",
      },
    ],
  },
  {
    title: "2. The Firm controls its own client data",
    blocks: [
      {
        type: "p",
        html:
          "As between a Firm and Verexa, the Firm owns and controls the client data it and its Clients enter into Verexa. Verexa provides the platform the Firm uses to collect, store, and act on that data, but does not decide what a Firm collects from its Clients or how the Firm uses it in its own practice. Each Firm is responsible for having a lawful basis to collect its Clients&rsquo; information (including Social Security numbers and other tax data), for the accuracy of what it enters or imports, and for complying with its own professional, tax-preparer, and data-protection obligations -- including 26 U.S.C. &sect; 7216 and its regulations governing use and disclosure of taxpayer return information.",
      },
    ],
  },
  {
    title: "3. Accounts and access",
    blocks: [
      {
        type: "p",
        html:
          "Firm users and Clients must keep their login credentials confidential and are responsible for activity under their account. A Firm is responsible for the staff it invites and the permissions it grants them, including promptly removing access for staff who leave the Firm. We may suspend or terminate an account that we reasonably believe is being used to violate these Terms or applicable law, or to compromise the security of the platform or another Firm&rsquo;s data.",
      },
    ],
  },
  {
    title: "4. Acceptable use",
    blocks: [
      { type: "p", html: "You agree not to:" },
      {
        type: "list",
        items: [
          "Use Verexa to collect or process information you don&rsquo;t have a lawful right or basis to collect",
          "Attempt to access another Firm&rsquo;s data or another user&rsquo;s account without authorization",
          "Probe, scan, or attempt to bypass the platform&rsquo;s security or rate limits",
          "Upload malicious code or use the platform to distribute it",
          "Use the platform in a way that violates applicable law, including tax-preparer confidentiality obligations",
        ],
      },
    ],
  },
  {
    title: "5. Subscriptions and billing",
    blocks: [
      {
        type: "p",
        html:
          "Paid Verexa subscriptions are billed through Stripe on the cycle a Firm selects at signup or in Settings. Where a Firm enables client invoicing or payment collection through Verexa, those payments are also processed through Stripe, subject to Stripe&rsquo;s own terms. Fees are non-refundable except where required by law or expressly stated otherwise at the time of purchase. We may change our pricing on notice; continued use after a price change takes effect constitutes acceptance of the new price for future billing cycles.",
      },
      {
        type: "p",
        html:
          "Prepaid balances purchased for SMS, email, or storage usage are also non-refundable and, if a workspace becomes Archived as described in Section 11, any unused prepaid balance is forfeited as described there.",
      },
    ],
  },
  {
    title: "6. Third-party integrations",
    blocks: [
      {
        type: "p",
        html:
          'Verexa integrates with third-party services a Firm may choose to connect, including Zoom (video meetings for appointments), Stripe (payments), Twilio (SMS), and Resend (email delivery). Connecting an integration is optional and at the Firm&rsquo;s (or individual staff member&rsquo;s) discretion, and use of that third-party service is also governed by its own terms and privacy policy. We are not responsible for the availability or conduct of third-party services.',
      },
    ],
  },
  {
    title: "7. No tax, legal, or accounting advice from Verexa",
    blocks: [
      {
        type: "p",
        html:
          "Verexa is software. We do not prepare tax returns, provide tax or legal advice, or review the accuracy or completeness of any information a Firm or Client enters. Responsibility for the professional services delivered using Verexa rests entirely with the Firm.",
      },
    ],
  },
  {
    title: "8. Confidentiality and security",
    blocks: [
      {
        type: "p",
        html:
          'We maintain reasonable administrative, technical, and physical safeguards designed to protect the confidentiality and security of data stored in Verexa, as described in our <a href="/privacy">Privacy Policy</a>. Firms and their staff are responsible for safeguarding their own login credentials and for the permissions they grant within their workspace.',
      },
    ],
  },
  {
    title: "9. Disclaimers",
    blocks: [
      {
        type: "p",
        html:
          'Verexa is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; To the fullest extent permitted by law, we disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the platform will be uninterrupted, error-free, or completely secure.',
      },
    ],
  },
  {
    title: "10. Limitation of liability",
    blocks: [
      {
        type: "p",
        html:
          "To the fullest extent permitted by law, Verexa will not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits, revenue, data, or goodwill, arising from your use of the platform. Our total liability for any claim arising out of or relating to these Terms or the platform will not exceed the amount the Firm paid us in the twelve (12) months preceding the claim.",
      },
    ],
  },
  {
    title: "11. Account Lifecycle, Suspension, Archiving, and Termination",
    blocks: [
      {
        type: "p",
        html:
          "A Firm may cancel its subscription at any time from Settings. We may also suspend or terminate access for non-payment, breach of these Terms, or as needed to protect the platform or other Firms. When access is suspended for non-payment, the workspace moves through the following states, measured from the date access was first suspended (&ldquo;Day 0&rdquo;):",
      },
      {
        type: "p",
        html:
          "<strong>Suspended (Day 0 through Day 29).</strong> Normal workspace access for Firm users is unavailable. Firm users may access only the limited billing, account-recovery, and support functionality we make available for resolving the suspension. The Firm&rsquo;s existing Clients may continue to use the client portal to view their file, upload documents to existing engagements, and respond to outstanding requests, but no new engagements or normal business activity may be initiated. Automations and third-party integrations are disabled.",
      },
      {
        type: "p",
        html:
          "<strong>Archived (beginning Day 30).</strong> If access has not been restored by Day 30, the workspace becomes Archived. Client portal access ends, and all Firm access -- other than the export process described in the Data Export section below -- remains unavailable. Any unused prepaid SMS, email, or storage balance is forfeited at this time and will not be refunded, restored, or credited. Data continues to be retained as described in our Privacy Policy.",
      },
      {
        type: "p",
        html:
          "<strong>Permanently Archived; Account Closure (beginning Day 90).</strong> If access has not been restored within 90 days after the date it was first suspended (Day 0) -- not 90 days after the workspace became Archived -- the workspace becomes Permanently Archived: the Verexa subscription and account relationship terminates (&ldquo;Account Closure&rdquo;), and the workspace remains permanently unavailable for normal use. Permanently Archiving a workspace and Account Closure are not, by themselves, a deletion of data. Data associated with a Permanently Archived workspace continues to be retained and, once no longer required to be retained, may eventually be deleted, as described in our Privacy Policy.",
      },
      { type: "p", html: "We will provide notice of a Suspension using the contact information on file for the workspace." },
    ],
  },
  {
    title: "12. Data Export",
    blocks: [
      {
        type: "p",
        html:
          "Before a workspace becomes Archived (that is, during the first 30 days after Suspension), the Firm owner may use Verexa&rsquo;s self-service data export tool to obtain a copy of the workspace&rsquo;s Customer Data.",
      },
      {
        type: "p",
        html:
          "From the time a workspace becomes Archived through the date it becomes Permanently Archived (Day 30 through Day 90 after Suspension), a Firm may still obtain an export of its Customer Data, but only through Verexa Customer Support, and a $150 export assistance fee applies. This fee will be disclosed and must be agreed to before the export is performed.",
      },
      {
        type: "p",
        html:
          'The export window closes on Day 90 after Suspension, when the workspace becomes Permanently Archived. After that date, Verexa no longer offers export as a standard feature of the workspace. Closing the export window does not mean the data has been deleted -- retained data continues to be handled as described in our Privacy Policy. A Firm with a legitimate need to obtain data after this window has closed may contact <a href="mailto:support@verexahq.com">support@verexahq.com</a>, though Verexa is not obligated to provide export after the window closes.',
      },
    ],
  },
  {
    title: "13. Platform Intellectual Property and Customer Data",
    blocks: [
      {
        type: "p",
        html:
          '<strong>Verexa Platform IP.</strong> As between a Firm and Verexa, Verexa and its licensors own all right, title, and interest in and to the Verexa platform itself, including its software, source code, system architecture, database architecture, workflow engine, automation engine, pipeline engine, user interface, and other platform functionality, together with any generic templates, documentation, and platform configurations Verexa creates and makes generally available to Firms (&ldquo;Platform IP&rdquo;). Nothing in these Terms transfers any Platform IP to a Firm; a Firm&rsquo;s subscription grants only the right to use the platform as described in these Terms.',
      },
      {
        type: "p",
        html:
          '<strong>Customer Data.</strong> &ldquo;Customer Data&rdquo; means the data a Firm and its Clients create, upload, or enter into Verexa, including client records, taxpayer information, uploaded documents, client communications, internal notes, client contact information, engagement information, pricing information, business information, and the Firm&rsquo;s own workflow configurations, pipeline configurations, templates, and engagement letters. As stated in Section 2, the Firm owns and controls its own Customer Data. Customer Data does not become Verexa&rsquo;s property, and is not converted into Platform IP, merely because Verexa hosts it, because a workspace becomes Suspended, Archived, or Permanently Archived, or because Verexa retains it for the period described in our Privacy Policy.',
      },
      {
        type: "p",
        html:
          "<strong>Customer-created content vs. platform functionality.</strong> A Firm&rsquo;s specific workflow instructions, pipeline configurations, email and SMS content, documents, templates, engagement letters, and internal processes are that Firm&rsquo;s Customer Data. The underlying Verexa software and generic functionality that allows a Firm to build and run those things is Platform IP. Building or customizing content using Verexa&rsquo;s platform functionality does not give Verexa ownership of that content.",
      },
      {
        type: "p",
        html:
          "<strong>Voluntary template contributions.</strong> Verexa may in the future offer Firms the ability to voluntarily submit a workflow, pipeline, or template for publication in a marketplace, adaptation into a generalized template, or other use beyond the submitting Firm&rsquo;s own workspace. No such use of a Firm&rsquo;s customer-created content occurs today, and none will occur without that Firm&rsquo;s separate, explicit agreement presented at the time of submission -- participation in Verexa alone does not grant Verexa any such rights.",
      },
    ],
  },
  {
    title: "14. Governing law",
    blocks: [
      {
        type: "p",
        html: "These Terms are governed by the laws of the State of Louisiana, without regard to its conflict-of-laws principles.",
      },
    ],
  },
  {
    title: "15. Changes to these Terms",
    blocks: [
      {
        type: "p",
        html:
          "We may update these Terms from time to time. Material changes will be reflected by updating the effective date above, and where appropriate we will notify Firms directly. Continued use of Verexa after a change takes effect constitutes acceptance of the updated Terms.",
      },
    ],
  },
  {
    title: "16. Contact",
    blocks: [
      {
        type: "p",
        html:
          'Verexa HQ CRM is based in Louisiana. Questions about these Terms can be sent to <a href="mailto:support@verexahq.com">support@verexahq.com</a>.',
      },
    ],
  },
];

export const PRIVACY_INTRO_HTML =
  "Verexa HQ CRM (&ldquo;Verexa,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) provides software that tax offices, accounting " +
  "firms, and other professional service firms (each, a &ldquo;Firm&rdquo;) use to manage their own clients&rsquo; " +
  "engagements, documents, and communications. This policy explains what information Verexa collects, how it&rsquo;s " +
  "used, and how it&rsquo;s protected. It applies to Firm staff who use Verexa directly and to the clients of a Firm " +
  "who interact with Verexa through a Firm&rsquo;s client portal.";

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: "1. Verexa's role: we are a service provider to the Firm",
    blocks: [
      {
        type: "p",
        html:
          "A Firm that subscribes to Verexa is the data controller for its own clients&rsquo; information -- the Firm decides what information to collect from its clients and why, consistent with its own engagement letters and professional obligations. Verexa acts as the Firm&rsquo;s service provider (data processor): we host, secure, and make that information available to the Firm and to the Firm&rsquo;s clients through the client portal, but we do not decide what a Firm collects, and we do not use a Firm&rsquo;s client data for our own independent purposes.",
      },
      {
        type: "p",
        html:
          "If you are a client of a tax office or firm using Verexa and have a question about your own information, contact that firm directly -- they control your data and can act on requests to access, correct, or delete it. If you need help reaching us about how Verexa itself operates, see the Contact section below.",
      },
      {
        type: "p",
        html:
          "Data we continue to host or retain under Section 7 -- including during a Suspended, Archived, or Permanently Archived workspace -- remains the Firm&rsquo;s data. Retention for legal, contractual, or security purposes does not transfer ownership of that data to Verexa or convert it into Verexa&rsquo;s own property.",
      },
    ],
  },
  {
    title: "2. Information we collect",
    blocks: [
      {
        type: "p",
        html:
          "<strong>Firm staff accounts:</strong> name, email, phone, role/permissions, login and authentication activity (including multi-factor authentication enrollment), and any profile photo a staff member uploads.",
      },
      {
        type: "p",
        html:
          '<strong>Client and taxpayer information, entered by a Firm or its clients:</strong> this can include names, dates of birth, Social Security numbers or other tax identification numbers, mailing and email addresses, phone numbers, filing status, dependents, income and expense documentation, bank account information for refund/payment purposes, uploaded tax documents and other files, and the content of intake questionnaires (&ldquo;forms&rdquo;), engagement letters, e-signatures, and messages exchanged through the platform.',
      },
      {
        type: "p",
        html:
          "<strong>Billing information:</strong> when a Firm or its client pays through Verexa, payment card and billing details are collected and processed directly by Stripe, our payment processor -- Verexa does not store full card numbers.",
      },
      {
        type: "p",
        html:
          "<strong>Usage and device information:</strong> IP address, browser type, pages visited, and similar diagnostic and audit-log data, used for security, troubleshooting, and maintaining a record of who accessed or changed a client&rsquo;s file.",
      },
    ],
  },
  {
    title: "3. How information is used",
    blocks: [
      { type: "p", html: "Information is used only to operate the platform on behalf of the Firm that collected it, specifically to:" },
      {
        type: "list",
        items: [
          "Let Firm staff manage client engagements, documents, billing, and communications",
          "Let a Firm&rsquo;s clients securely submit information and documents and view their own file through the client portal",
          "Generate and route documents the Firm configures, such as intake forms, engagement letters, e-signature requests, and document requests",
          "Send account, appointment, and engagement-related notifications by email, SMS, or in-app notification",
          "Process payments a Firm or its client initiates",
          "Secure the platform, investigate misuse, enforce our Terms of Service, and comply with legal obligations",
          "Maintain and improve the reliability and performance of the platform",
        ],
      },
      {
        type: "p",
        html: "We do not sell client information, and we do not use a Firm&rsquo;s client data to train third-party AI models or for advertising.",
      },
      {
        type: "p",
        html:
          "<strong>Marketing and use of retained data.</strong> Verexa does not use a Firm&rsquo;s Customer Data -- including a Firm&rsquo;s client or taxpayer information -- to market Verexa&rsquo;s own services to that Firm&rsquo;s clients, and does not treat retained Customer Data as a marketing or solicitation list, whether the Firm&rsquo;s workspace is active, Suspended, Archived, or Permanently Archived. If Verexa were to market to individuals whose information it holds only because a Firm entered it as that Firm&rsquo;s client, it would do so only under a separate, lawful basis and consent obtained directly from those individuals -- never merely because a Firm&rsquo;s account ended or because Verexa continues to retain data under Section 7.",
      },
    ],
  },
  {
    title: "4. Tax return information (IRC Section 7216)",
    blocks: [
      {
        type: "p",
        html:
          "Federal law (26 U.S.C. &sect; 7216 and its regulations) restricts how tax return preparers -- and businesses like Verexa that provide services to preparers -- may use or disclose taxpayer return information. Verexa handles tax return information solely to provide the software services a Firm has engaged us for (hosting, storage, document routing, and similar auxiliary services incident to tax return preparation), consistent with the exceptions Section 7216 and its regulations permit for that kind of service provider. Verexa does not use taxpayer return information for any other purpose, including marketing.",
      },
    ],
  },
  {
    title: "5. Sub-processors and third-party service providers",
    blocks: [
      {
        type: "p",
        html:
          "Verexa relies on the following service providers to operate the platform. Each processes information only as necessary to provide its specific function, under its own contractual and security commitments to us.",
      },
      {
        type: "list",
        items: [
          "<strong>Supabase</strong> -- our database, authentication, and file storage infrastructure. All client data lives here, isolated per Firm.",
          "<strong>Vercel</strong> -- application hosting and content delivery.",
          "<strong>Stripe</strong> -- payment processing for subscription billing and, where a Firm enables it, client invoicing.",
          "<strong>Twilio</strong> -- SMS delivery for text notifications and reminders a Firm configures.",
          "<strong>Resend</strong> -- transactional email delivery (account, engagement, and document notifications).",
          "<strong>Zoom</strong> -- only if a Firm staff member connects their own Zoom account, used to generate meeting links for appointments they schedule.",
          "<strong>Sentry</strong> -- error monitoring. When the platform encounters a technical error, diagnostic details (such as the error message, the page or request involved, and browser/device information) are sent to Sentry so we can detect and fix issues. Sentry is not used to log normal activity, only errors.",
        ],
      },
      {
        type: "p",
        html:
          "We may add or change service providers from time to time as the platform evolves; any new provider is held to the same security and confidentiality standards described here.",
      },
    ],
  },
  {
    title: "6. Data security",
    blocks: [
      {
        type: "p",
        html:
          "Data is encrypted in transit (TLS) and at rest. Each Firm&rsquo;s data is isolated from every other Firm&rsquo;s data at the database level (row-level security), so one Firm can never see another Firm&rsquo;s clients. Sensitive fields such as Social Security numbers and connected-account credentials (e.g. a staff member&rsquo;s Zoom OAuth tokens) are encrypted at rest. Access within a Firm is controlled by role-based permissions, and Firms can require multi-factor authentication for their staff. All access and changes to client records are logged.",
      },
      {
        type: "p",
        html:
          "No system is perfectly secure, and we cannot guarantee absolute security. If we become aware of a breach affecting client information, we will notify the affected Firm(s) without undue delay so they can meet their own notification obligations to their clients and regulators.",
      },
    ],
  },
  {
    title: "7. Data retention",
    blocks: [
      {
        type: "p",
        html:
          "We retain client and taxpayer information for as long as a Firm&rsquo;s account remains active. &ldquo;Account Closure&rdquo; -- the termination of the Firm&rsquo;s Verexa subscription and account relationship, which occurs when a workspace becomes Permanently Archived as described in our Terms of Service -- is what starts the retention period described below. Suspension and Archiving are earlier stages of the same lifecycle and do not, by themselves, constitute Account Closure.",
      },
      {
        type: "p",
        html:
          "Following Account Closure, we retain client and taxpayer information for whichever is longer of: (a) 12 months, or (b) the minimum period applicable tax recordkeeping rules require for the records involved (for example, IRS recordkeeping and due-diligence rules applicable to return preparers, which commonly require retaining copies of returns or the information used to prepare them for at least three years). A Firm may request deletion of its data sooner, subject to any independent legal retention obligations the Firm itself is subject to as the data controller. Staff account and audit-log data is retained as needed for security and legal-compliance purposes.",
      },
      {
        type: "p",
        html:
          "Once the retention period(s) above have expired, and once any active legal hold, dispute, or security or fraud investigation requiring continued retention has been resolved, eligible data is reviewed and may be securely deleted. We do not delete data automatically on a fixed schedule; deletion occurs only after this review confirms no further retention obligation applies.",
      },
    ],
  },
  {
    title: "8. Your rights and choices",
    blocks: [
      {
        type: "p",
        html:
          "If you are a Firm&rsquo;s client, requests to access, correct, or delete your information should go to that Firm -- they control your data and are best positioned to act on it, including any obligations they have to you directly. If a Firm asks us to delete data on their behalf, we will do so except where we are required to retain it for legal, tax-recordkeeping, or security purposes as described above.",
      },
      {
        type: "p",
        html:
          "Firm staff can update their own account information directly within Verexa (Settings &gt; My Account), and can disconnect optional integrations such as Zoom at any time from Settings &gt; Integrations.",
      },
      {
        type: "p",
        html:
          "For a Firm&rsquo;s own account-level export rights (as distinct from an individual Client&rsquo;s request made directly to that Firm), see the Data Export section of our Terms of Service.",
      },
    ],
  },
  {
    title: "9. Children's information",
    blocks: [
      {
        type: "p",
        html:
          "Verexa is intended for use by professional service firms and their adult clients. We do not knowingly collect information directly from children; where dependent information (including minors) is entered by a Firm or a client as part of a tax filing, it is handled with the same protections described throughout this policy.",
      },
    ],
  },
  {
    title: "10. Changes to this policy",
    blocks: [
      {
        type: "p",
        html:
          "We may update this policy as the platform or our practices change. Material changes will be reflected by updating the effective date above, and where appropriate we will notify Firms directly.",
      },
    ],
  },
  {
    title: "11. Contact",
    blocks: [
      {
        type: "p",
        html:
          'Verexa HQ CRM is based in Louisiana. Questions about this policy or how Verexa handles information can be sent to <a href="mailto:support@verexahq.com">support@verexahq.com</a>.',
      },
    ],
  },
];
