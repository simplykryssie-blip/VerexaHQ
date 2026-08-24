import { SectionImageUpload } from "./SectionImageUpload";

const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

type HeroConfig = { heading?: string; subheading?: string; background_image_url?: string; button_label?: string; button_href?: string };

export function HeroEditor({
  workspaceId,
  websiteId,
  config,
  onChange,
}: {
  workspaceId: string;
  websiteId: string;
  config: HeroConfig;
  onChange: (patch: Partial<HeroConfig>) => void;
}) {
  return (
    <div className="space-y-3">
      <label className={labelClass}>
        Heading
        <input value={config.heading ?? ""} onChange={(e) => onChange({ heading: e.target.value })} className={inputClass} />
      </label>
      <label className={labelClass}>
        Subheading
        <input value={config.subheading ?? ""} onChange={(e) => onChange({ subheading: e.target.value })} className={inputClass} />
      </label>
      <SectionImageUpload
        workspaceId={workspaceId}
        websiteId={websiteId}
        value={config.background_image_url}
        onChange={(url) => onChange({ background_image_url: url ?? undefined })}
        label="Background image"
      />
      <label className={labelClass}>
        Button label
        <input value={config.button_label ?? ""} onChange={(e) => onChange({ button_label: e.target.value })} className={inputClass} />
      </label>
      <label className={labelClass}>
        Button link
        <input value={config.button_href ?? ""} onChange={(e) => onChange({ button_href: e.target.value })} placeholder="https://..." className={inputClass} />
      </label>
    </div>
  );
}
