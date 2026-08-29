export function ProgressBar({
  percent,
  tone = "accent",
  size = "md",
}: {
  percent: number;
  /** "gradient" is the brand blue-to-lime treatment -- reserve it for one
   * intentional "how far along" moment per page (e.g. a client's current
   * engagement), not every progress bar on screen. */
  tone?: "accent" | "gradient";
  size?: "sm" | "md";
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={`w-full overflow-hidden rounded-full bg-surfaceMuted ${size === "sm" ? "h-1.5" : "h-2"}`}>
      <div
        className={`h-full rounded-full ${tone === "gradient" ? "bg-gradient-to-r from-accent to-brandLime" : "bg-accent"}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
