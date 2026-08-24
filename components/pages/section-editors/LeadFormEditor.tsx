import type { WorkspaceServiceOption } from "../types";

const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

type OnSubmit = {
  action?: "next_page" | "custom_url" | "inline_thank_you";
  custom_url?: string;
  thank_you_heading?: string;
  thank_you_body?: string;
};
type LeadFormConfig = {
  heading?: string;
  subheading?: string;
  fields?: { first_name?: boolean; last_name?: boolean; phone?: boolean };
  service_ids?: string[];
  button_label?: string;
  on_submit?: OnSubmit;
};

export function LeadFormEditor({
  config,
  onChange,
  workspaceServices,
  canAdvanceToNextPage,
}: {
  config: LeadFormConfig;
  onChange: (patch: Partial<LeadFormConfig>) => void;
  workspaceServices: WorkspaceServiceOption[];
  canAdvanceToNextPage: boolean;
}) {
  const fields = config.fields ?? {};
  const serviceIds = config.service_ids ?? [];
  const onSubmit = config.on_submit ?? {};

  function toggleField(key: keyof NonNullable<LeadFormConfig["fields"]>) {
    onChange({ fields: { ...fields, [key]: fields[key] === false ? true : false } });
  }
  function toggleService(id: string) {
    onChange({ service_ids: serviceIds.includes(id) ? serviceIds.filter((s) => s !== id) : [...serviceIds, id] });
  }
  function updateOnSubmit(patch: Partial<OnSubmit>) {
    onChange({ on_submit: { ...onSubmit, ...patch } });
  }

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

      <div>
        <p className={labelClass}>Fields to collect (email is always required)</p>
        <div className="mt-1.5 space-y-1">
          {(["first_name", "last_name", "phone"] as const).map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm text-slate">
              <input type="checkbox" checked={fields[key] !== false} onChange={() => toggleField(key)} />
              {key === "first_name" ? "First name" : key === "last_name" ? "Last name" : "Phone"}
            </label>
          ))}
        </div>
      </div>

      {workspaceServices.length > 0 && (
        <div>
          <p className={labelClass}>Services to offer</p>
          <div className="mt-1.5 max-h-32 space-y-1 overflow-y-auto">
            {workspaceServices.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-slate">
                <input type="checkbox" checked={serviceIds.includes(s.id)} onChange={() => toggleService(s.id)} />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <label className={labelClass}>
        Button label
        <input value={config.button_label ?? ""} onChange={(e) => onChange({ button_label: e.target.value })} className={inputClass} />
      </label>

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
