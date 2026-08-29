import type { IconChipTone } from "./IconChip";

// Same technique as TopServicesWidget's donut -- stroke="currentColor" plus a
// text-* class, so a sparkline picks up the same categorical palette (and a
// workspace's own accent override) without a second color system.
const TONE_CLASSES: Record<IconChipTone, string> = {
  accent: "text-accent",
  emerald: "text-emerald",
  amber: "text-amber",
  violet: "text-violet",
  rose: "text-rose",
};

const WIDTH = 60;
const HEIGHT = 20;
const PADDING = 2;

/** A small inline line chart. Only render this where `points` is a genuine
 * day-by-day series -- never a fabricated shape for a metric with no real
 * history. */
export function Sparkline({ points, tone = "accent" }: { points: number[]; tone?: IconChipTone }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = (WIDTH - PADDING * 2) / (points.length - 1);

  const coords = points
    .map((p, i) => {
      const x = PADDING + i * stepX;
      const y = HEIGHT - PADDING - ((p - min) / range) * (HEIGHT - PADDING * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} className={TONE_CLASSES[tone]} aria-hidden="true">
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
