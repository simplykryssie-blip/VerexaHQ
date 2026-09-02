import { Activity, ArrowRightLeft, ClipboardList, Pencil, Share2, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import type { ActivityItem } from "@/lib/dashboard/data";

// activity_type isn't a fixed enum in the schema (see activity_log inserts
// across migrations), so this matches on keyword rather than an exhaustive
// switch -- anything unrecognized still renders, just with the generic icon,
// instead of being hidden or crashing.
const CATEGORIES: [match: string, icon: LucideIcon, tone: string][] = [
  ["organizer", ClipboardList, "text-violet"],
  ["lead", UserPlus, "text-emerald"],
  ["share", Share2, "text-accent"],
  ["pending_change", Pencil, "text-amber"],
  ["status", ArrowRightLeft, "text-accent"],
];

function styleFor(activityType: string): { icon: LucideIcon; tone: string } {
  const key = activityType.toLowerCase();
  const match = CATEGORIES.find(([needle]) => key.includes(needle));
  return match ? { icon: match[1], tone: match[2] } : { icon: Activity, tone: "text-muted" };
}

export function RecentActivityWidget({ items }: { items: ActivityItem[] }) {
  return (
    <WidgetShell title="Recent Activity">
      {items.length === 0 ? (
        <EmptyState icon={Activity} message="Nothing has happened yet -- activity will show up here as you work." />
      ) : (
        <ul className="space-y-2.5">
          {items.slice(0, 8).map((a) => {
            const { icon: Icon, tone } = styleFor(a.activity_type);
            return (
              <li key={a.id} className="flex items-start gap-2.5 text-sm">
                <Icon size={14} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden="true" />
                <span className="min-w-0 flex-1 text-slate">{a.description}</span>
                <span className="shrink-0 text-xs text-muted">{new Date(a.created_at).toLocaleString()}</span>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetShell>
  );
}
