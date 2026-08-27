export type BadgeTone = "success" | "warning" | "danger" | "neutral" | "accent";

const PILL_CLASSES: Record<BadgeTone, string> = {
  success: "bg-successSoft text-success",
  warning: "bg-warningSoft text-warning",
  danger: "bg-dangerSoft text-danger",
  neutral: "bg-surfaceMuted text-muted",
  accent: "bg-accentSoft text-accent",
};

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
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL_CLASSES[tone]} ${className}`}>
      {children}
    </span>
  );
}
