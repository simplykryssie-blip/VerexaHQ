import type { BookableServiceOption, StaffOption } from "../types";

const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

type BookingWidgetConfig = {
  service_id?: string;
  staff_id?: string;
};

export function BookingWidgetEditor({
  config,
  onChange,
  services,
  staff,
}: {
  config: BookingWidgetConfig;
  onChange: (patch: Partial<BookingWidgetConfig>) => void;
  services: BookableServiceOption[];
  staff: StaffOption[];
}) {
  return (
    <div className="space-y-3">
      <label className={labelClass}>
        Service
        <select
          value={config.service_id ?? ""}
          onChange={(e) => onChange({ service_id: e.target.value || undefined })}
          className={inputClass}
        >
          <option value="">Let the visitor choose</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {services.length === 0 && (
        <p className="text-xs text-muted">No bookable, portal-visible services yet -- set one up under Settings &gt; Services first.</p>
      )}

      <label className={labelClass}>
        Staff member
        <select value={config.staff_id ?? ""} onChange={(e) => onChange({ staff_id: e.target.value || undefined })} className={inputClass}>
          <option value="">Anyone on the team</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] text-muted">
        Leave both as-is for an open booking widget where the visitor picks a service and any available time. Set a
        service and/or staff member to scope it -- e.g. embed this on a service&apos;s own landing page.
      </p>
    </div>
  );
}
