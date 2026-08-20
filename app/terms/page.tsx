import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Terms of Service -- Verexa HQ CRM",
  description: "The terms governing use of Verexa HQ CRM.",
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

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Verexa HQ CRM</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted">Effective {EFFECTIVE_DATE}</p>

      <p className="mt-6 text-sm leading-relaxed text-slate">
        These Terms of Service (&ldquo;Terms&rdquo;) govern use of Verexa HQ CRM (&ldquo;Verexa,&rdquo; &ldquo;we,&rdquo;
        &ldquo;us&rdquo;), a software platform for tax offices, accounting firms, and other professional service firms
        (each, a &ldquo;Firm&rdquo;) to manage client engagements, documents, e-signatures, billing, and communications,
        including a client-facing portal a Firm&rsquo;s own clients use. By creating an account or using Verexa, you agree
        to these Terms on behalf of yourself and, if applicable, the Firm you represent.
      </p>

      <Section title="1. Who these Terms apply to">
        <p>
          A <strong className="text-ink">Firm</strong> is an organization that subscribes to Verexa. A{" "}
          <strong className="text-ink">Firm user</strong> is staff of that Firm with a Verexa login. A{" "}
          <strong className="text-ink">Client</strong> is a Firm&rsquo;s own client who is invited to use that Firm&rsquo;s
          client portal. These Terms apply to Firm users and Clients alike; where a provision applies to only one, it says
          so.
        </p>
      </Section>

      <Section title="2. The Firm controls its own client data">
        <p>
          As between a Firm and Verexa, the Firm owns and controls the client data it and its Clients enter into Verexa.
          Verexa provides the platform the Firm uses to collect, store, and act on that data, but does not decide what a
          Firm collects from its Clients or how the Firm uses it in its own practice. Each Firm is responsible for having
          a lawful basis to collect its Clients&rsquo; information (including Social Security numbers and other tax data),
          for the accuracy of what it enters or imports, and for complying with its own professional, tax-preparer, and
          data-protection obligations -- including 26 U.S.C. &sect; 7216 and its regulations governing use and disclosure
          of taxpayer return information.
        </p>
      </Section>

      <Section title="3. Accounts and access">
        <p>
          Firm users and Clients must keep their login credentials confidential and are responsible for activity under
          their account. A Firm is responsible for the staff it invites and the permissions it grants them, including
          promptly removing access for staff who leave the Firm. We may suspend or terminate an account that we
          reasonably believe is being used to violate these Terms or applicable law, or to compromise the security of the
          platform or another Firm&rsquo;s data.
        </p>
      </Section>

      <Section title="4. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Use Verexa to collect or process information you don&rsquo;t have a lawful right or basis to collect</li>
          <li>Attempt to access another Firm&rsquo;s data or another user&rsquo;s account without authorization</li>
          <li>Probe, scan, or attempt to bypass the platform&rsquo;s security or rate limits</li>
          <li>Upload malicious code or use the platform to distribute it</li>
          <li>Use the platform in a way that violates applicable law, including tax-preparer confidentiality obligations</li>
        </ul>
      </Section>

      <Section title="5. Subscriptions and billing">
        <p>
          Paid Verexa subscriptions are billed through Stripe on the cycle a Firm selects at signup or in Settings. Where
          a Firm enables client invoicing or payment collection through Verexa, those payments are also processed through
          Stripe, subject to Stripe&rsquo;s own terms. Fees are non-refundable except where required by law or expressly
          stated otherwise at the time of purchase. We may change our pricing on notice; continued use after a price
          change takes effect constitutes acceptance of the new price for future billing cycles.
        </p>
      </Section>

      <Section title="6. Third-party integrations">
        <p>
          Verexa integrates with third-party services a Firm may choose to connect, including Zoom (video meetings for
          appointments), Stripe (payments), Twilio (SMS), and Resend (email delivery). Connecting an integration is
          optional and at the Firm&rsquo;s (or individual staff member&rsquo;s) discretion, and use of that third-party
          service is also governed by its own terms and privacy policy. We are not responsible for the availability or
          conduct of third-party services.
        </p>
      </Section>

      <Section title="7. No tax, legal, or accounting advice from Verexa">
        <p>
          Verexa is software. We do not prepare tax returns, provide tax or legal advice, or review the accuracy or
          completeness of any information a Firm or Client enters. Responsibility for the professional services delivered
          using Verexa rests entirely with the Firm.
        </p>
      </Section>

      <Section title="8. Confidentiality and security">
        <p>
          We maintain reasonable administrative, technical, and physical safeguards designed to protect the confidentiality
          and security of data stored in Verexa, as described in our{" "}
          <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>. Firms and their staff are
          responsible for safeguarding their own login credentials and for the permissions they grant within their
          workspace.
        </p>
      </Section>

      <Section title="9. Disclaimers">
        <p>
          Verexa is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; To the fullest extent permitted by law, we
          disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose, and
          non-infringement. We do not warrant that the platform will be uninterrupted, error-free, or completely secure.
        </p>
      </Section>

      <Section title="10. Limitation of liability">
        <p>
          To the fullest extent permitted by law, Verexa will not be liable for any indirect, incidental, special,
          consequential, or punitive damages, or any loss of profits, revenue, data, or goodwill, arising from your use of
          the platform. Our total liability for any claim arising out of or relating to these Terms or the platform will
          not exceed the amount the Firm paid us in the twelve (12) months preceding the claim.
        </p>
      </Section>

      <Section title="11. Termination">
        <p>
          A Firm may cancel its subscription at any time from Settings. We may suspend or terminate access for breach of
          these Terms, non-payment, or as needed to protect the platform or other Firms. Upon termination, we will make
          Firm data available for export for a reasonable period before deletion, except where we are required to retain
          it as described in our Privacy Policy.
        </p>
      </Section>

      <Section title="12. Governing law">
        <p>
          These Terms are governed by the laws of the State of Louisiana, without regard to its conflict-of-laws
          principles.
        </p>
      </Section>

      <Section title="13. Changes to these Terms">
        <p>
          We may update these Terms from time to time. Material changes will be reflected by updating the effective date
          above, and where appropriate we will notify Firms directly. Continued use of Verexa after a change takes effect
          constitutes acceptance of the updated Terms.
        </p>
      </Section>

      <Section title="14. Contact">
        <p>
          Verexa HQ CRM is based in Louisiana. Questions about these Terms can be sent to{" "}
          <a href="mailto:support@verexahq.com" className="text-accent hover:underline">
            support@verexahq.com
          </a>
          .
        </p>
      </Section>
    </main>
  );
}
