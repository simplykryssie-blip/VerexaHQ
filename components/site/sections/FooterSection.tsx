type FooterConfig = { text?: string; show_firm_name?: boolean; background?: string; text_color?: string };

export function FooterSection({ config, firmName }: { config: FooterConfig; firmName: string | null }) {
  const dark = Boolean(config.background);
  return (
    <footer
      className={dark ? "px-6 py-8 text-center text-xs" : "border-t border-border px-6 py-8 text-center text-xs text-muted"}
      style={dark ? { background: config.background, color: config.text_color || "#93a3b8" } : undefined}
    >
      {config.show_firm_name && firmName && (
        <p className={dark ? "font-medium" : "font-medium text-slate"} style={dark ? { color: "#e2e8f0" } : undefined}>
          {firmName}
        </p>
      )}
      {config.text && <p className="mt-1">{config.text}</p>}
    </footer>
  );
}
