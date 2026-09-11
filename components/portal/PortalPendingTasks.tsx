import Link from "next/link";
import { ClipboardList, Handshake, MessageCircleWarning } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PortalTaskItem } from "@/components/portal/PortalTaskItem";

export type PortalPendingQuote = { id: string; title: string };
export type PortalPendingOrganizer = { id: string; name: string | null };
export type PortalPendingInfoRequest = { id: string; organizerResponseId: string };
export type PortalPendingTask = { id: string; title: string; description: string | null; due_date: string | null; status: string };

export function PortalPendingTasks({
  quotes,
  organizers,
  infoRequests,
  tasks,
}: {
  quotes: PortalPendingQuote[];
  organizers: PortalPendingOrganizer[];
  infoRequests: PortalPendingInfoRequest[];
  tasks: PortalPendingTask[];
}) {
  const total = quotes.length + organizers.length + infoRequests.length + tasks.length;

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-soft">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-ink">
        Pending Tasks{total > 0 ? ` (${total})` : ""}
      </h2>
      {total === 0 ? (
        <EmptyState message="Nothing pending -- you're all caught up." />
      ) : (
        <ul className="divide-y divide-border p-3">
          {quotes.map((quote) => (
            <li key={`quote-${quote.id}`} className="py-1.5">
              <Link
                href="/portal/quotes"
                className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm text-ink hover:bg-surfaceMuted"
              >
                <Handshake size={16} className="shrink-0 text-warning" aria-hidden="true" />
                Review quote: {quote.title}
              </Link>
            </li>
          ))}
          {organizers.map((organizer) => (
            <li key={`organizer-${organizer.id}`} className="py-1.5">
              <Link
                href={`/portal/organizer/${organizer.id}`}
                className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm text-ink hover:bg-surfaceMuted"
              >
                <ClipboardList size={16} className="shrink-0 text-warning" aria-hidden="true" />
                Complete form: {organizer.name ?? "Organizer"}
              </Link>
            </li>
          ))}
          {infoRequests.map((request) => (
            <li key={`info-${request.id}`} className="py-1.5">
              <Link
                href={`/portal/organizer/${request.organizerResponseId}`}
                className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm text-ink hover:bg-surfaceMuted"
              >
                <MessageCircleWarning size={16} className="shrink-0 text-warning" aria-hidden="true" />
                Your preparer needs more information on a form
              </Link>
            </li>
          ))}
          {tasks.map((task) => (
            <PortalTaskItem key={`task-${task.id}`} task={task} />
          ))}
        </ul>
      )}
    </section>
  );
}
