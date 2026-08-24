const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

type SpacerConfig = { height?: "sm" | "md" | "lg" };

export function SpacerEditor({ config, onChange }: { config: SpacerConfig; onChange: (patch: Partial<SpacerConfig>) => void }) {
  return (
    <label className={labelClass}>
      Height
      <select value={config.height ?? "md"} onChange={(e) => onChange({ height: e.target.value as SpacerConfig["height"] })} className={inputClass}>
        <option value="sm">Small</option>
        <option value="md">Medium</option>
        <option value="lg">Large</option>
      </select>
    </label>
  );
}
