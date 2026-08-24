import { SectionImageUpload } from "./SectionImageUpload";

const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

type ImageConfig = { image_url?: string; alt_text?: string; caption?: string; alignment?: "left" | "center" | "right" };

export function ImageEditor({
  workspaceId,
  config,
  onChange,
}: {
  workspaceId: string;
  config: ImageConfig;
  onChange: (patch: Partial<ImageConfig>) => void;
}) {
  return (
    <div className="space-y-3">
      <SectionImageUpload workspaceId={workspaceId} value={config.image_url} onChange={(url) => onChange({ image_url: url ?? undefined })} />
      <label className={labelClass}>
        Alt text
        <input value={config.alt_text ?? ""} onChange={(e) => onChange({ alt_text: e.target.value })} className={inputClass} />
      </label>
      <label className={labelClass}>
        Caption
        <input value={config.caption ?? ""} onChange={(e) => onChange({ caption: e.target.value })} className={inputClass} />
      </label>
      <label className={labelClass}>
        Alignment
        <select
          value={config.alignment ?? "center"}
          onChange={(e) => onChange({ alignment: e.target.value as ImageConfig["alignment"] })}
          className={inputClass}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
    </div>
  );
}
