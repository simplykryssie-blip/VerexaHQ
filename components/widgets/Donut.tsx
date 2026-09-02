// Shared arc math + legend for every donut chart on the dashboard --
// TopServicesWidget and StageBreakdownWidget both draw one of these instead
// of each re-deriving the SVG stroke-dasharray math. Segments use the app's
// fixed categorical order (see SEGMENT_CLASSES) so hue always maps to the
// same rank across every donut, never re-cycled per chart.
export type DonutSegment = { id: string; label: string; count: number };

export const SEGMENT_CLASSES = ["text-accent", "text-emerald", "text-violet", "text-amber", "text-rose"];

const RADIUS = 60;
const STROKE_WIDTH = 22;
const GAP = 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function Donut({
  segments,
  centerLabel,
  centerSublabel,
}: {
  segments: DonutSegment[];
  centerLabel: string;
  centerSublabel: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);

  let cumulative = 0;
  const arcs = segments.map((s, i) => {
    const length = total > 0 ? (s.count / total) * CIRCUMFERENCE : 0;
    const offset = cumulative;
    cumulative += length;
    return { ...s, length, offset, className: i < SEGMENT_CLASSES.length ? SEGMENT_CLASSES[i] : "text-muted" };
  });

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
        <svg viewBox="0 0 140 140" width={140} height={140} className="-rotate-90">
          <circle cx={70} cy={70} r={RADIUS} fill="none" stroke="currentColor" strokeWidth={STROKE_WIDTH} className="text-surfaceMuted" />
          {arcs.map((arc) => (
            <circle
              key={arc.id}
              cx={70}
              cy={70}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={`${Math.max(arc.length - GAP, 0)} ${CIRCUMFERENCE - arc.length + GAP}`}
              strokeDashoffset={-arc.offset}
              className={arc.className}
            >
              <title>{`${arc.label}: ${arc.count}`}</title>
            </circle>
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-display text-xl font-semibold text-ink">{centerLabel}</p>
          <p className="text-[11px] text-muted">{centerSublabel}</p>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {arcs.map((arc) => (
          <li key={arc.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={`h-2 w-2 shrink-0 rounded-full bg-current ${arc.className}`} aria-hidden="true" />
              <span className="truncate text-slate">{arc.label}</span>
            </span>
            <span className="shrink-0 text-xs font-medium text-muted">{total > 0 ? Math.round((arc.count / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
