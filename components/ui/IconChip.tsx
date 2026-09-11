export type IconChipTone = "accent" | "emerald" | "amber" | "violet" | "rose";

// Matches the categorical icon-chip palette in tailwind.config.ts -- these
// tag *kinds* of things (what a stat card is about), never status. Status
// stays on Badge's success/warning/danger/neutral tones instead.
const TONE_CLASSES: Record<IconChipTone, string> = {
  accent: "bg-accentSoft text-accent",
  emerald: "bg-emeraldSoft text-emerald",
  amber: "bg-amberSoft text-amber",
  violet: "bg-violetSoft text-violet",
  rose: "bg-roseSoft text-rose",
};

export function IconChip({
  tone = "accent",
  children,
  className = "",
}: {
  tone?: IconChipTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONE_CLASSES[tone]} ${className}`}>{children}</span>
  );
}
