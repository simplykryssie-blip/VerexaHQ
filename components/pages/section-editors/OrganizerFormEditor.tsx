import { AlertTriangle } from "lucide-react";
import type { OrganizerTemplateOption } from "../types";

const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

type OnSubmit = {
  action?: "next_page" | "custom_url" | "inline_thank_you";
  custom_url?: string;
  thank_you_heading?: string;
  thank_you_body?: string;
};
type OrganizerFormConfig = {
  template_id?: string;
  public_token?: string;
  template_name?: string;
  on_submit?: OnSubmit;
};

export function OrganizerFormEditor({
  config,
  onChange,
  organizerTemplates,
  canAdvanceToNextPage,
}: {
  config: OrganizerFormConfig;
  onChange: (patch: Partial<OrganizerFormConfig>) => void;
  organizerTemplates: OrganizerTemplateOption[];
  canAdvanceToNextPage: boolean;
}) {
  const onSubmit = config.on_submit ?? {};
  const selected = organizerTemplates.find((t) => t.id === config.template_id);

  function selectTemplate(id: string) {
    const template = organizerTemplates.find((t) => t.id === id);
    if (!template) {
      onChange({ template_id: undefined, public_token: undefined, template_name: undefined });
      return;
    }
    onChange({ template_id: template.id, public_token: template.public_token, template_name: template.name });
  }

  function updateOnSubmit(patch: Partial<OnSubmit>) {
    onChange({ on_submit: { ...onSubmit, ...patch } });
  }

  return (
    <div className="space-y-3">
      <label className={labelClass}>
        Form
        <select value={config.template_id ?? ""} onChange={(e) => selectTemplate(e.target.value)} className={inputClass}>
          <option value="">Select a form template...</option>
          {organizerTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      {organizerTemplates.length === 0 && (
        <p className="text-xs text-muted">
          No published form templates yet -- build one under Templates first, then come back here to pick it.
        </p>
      )}

      {selected && !selected.is_public && (
        <p className="inline-flex items-start gap-1.5 text-xs font-medium text-danger">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          This form&apos;s public link is off, so visitors will see &quot;not available&quot; here. Turn on its public link from the
          template&apos;s own page under Templates.
        </p>
      )}

      <div>
        <p className={labelClass}>After submit</p>
        <select
          value={onSubmit.action ?? "inline_thank_you"}
          onChange={(e) => updateOnSubmit({ action: e.target.value as OnSubmit["action"] })}
          className={inputClass}
        >
          <option value="inline_thank_you">Show a thank-you message</option>
          <option value="custom_url">Redirect to a URL</option>
          {canAdvanceToNextPage && <option value="next_page">Advance to the next funnel page</option>}
        </select>
      </div>

      {onSubmit.action === "custom_url" && (
        <label className={labelClass}>
          Redirect URL
          <input value={onSubmit.custom_url ?? ""} onChange={(e) => updateOnSubmit({ custom_url: e.target.value })} placeholder="https://..." className={inputClass} />
        </label>
      )}

      {(!onSubmit.action || onSubmit.action === "inline_thank_you") && (
        <>
          <label className={labelClass}>
            Thank-you heading
            <input value={onSubmit.thank_you_heading ?? ""} onChange={(e) => updateOnSubmit({ thank_you_heading: e.target.value })} className={inputClass} />
          </label>
          <label className={labelClass}>
            Thank-you message
            <input value={onSubmit.thank_you_body ?? ""} onChange={(e) => updateOnSubmit({ thank_you_body: e.target.value })} className={inputClass} />
          </label>
        </>
      )}
    </div>
  );
}
