import { WidgetShell } from "./WidgetShell";
import type { ActivityItem } from "@/lib/dashboard/data";

export function RecentActivityWidget({ items }: { items: ActivityItem[] }) {
  return (
    <WidgetShell title="Recent Activity">
      {items.length === 0 ? (
        <p className="text-sm text-muted">Nothing has happened yet -- activity will show up here as you work.</p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 8).map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm">
              <span className="text-slate">{a.description}</span>
              <span className="text-xs text-muted">{new Date(a.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}
