type CtaButtonConfig = { label?: string; href?: string; style?: "primary" | "secondary" };

export function CtaButtonSection({ config, accentColor }: { config: CtaButtonConfig; accentColor?: string }) {
  if (!config.label || !config.href) return null;
  const isPrimary = config.style !== "secondary";
  return (
    <section className="flex justify-center px-6 py-10">
      <a
        href={config.href}
        className={`rounded-lg px-6 py-3 text-sm font-semibold ${isPrimary ? "text-white" : "border border-border text-ink"}`}
        style={isPrimary ? { backgroundColor: accentColor || "#0f172a" } : undefined}
      >
        {config.label}
      </a>
    </section>
  );
}
