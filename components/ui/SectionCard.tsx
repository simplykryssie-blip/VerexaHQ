// Matches IconChip's categorical tones -- same "what kind of thing is this"
// palette, applied as a left-edge bar instead of a chip fill.
const ACCENT_BORDER_CLASSES: Record<import("./IconChip").IconChipTone, string> = {
  accent: "border-l-accent",
  emerald: "border-l-emerald",
  amber: "border-l-amber",
  violet: "border-l-violet",
  rose: "border-l-rose",
};

/** The one card shell every detail-page section (client, engagement, etc.) uses -- title + optional header action, then padded content. */
export function SectionCard({
  title,
  action,
  children,
  className = "",
  accent,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Optional categorical left-edge bar (e.g. grouping cards by kind on a
   * dashboard). Omit for the plain border every other SectionCard uses. */
  accent?: import("./IconChip").IconChipTone;
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-surface shadow-soft transition hover:shadow-softHover ${
        accent ? `border-l-4 ${ACCENT_BORDER_CLASSES[accent]}` : ""
      } ${className}`}
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

/** A label/value pair for a SectionCard's definition-list-style content. */
export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-slate">{value ?? "--"}</p>
    </div>
  );
}
