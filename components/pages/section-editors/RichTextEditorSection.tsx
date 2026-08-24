import { RichTextEditor } from "@/components/settings/RichTextEditor";

type RichTextConfig = { html?: string };

export function RichTextEditorSection({ config, onChange }: { config: RichTextConfig; onChange: (patch: Partial<RichTextConfig>) => void }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Content</p>
      <div className="mt-1.5">
        <RichTextEditor content={config.html ?? ""} onChange={(html) => onChange({ html })} />
      </div>
    </div>
  );
}
