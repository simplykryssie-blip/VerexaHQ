import { SectionImageUpload } from "./SectionImageUpload";

const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

type TestimonialConfig = { quote?: string; author_name?: string; author_title?: string; avatar_url?: string };

export function TestimonialEditor({
  workspaceId,
  websiteId,
  config,
  onChange,
}: {
  workspaceId: string;
  websiteId: string;
  config: TestimonialConfig;
  onChange: (patch: Partial<TestimonialConfig>) => void;
}) {
  return (
    <div className="space-y-3">
      <label className={labelClass}>
        Quote
        <textarea value={config.quote ?? ""} onChange={(e) => onChange({ quote: e.target.value })} rows={3} className={inputClass} />
      </label>
      <label className={labelClass}>
        Author name
        <input value={config.author_name ?? ""} onChange={(e) => onChange({ author_name: e.target.value })} className={inputClass} />
      </label>
      <label className={labelClass}>
        Author title
        <input value={config.author_title ?? ""} onChange={(e) => onChange({ author_title: e.target.value })} className={inputClass} />
      </label>
      <SectionImageUpload
        workspaceId={workspaceId}
        websiteId={websiteId}
        value={config.avatar_url}
        onChange={(url) => onChange({ avatar_url: url ?? undefined })}
        label="Avatar (optional)"
      />
    </div>
  );
}
