export type BadgeTone = "success" | "warning" | "danger" | "neutral" | "accent";

const DOT_CLASSES: Record<BadgeTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-muted",
  accent: "bg-accent",
};

/**
 * tone maps 1:1 to the semantic-color rule: success = healthy, warning = needs
 * attention, danger = problem, neutral = informational. Pick tone from what the
 * status *means*, not from habit -- accent is for "featured/count", not status.
 *
 * Renders as a status dot + label rather than a filled pill -- a colored
 * background reads as a sticker at a glance; a dot reads as a state on a
 * record, which holds up better once a table has more than one of these
 * per row.
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
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-ink ${className}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASSES[tone]}`} aria-hidden="true" />
      {children}
    </span>
  );
}
