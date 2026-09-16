import type { Metadata } from "next";
import { LEGAL_VERSION } from "@/lib/legal";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Terms of Service -- Verexa HQ CRM",
  description: "The terms governing use of Verexa HQ CRM.",
};

// Derived from LEGAL_VERSION (not a separate date) so this page can never
// drift from what the mandatory acceptance gate actually checks against --
// bumping LEGAL_VERSION is what makes existing account holders get
// re-prompted, so the displayed date has to be the same value.
const EFFECTIVE_DATE = new Date(`${LEGAL_VERSION}T00:00:00Z`).toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

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
        <p>
          Prepaid balances purchased for SMS, email, or storage usage are also non-refundable and, if a workspace
          becomes Archived as described in Section 11, any unused prepaid balance is forfeited as described there.
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

      <Section title="11. Account Lifecycle, Suspension, Archiving, and Termination">
        <p>
          A Firm may cancel its subscription at any time from Settings. We may also suspend or terminate access for
          non-payment, breach of these Terms, or as needed to protect the platform or other Firms. When access is
          suspended for non-payment, the workspace moves through the following states, measured from the date access
          was first suspended (&ldquo;Day 0&rdquo;):
        </p>
        <p>
          <strong className="text-ink">Suspended (Day 0 through Day 29).</strong> Normal workspace access for Firm
          users is unavailable. Firm users may access only the limited billing, account-recovery, and support
          functionality we make available for resolving the suspension. The Firm&rsquo;s existing Clients may continue
          to use the client portal to view their file, upload documents to existing engagements, and respond to
          outstanding requests, but no new engagements or normal business activity may be initiated. Automations and
          third-party integrations are disabled.
        </p>
        <p>
          <strong className="text-ink">Archived (beginning Day 30).</strong> If access has not been restored by Day 30,
          the workspace becomes Archived. Client portal access ends, and all Firm access -- other than the export
          process described in the Data Export section below -- remains unavailable. Any unused prepaid SMS, email, or
          storage balance is forfeited at this time and will not be refunded, restored, or credited. Data continues to
          be retained as described in our Privacy Policy.
        </p>
        <p>
          <strong className="text-ink">Permanently Archived; Account Closure (beginning Day 90).</strong> If access has
          not been restored within 90 days after the date it was first suspended (Day 0) -- not 90 days after the
          workspace became Archived -- the workspace becomes Permanently Archived: the Verexa subscription and account
          relationship terminates (&ldquo;Account Closure&rdquo;), and the workspace remains permanently unavailable
          for normal use. Permanently Archiving a workspace and Account Closure are not, by themselves, a deletion of
          data. Data associated with a Permanently Archived workspace continues to be retained and, once no longer
          required to be retained, may eventually be deleted, as described in our Privacy Policy.
        </p>
        <p>We will provide notice of a Suspension using the contact information on file for the workspace.</p>
      </Section>

      <Section title="12. Data Export">
        <p>
          Before a workspace becomes Archived (that is, during the first 30 days after Suspension), the Firm owner may
          use Verexa&rsquo;s self-service data export tool to obtain a copy of the workspace&rsquo;s Customer Data.
        </p>
        <p>
          From the time a workspace becomes Archived through the date it becomes Permanently Archived (Day 30 through
          Day 90 after Suspension), a Firm may still obtain an export of its Customer Data, but only through Verexa
          Customer Support, and a $150 export assistance fee applies. This fee will be disclosed and must be agreed to
          before the export is performed.
        </p>
        <p>
          The export window closes on Day 90 after Suspension, when the workspace becomes Permanently Archived. After
          that date, Verexa no longer offers export as a standard feature of the workspace. Closing the export window
          does not mean the data has been deleted -- retained data continues to be handled as described in our Privacy
          Policy. A Firm with a legitimate need to obtain data after this window has closed may contact{" "}
          <a href="mailto:support@verexahq.com" className="text-accent hover:underline">
            support@verexahq.com
          </a>
          , though Verexa is not obligated to provide export after the window closes.
        </p>
      </Section>

      <Section title="13. Platform Intellectual Property and Customer Data">
        <p>
          <strong className="text-ink">Verexa Platform IP.</strong> As between a Firm and Verexa, Verexa and its
          licensors own all right, title, and interest in and to the Verexa platform itself, including its software,
          source code, system architecture, database architecture, workflow engine, automation engine, pipeline engine,
          user interface, and other platform functionality, together with any generic templates, documentation, and
          platform configurations Verexa creates and makes generally available to Firms (&ldquo;Platform IP&rdquo;).
          Nothing in these Terms transfers any Platform IP to a Firm; a Firm&rsquo;s subscription grants only the right
          to use the platform as described in these Terms.
        </p>
        <p>
          <strong className="text-ink">Customer Data.</strong> &ldquo;Customer Data&rdquo; means the data a Firm and
          its Clients create, upload, or enter into Verexa, including client records, taxpayer information, uploaded
          documents, client communications, internal notes, client contact information, engagement information,
          pricing information, business information, and the Firm&rsquo;s own workflow configurations, pipeline
          configurations, templates, and engagement letters. As stated in Section 2, the Firm owns and controls its own
          Customer Data. Customer Data does not become Verexa&rsquo;s property, and is not converted into Platform IP,
          merely because Verexa hosts it, because a workspace becomes Suspended, Archived, or Permanently Archived, or
          because Verexa retains it for the period described in our Privacy Policy.
        </p>
        <p>
          <strong className="text-ink">Customer-created content vs. platform functionality.</strong> A Firm&rsquo;s
          specific workflow instructions, pipeline configurations, email and SMS content, documents, templates,
          engagement letters, and internal processes are that Firm&rsquo;s Customer Data. The underlying Verexa
          software and generic functionality that allows a Firm to build and run those things is Platform IP. Building
          or customizing content using Verexa&rsquo;s platform functionality does not give Verexa ownership of that
          content.
        </p>
        <p>
          <strong className="text-ink">Voluntary template contributions.</strong> Verexa may in the future offer Firms
          the ability to voluntarily submit a workflow, pipeline, or template for publication in a marketplace,
          adaptation into a generalized template, or other use beyond the submitting Firm&rsquo;s own workspace. No
          such use of a Firm&rsquo;s customer-created content occurs today, and none will occur without that
          Firm&rsquo;s separate, explicit agreement presented at the time of submission -- participation in Verexa
          alone does not grant Verexa any such rights.
        </p>
      </Section>

      <Section title="14. Governing law">
        <p>
          These Terms are governed by the laws of the State of Louisiana, without regard to its conflict-of-laws
          principles.
        </p>
      </Section>

      <Section title="15. Changes to these Terms">
        <p>
          We may update these Terms from time to time. Material changes will be reflected by updating the effective date
          above, and where appropriate we will notify Firms directly. Continued use of Verexa after a change takes effect
          constitutes acceptance of the updated Terms.
        </p>
      </Section>

      <Section title="16. Contact">
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
