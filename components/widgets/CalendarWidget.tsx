import Link from "next/link";
import { WidgetShell } from "./WidgetShell";
import type { CalendarItem } from "@/lib/dashboard/data";

export function CalendarWidget({ items }: { items: CalendarItem[] }) {
  const upcoming = items.slice(0, 6);
  return (
    <WidgetShell title="Calendar" reportHref="/calendar">
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted">No upcoming deadlines.</p>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((item) => {
            const content = (
              <>
                <span className="text-slate">{item.label}</span>
                <span className="text-xs text-muted">{new Date(item.date).toLocaleDateString()}</span>
              </>
            );
            return (
              <li key={item.id} className="flex items-center justify-between text-sm">
                {item.href ? (
                  <Link href={item.href} className="flex w-full items-center justify-between hover:underline">
                    {content}
                  </Link>
                ) : (
                  <div className="flex w-full items-center justify-between">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </WidgetShell>
  );
}
