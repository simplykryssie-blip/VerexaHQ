import { IconChip, type IconChipTone } from "./IconChip";

/** The gradient hero header used on Dashboard and (as of this redesign
 * pass) the other primary section landing pages -- full-bleed blurred
 * gradient orb, an icon chip, a headline (with an optional gradient-clipped
 * span the caller composes inline), and a subline. `actions` sits to the
 * right, same slot PageHeader offers today. */
export function PageHero({
  icon: Icon,
  tone = "accent",
  heading,
  subtitle,
  actions,
}: {
  icon: React.ElementType;
  tone?: IconChipTone;
  heading: React.ReactNode;
  subtitle: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden border-b border-border px-8 py-9">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-36 h-96 w-96 rounded-full bg-gradient-to-br from-accent to-brandGradientTo opacity-20 blur-3xl"
      />
      <div className="relative flex items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          <IconChip tone={tone}>
            <Icon size={18} aria-hidden="true" />
          </IconChip>
          <div>
            <h1 className="font-display text-[28px] font-semibold leading-tight text-ink">{heading}</h1>
            <p className="mt-1.5 max-w-[60ch] text-sm text-slate">{subtitle}</p>
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** The gradient-clipped span for the emphasized word(s) in a PageHero heading. */
export function HeroHighlight({ children }: { children: React.ReactNode }) {
  return <span className="bg-gradient-to-r from-accent to-brandGradientTo bg-clip-text text-transparent">{children}</span>;
}
