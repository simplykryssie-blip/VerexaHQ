const textareaClass =
  "mt-1.5 w-full rounded-lg border border-border px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

type CustomHtmlConfig = { html?: string; full_width?: boolean };

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
      <label className="mt-3 flex items-center gap-2 text-xs text-ink">
        <input
          type="checkbox"
          checked={config.full_width ?? false}
          onChange={(e) => onChange({ full_width: e.target.checked })}
          className="h-3.5 w-3.5 rounded border-border"
        />
        Full width -- let this block&apos;s own HTML control its width, instead of centering it in the page&apos;s standard content column.
      </label>
    </div>
  );
}
