import type { Metadata } from "next";
import { LEGAL_VERSION } from "@/lib/legal";
import { LegalDocumentBody } from "@/components/legal/LegalDocumentBody";
import { TERMS_INTRO_HTML, TERMS_SECTIONS } from "@/lib/legal/legalContent";

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

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Verexa HQ CRM</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted">Effective {EFFECTIVE_DATE}</p>

      <LegalDocumentBody introHtml={TERMS_INTRO_HTML} sections={TERMS_SECTIONS} />
    </main>
  );
}
