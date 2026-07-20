"use client";

import { Mail, LifeBuoy } from "lucide-react";

const TOPICS = [
  {
    title: "Clients",
    body: "Add a client or lead from the Clients page, or from Create → Client / lead anywhere in the app. Edit contact details, tags, and team assignment from a client's profile.",
  },
  {
    title: "Work & Service Workspaces",
    body: "Every active service (bookkeeping, tax prep, payroll, etc.) has its own Service Workspace with its own tasks, documents, and status. Activate a service from a client's profile — the Work page lists everything assigned to you or your team.",
  },
  {
    title: "Documents",
    body: "Request documents from a client, upload on their behalf, or organize files into folders from the Documents page or a client's Documents tab.",
  },
  {
    title: "Billing",
    body: "Create and send invoices from the Billing page. Payment status updates automatically once a client pays online.",
  },
];

export default function HelpPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <LifeBuoy size={22} className="text-[#108A64]" /> Help
        </h1>
        <p className="mt-1 text-sm text-muted">
          Quick answers for common tasks in VerexaHQ.
        </p>
      </div>
      <div className="space-y-3">
        {TOPICS.map((t) => (
          <div key={t.title} className="app-card p-5">
            <h2 className="font-bold text-ink">{t.title}</h2>
            <p className="mt-1.5 text-sm text-muted">{t.body}</p>
          </div>
        ))}
      </div>
      <div className="app-card flex items-center gap-3 p-5">
        <Mail size={18} className="shrink-0 text-[#108A64]" />
        <div className="text-sm text-muted">
          Still stuck? Reach your workspace administrator, or contact VerexaHQ
          support through the account that set up your firm.
        </div>
      </div>
    </div>
  );
}
