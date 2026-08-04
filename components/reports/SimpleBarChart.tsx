/**
 * Minimal, dependency-free SVG bar chart -- no charting library added
 * since this is the one reusable chart the reports engine needs right
 * now. Swap for a real charting library later if reports outgrow this.
 */
export function SimpleBarChart({
  data,
  height = 160,
  formatValue,
}: {
  data: { label: string; value: number }[];
  height?: number;
  formatValue?: (n: number) => string;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = 100 / data.length;

  return (
    <div role="img" aria-label={`Bar chart: ${data.map((d) => `${d.label} ${formatValue ? formatValue(d.value) : d.value}`).join(", ")}`}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-40 w-full" aria-hidden="true">
        {data.map((d, i) => {
          const barHeight = (d.value / max) * (height - 20);
          return (
            <rect
              key={d.label}
              x={i * barWidth + barWidth * 0.15}
              y={height - 20 - barHeight}
              width={barWidth * 0.7}
              height={barHeight}
              className="fill-accent"
            />
          );
        })}
      </svg>
      <div className="mt-1 flex text-[10px] text-muted">
        {data.map((d) => (
          <span key={d.label} style={{ width: `${barWidth}%` }} className="truncate text-center">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
