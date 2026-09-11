export type BadgeTone = "success" | "warning" | "danger" | "neutral" | "accent";

const PILL_CLASSES: Record<BadgeTone, string> = {
  success: "bg-successSoft text-success",
  warning: "bg-warningSoft text-warning",
  danger: "bg-dangerSoft text-danger",
  neutral: "bg-surfaceMuted text-muted",
  accent: "bg-accentSoft text-accent",
};

/** Same classes `<Badge>` renders with, for the rare case something that
 * needs the identical pill look isn't a plain `<span>` -- e.g. a clickable
 * status cycle button -- so it stays pinned to this one definition instead
 * of a hand-copied color map drifting from it over time. */
export function badgeClasses(tone: BadgeTone = "neutral", className = "") {
  return `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL_CLASSES[tone]} ${className}`;
}

/**
 * tone maps 1:1 to the semantic-color rule: success = healthy, warning = needs
 * attention, danger = problem, neutral = informational. Pick tone from what the
 * status *means*, not from habit -- accent is for "featured/count", not status.
 *
 * Renders as a filled colored pill, matching the reference product mockups.
 */
export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={badgeClasses(tone, className)}>{children}</span>;
}
