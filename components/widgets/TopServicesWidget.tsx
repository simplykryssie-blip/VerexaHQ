import { PieChart } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import type { ServiceEngagementCount } from "@/lib/dashboard/data";

// Reuses the app's existing categorical icon-chip palette (see
// tailwind.config.ts) via `stroke="currentColor"` + a text-* class, so each
// segment picks up the same colors already used for stat-card chips
// elsewhere on the dashboard -- no new palette, and the accent slot still
// tracks a workspace's custom branding color like everywhere else.
const SEGMENT_CLASSES = ["text-accent", "text-emerald", "text-violet", "text-amber", "text-rose"];
const MAX_SEGMENTS = 4;
const RADIUS = 60;
const STROKE_WIDTH = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function TopServicesWidget({ services }: { services: ServiceEngagementCount[] }) {
  const total = services.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) {
    return (
      <WidgetShell title="Top Services">
        <EmptyState icon={PieChart} message="No active engagements yet." />
      </WidgetShell>
    );
  }

  const top = services.slice(0, MAX_SEGMENTS);
  const otherCount = services.slice(MAX_SEGMENTS).reduce((sum, s) => sum + s.count, 0);
  const segments = otherCount > 0 ? [...top, { serviceId: "other", name: "Other", count: otherCount }] : top;

  let cumulative = 0;
  const arcs = segments.map((s, i) => {
    const length = (s.count / total) * CIRCUMFERENCE;
    const offset = cumulative;
    cumulative += length;
    return { ...s, length, offset, className: i < SEGMENT_CLASSES.length ? SEGMENT_CLASSES[i] : "text-muted" };
  });

  return (
    <WidgetShell title="Top Services">
      <div className="flex items-center gap-5">
        <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
          <svg viewBox="0 0 140 140" width={140} height={140} className="-rotate-90">
            <circle cx={70} cy={70} r={RADIUS} fill="none" stroke="currentColor" strokeWidth={STROKE_WIDTH} className="text-surfaceMuted" />
            {arcs.map((arc) => (
              <circle
                key={arc.serviceId}
                cx={70}
                cy={70}
                r={RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth={STROKE_WIDTH}
                strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
                strokeDashoffset={-arc.offset}
                className={arc.className}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="font-display text-xl font-semibold text-ink">{total}</p>
            <p className="text-[11px] text-muted">Total</p>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-1.5">
          {arcs.map((arc) => (
            <li key={arc.serviceId} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full bg-current ${arc.className}`} aria-hidden="true" />
                <span className="truncate text-slate">{arc.name}</span>
              </span>
              <span className="shrink-0 text-xs font-medium text-muted">{Math.round((arc.count / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </WidgetShell>
  );
}
