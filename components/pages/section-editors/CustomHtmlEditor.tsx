const textareaClass =
  "mt-1.5 w-full rounded-lg border border-border px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

type CustomHtmlConfig = { html?: string };

export function CustomHtmlEditor({ config, onChange }: { config: CustomHtmlConfig; onChange: (patch: Partial<CustomHtmlConfig>) => void }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">HTML</p>
      <textarea
        value={config.html ?? ""}
        onChange={(e) => onChange({ html: e.target.value })}
        rows={14}
        spellCheck={false}
        placeholder="<div>Paste any HTML, including <style> and <script> tags for embed codes...</div>"
        className={textareaClass}
      />
      <p className="mt-1.5 text-[11px] text-muted">
        Renders exactly as written on your published page, scripts included -- only paste code you trust, the same as any embed code
        (Calendly, a tracking pixel, etc.).
      </p>
    </div>
  );
}
