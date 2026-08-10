import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import type { PriorityItem } from "@/lib/dashboard/priorities";

export function PrioritiesWidget({ items }: { items: PriorityItem[] }) {
  return (
    <WidgetShell title="Today's Priorities">
      {items.length === 0 ? (
        <EmptyState icon={CheckCircle2} message="Nothing urgent -- you're caught up." />
      ) : (
        <ol className="space-y-2">
          {items.map((item, i) => (
            <li key={item.id} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accentSoft text-xs font-medium text-accent">
                {i + 1}
              </span>
              <Link href={item.href} className="flex-1 hover:underline">
                <span className="text-slate">{item.label}</span>
                <span className="ml-1 text-xs text-muted">-- {item.detail}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </WidgetShell>
  );
}
