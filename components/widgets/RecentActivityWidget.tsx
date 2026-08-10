import { Activity } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import type { ActivityItem } from "@/lib/dashboard/data";

export function RecentActivityWidget({ items }: { items: ActivityItem[] }) {
  return (
    <WidgetShell title="Recent Activity">
      {items.length === 0 ? (
        <EmptyState icon={Activity} message="Nothing has happened yet -- activity will show up here as you work." />
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
