import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Zoom Integration -- Verexa HQ CRM",
  description: "How the Zoom integration works in Verexa HQ CRM.",
};

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accentSoft text-sm font-semibold text-accent">
        {n}
      </div>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate">{children}</p>
      </div>
    </div>
  );
}

export default function ZoomDocsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Verexa HQ CRM</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">Zoom Integration</h1>
      <p className="mt-4 text-sm leading-relaxed text-slate">
        Connecting Zoom lets Verexa automatically create a real Zoom meeting and join link whenever a staff member
        schedules a client appointment -- no manual meeting creation, no copy-pasting links.
      </p>

      <div className="mt-10 space-y-8">
        <Step n={1} title="Connect your Zoom account">
          Each staff member connects their own Zoom account individually, from Settings &gt; Integrations inside
          Verexa. This opens Zoom&rsquo;s standard sign-in and consent screen -- Verexa never sees your Zoom password.
        </Step>
        <Step n={2} title="Schedule an appointment">
          When that staff member schedules a client appointment in Verexa, a Zoom meeting is created automatically
          under their connected Zoom account, and the join link is attached to the appointment.
        </Step>
        <Step n={3} title="Share the link">
          The join link shows on the appointment for staff, and on the client&rsquo;s portal view of that appointment
          if the firm has client portal access enabled.
        </Step>
        <Step n={4} title="Disconnect anytime">
          A staff member can disconnect their Zoom account at any time from Settings &gt; Integrations. Future
          appointments simply won&rsquo;t get a Zoom link until reconnected -- nothing else in Verexa is affected.
        </Step>
      </div>

      <p className="mt-10 text-sm leading-relaxed text-slate">
        Each firm and staff member manages their own Zoom connection independently -- a meeting is always created
        under the account of whoever scheduled the appointment, never on anyone else&rsquo;s behalf.
      </p>

      <div className="mt-10 flex gap-4 text-sm">
        <a href="/contact" className="text-accent hover:underline">Support</a>
        <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>
        <a href="/terms" className="text-accent hover:underline">Terms of Service</a>
      </div>
    </main>
  );
}
