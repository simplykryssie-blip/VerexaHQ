type FooterConfig = { text?: string; show_firm_name?: boolean };

export function FooterSection({ config, firmName }: { config: FooterConfig; firmName: string | null }) {
  return (
    <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted">
      {config.show_firm_name && firmName && <p className="font-medium text-slate">{firmName}</p>}
      {config.text && <p className="mt-1">{config.text}</p>}
    </footer>
  );
}
