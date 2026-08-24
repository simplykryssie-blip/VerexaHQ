const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

type CtaButtonConfig = { label?: string; href?: string; style?: "primary" | "secondary" };

export function CtaButtonEditor({ config, onChange }: { config: CtaButtonConfig; onChange: (patch: Partial<CtaButtonConfig>) => void }) {
  return (
    <div className="space-y-3">
      <label className={labelClass}>
        Button label
        <input value={config.label ?? ""} onChange={(e) => onChange({ label: e.target.value })} className={inputClass} />
      </label>
      <label className={labelClass}>
        Link
        <input value={config.href ?? ""} onChange={(e) => onChange({ href: e.target.value })} placeholder="https://..." className={inputClass} />
      </label>
      <label className={labelClass}>
        Style
        <select value={config.style ?? "primary"} onChange={(e) => onChange({ style: e.target.value as CtaButtonConfig["style"] })} className={inputClass}>
          <option value="primary">Primary (filled)</option>
          <option value="secondary">Secondary (outline)</option>
        </select>
      </label>
    </div>
  );
}
