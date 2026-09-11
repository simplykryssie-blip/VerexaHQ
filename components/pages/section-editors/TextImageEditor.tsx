import { RichTextEditor } from "@/components/settings/RichTextEditor";
import { SectionImageUpload } from "./SectionImageUpload";

const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

type TextImageConfig = { heading?: string; html?: string; image_url?: string; image_position?: "left" | "right" };

export function TextImageEditor({
  workspaceId,
  config,
  onChange,
}: {
  workspaceId: string;
  config: TextImageConfig;
  onChange: (patch: Partial<TextImageConfig>) => void;
}) {
  return (
    <div className="space-y-3">
      <label className={labelClass}>
        Heading
        <input value={config.heading ?? ""} onChange={(e) => onChange({ heading: e.target.value })} className={inputClass} />
      </label>
      <div>
        <p className={labelClass}>Text</p>
        <div className="mt-1.5">
          <RichTextEditor content={config.html ?? ""} onChange={(html) => onChange({ html })} bare />
        </div>
      </div>
      <SectionImageUpload
        workspaceId={workspaceId}
        value={config.image_url}
        onChange={(url) => onChange({ image_url: url ?? undefined })}
      />
      <label className={labelClass}>
        Image position
        <select
          value={config.image_position ?? "right"}
          onChange={(e) => onChange({ image_position: e.target.value as TextImageConfig["image_position"] })}
          className={inputClass}
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </label>
    </div>
  );
}
