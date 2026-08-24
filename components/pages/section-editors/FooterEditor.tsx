const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

type FooterConfig = { text?: string; show_firm_name?: boolean };

export function FooterEditor({ config, onChange }: { config: FooterConfig; onChange: (patch: Partial<FooterConfig>) => void }) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-slate">
        <input type="checkbox" checked={config.show_firm_name ?? false} onChange={(e) => onChange({ show_firm_name: e.target.checked })} />
        Show firm name
      </label>
      <label className={labelClass}>
        Footer text
        <input value={config.text ?? ""} onChange={(e) => onChange({ text: e.target.value })} className={inputClass} />
      </label>
    </div>
  );
}
