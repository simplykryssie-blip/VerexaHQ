import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Privacy Policy -- Verexa HQ CRM",
  description: "How Verexa HQ CRM collects, uses, and protects information.",
};

const EFFECTIVE_DATE = "August 18, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Verexa HQ CRM</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">Effective {EFFECTIVE_DATE}</p>

      <p className="mt-6 text-sm leading-relaxed text-slate">
        Verexa HQ CRM (&ldquo;Verexa,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) provides software that tax offices, accounting
        firms, and other professional service firms (each, a &ldquo;Firm&rdquo;) use to manage their own clients&rsquo;
        engagements, documents, and communications. This policy explains what information Verexa collects, how it&rsquo;s
        used, and how it&rsquo;s protected. It applies to Firm staff who use Verexa directly and to the clients of a Firm
        who interact with Verexa through a Firm&rsquo;s client portal.
      </p>

      <Section title="1. Verexa's role: we are a service provider to the Firm">
        <p>
          A Firm that subscribes to Verexa is the data controller for its own clients&rsquo; information -- the Firm decides
          what information to collect from its clients and why, consistent with its own engagement letters and professional
          obligations. Verexa acts as the Firm&rsquo;s service provider (data processor): we host, secure, and make that
          information available to the Firm and to the Firm&rsquo;s clients through the client portal, but we do not decide
          what a Firm collects, and we do not use a Firm&rsquo;s client data for our own independent purposes.
        </p>
        <p>
          If you are a client of a tax office or firm using Verexa and have a question about your own information, contact
          that firm directly -- they control your data and can act on requests to access, correct, or delete it. If you
          need help reaching us about how Verexa itself operates, see the Contact section below.
        </p>
      </Section>

      <Section title="2. Information we collect">
        <p><strong className="text-ink">Firm staff accounts:</strong> name, email, phone, role/permissions, login and authentication activity (including multi-factor authentication enrollment), and any profile photo a staff member uploads.</p>
        <p>
          <strong className="text-ink">Client and taxpayer information, entered by a Firm or its clients:</strong> this can
          include names, dates of birth, Social Security numbers or other tax identification numbers, mailing and email
          addresses, phone numbers, filing status, dependents, income and expense documentation, bank account information
          for refund/payment purposes, uploaded tax documents and other files, and the content of intake questionnaires
          (&ldquo;organizers&rdquo;), engagement letters, e-signatures, and messages exchanged through the platform.
        </p>
        <p>
          <strong className="text-ink">Billing information:</strong> when a Firm or its client pays through Verexa,
          payment card and billing details are collected and processed directly by Stripe, our payment processor --
          Verexa does not store full card numbers.
        </p>
        <p>
          <strong className="text-ink">Usage and device information:</strong> IP address, browser type, pages visited, and
          similar diagnostic and audit-log data, used for security, troubleshooting, and maintaining a record of who
          accessed or changed a client&rsquo;s file.
        </p>
      </Section>

      <Section title="3. How information is used">
        <p>Information is used only to operate the platform on behalf of the Firm that collected it, specifically to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Let Firm staff manage client engagements, documents, billing, and communications</li>
          <li>Let a Firm&rsquo;s clients securely submit information and documents and view their own file through the client portal</li>
          <li>Generate and route documents the Firm configures, such as intake organizers, engagement letters, e-signature requests, and document requests</li>
          <li>Send account, appointment, and engagement-related notifications by email, SMS, or in-app notification</li>
          <li>Process payments a Firm or its client initiates</li>
          <li>Secure the platform, investigate misuse, enforce our Terms of Service, and comply with legal obligations</li>
          <li>Maintain and improve the reliability and performance of the platform</li>
        </ul>
        <p>
          We do not sell client information, and we do not use a Firm&rsquo;s client data to train third-party AI models or
          for advertising.
        </p>
      </Section>

      <Section title="4. Tax return information (IRC Section 7216)">
        <p>
          Federal law (26 U.S.C. &sect; 7216 and its regulations) restricts how tax return preparers -- and businesses like
          Verexa that provide services to preparers -- may use or disclose taxpayer return information. Verexa handles tax
          return information solely to provide the software services a Firm has engaged us for (hosting, storage, document
          routing, and similar auxiliary services incident to tax return preparation), consistent with the exceptions
          Section 7216 and its regulations permit for that kind of service provider. Verexa does not use taxpayer return
          information for any other purpose, including marketing.
        </p>
      </Section>

      <Section title="5. Sub-processors and third-party service providers">
        <p>
          Verexa relies on the following service providers to operate the platform. Each processes information only as
          necessary to provide its specific function, under its own contractual and security commitments to us.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-ink">Supabase</strong> -- our database, authentication, and file storage infrastructure. All client data lives here, isolated per Firm.</li>
          <li><strong className="text-ink">Vercel</strong> -- application hosting and content delivery.</li>
          <li><strong className="text-ink">Stripe</strong> -- payment processing for subscription billing and, where a Firm enables it, client invoicing.</li>
          <li><strong className="text-ink">Twilio</strong> -- SMS delivery for text notifications and reminders a Firm configures.</li>
          <li><strong className="text-ink">Resend</strong> -- transactional email delivery (account, engagement, and document notifications).</li>
          <li><strong className="text-ink">Zoom</strong> -- only if a Firm staff member connects their own Zoom account, used to generate meeting links for appointments they schedule.</li>
        </ul>
        <p>
          We may add or change service providers from time to time as the platform evolves; any new provider is held to
          the same security and confidentiality standards described here.
        </p>
      </Section>

      <Section title="6. Data security">
        <p>
          Data is encrypted in transit (TLS) and at rest. Each Firm&rsquo;s data is isolated from every other Firm&rsquo;s
          data at the database level (row-level security), so one Firm can never see another Firm&rsquo;s clients.
          Sensitive fields such as Social Security numbers and connected-account credentials (e.g. a staff member&rsquo;s
          Zoom OAuth tokens) are encrypted at rest. Access within a Firm is controlled by role-based permissions, and
          Firms can require multi-factor authentication for their staff. All access and changes to client records are
          logged.
        </p>
        <p>
          No system is perfectly secure, and we cannot guarantee absolute security. If we become aware of a breach
          affecting client information, we will notify the affected Firm(s) without undue delay so they can meet their
          own notification obligations to their clients and regulators.
        </p>
      </Section>

      <Section title="7. Data retention">
        <p>
          We retain client and taxpayer information for as long as a Firm&rsquo;s account remains active, and after
          account closure for whichever is longer of: (a) 12 months, or (b) the minimum period applicable tax
          recordkeeping rules require for the records involved (for example, IRS recordkeeping and due-diligence rules
          applicable to return preparers, which commonly require retaining copies of returns or the information used to
          prepare them for at least three years). A Firm may request deletion of its data sooner, subject to any
          independent legal retention obligations the Firm itself is subject to as the data controller. Staff account and
          audit-log data is retained as needed for security and legal-compliance purposes.
        </p>
      </Section>

      <Section title="8. Your rights and choices">
        <p>
          If you are a Firm&rsquo;s client, requests to access, correct, or delete your information should go to that
          Firm -- they control your data and are best positioned to act on it, including any obligations they have to you
          directly. If a Firm asks us to delete data on their behalf, we will do so except where we are required to retain
          it for legal, tax-recordkeeping, or security purposes as described above.
        </p>
        <p>
          Firm staff can update their own account information directly within Verexa (Settings &gt; My Account), and can
          disconnect optional integrations such as Zoom at any time from Settings &gt; Integrations.
        </p>
      </Section>

      <Section title="9. Children's information">
        <p>
          Verexa is intended for use by professional service firms and their adult clients. We do not knowingly collect
          information directly from children; where dependent information (including minors) is entered by a Firm or a
          client as part of a tax filing, it is handled with the same protections described throughout this policy.
        </p>
      </Section>

      <Section title="10. Changes to this policy">
        <p>
          We may update this policy as the platform or our practices change. Material changes will be reflected by
          updating the effective date above, and where appropriate we will notify Firms directly.
        </p>
      </Section>

      <Section title="11. Contact">
        <p>
          Verexa HQ CRM is based in Louisiana. Questions about this policy or how Verexa handles information can be sent
          to{" "}
          <a href="mailto:support@verexahq.com" className="text-accent hover:underline">
            support@verexahq.com
          </a>
          .
        </p>
      </Section>
    </main>
  );
}
