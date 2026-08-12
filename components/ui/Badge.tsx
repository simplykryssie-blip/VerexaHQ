export type BadgeTone = "success" | "warning" | "danger" | "neutral" | "accent";

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-surfaceMuted text-muted",
  accent: "bg-accentSoft text-accent",
};

/**
 * tone maps 1:1 to the semantic-color rule: success = healthy, warning = needs
 * attention, danger = problem, neutral = informational. Pick tone from what the
 * status *means*, not from habit -- accent is for "featured/count", not status.
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
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}>
      {children}
    </span>
  );
}
