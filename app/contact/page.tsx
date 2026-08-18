import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Support -- Verexa HQ CRM",
  description: "Contact Verexa HQ CRM support.",
};

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-20">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Verexa HQ CRM</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">Support</h1>

      <p className="mt-6 text-sm leading-relaxed text-slate">
        Verexa HQ CRM is a practice-management platform for tax offices and accounting firms, based in Louisiana. For
        questions, support requests, or anything else, reach us at:
      </p>

      <a
        href="mailto:support@verexahq.com"
        className="mt-4 inline-block text-lg font-semibold text-accent hover:underline"
      >
        support@verexahq.com
      </a>

      <p className="mt-6 text-sm leading-relaxed text-slate">
        If you're a client of a tax office or firm using Verexa, contact that firm directly for help with your own
        account or file -- they manage your information and can act on your request fastest.
      </p>

      <div className="mt-10 flex gap-4 text-sm">
        <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>
        <a href="/terms" className="text-accent hover:underline">Terms of Service</a>
      </div>
    </main>
  );
}
