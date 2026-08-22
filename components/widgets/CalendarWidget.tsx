import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import type { CalendarItem } from "@/lib/dashboard/data";

export function CalendarWidget({ items }: { items: CalendarItem[] }) {
  const upcoming = items.slice(0, 6);
  return (
    <WidgetShell title="Calendar" reportHref="/calendar">
      {upcoming.length === 0 ? (
        <EmptyState icon={CalendarCheck} message="No upcoming deadlines." />
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
