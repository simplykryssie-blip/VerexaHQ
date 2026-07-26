"use client";

// Shared, mobile-first field primitives for the public intake wizard.
// Kept intentionally tiny (no form library) since the wizard's state is a
// single plain object edited via lib/intakeAnswers' setDeep.

export function Card({ children, tight }: { children: React.ReactNode; tight?: boolean }) {
  return <div className={`border border-line rounded-sm bg-white ${tight ? "p-3" : "p-4"}`}>{children}</div>;
}

export function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="font-slab text-lg font-bold text-ink break-words">{title}</h2>
      {hint && <p className="text-sm text-muted mt-1">{hint}</p>}
    </div>
  );
}

export function SubHeading({ title }: { title: string }) {
  return <h3 className="text-sm font-bold text-ink uppercase tracking-wide mt-2">{title}</h3>;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="min-w-0">
      <label className="block text-xs font-semibold text-muted mb-1 break-words">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 border border-line rounded-sm px-3 py-2 text-sm"
      />
    </div>
  );
}

export function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="min-w-0">
      <label className="block text-xs font-semibold text-muted mb-1 break-words">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full min-w-0 border border-line rounded-sm px-3 py-2 text-sm"
      />
    </div>
  );
}

export function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="min-w-0">
      <label className="block text-xs font-semibold text-muted mb-1 break-words">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-full min-w-0 border border-line rounded-sm px-3 py-2 text-sm"
      />
    </div>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="min-w-0">
      <label className="block text-xs font-semibold text-muted mb-1 break-words">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 border border-line rounded-sm px-3 py-2 text-sm bg-white"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm text-ink cursor-pointer py-1 min-w-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 shrink-0"
      />
      <span className="break-words min-w-0">{label}</span>
    </label>
  );
}

export function YesNo({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 min-w-0">
      <span className="text-sm text-ink break-words min-w-0">{label}</span>
      <div className="flex shrink-0 border border-line rounded-sm overflow-hidden text-xs font-semibold">
        <button
          type="button"
          onClick={() => onChange(true)}
          className="px-2.5 py-1.5"
          style={{ backgroundColor: value ? "#172622" : "white", color: value ? "white" : "#60716B" }}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className="px-2.5 py-1.5 border-l border-line"
          style={{ backgroundColor: !value ? "#172622" : "white", color: !value ? "white" : "#60716B" }}
        >
          No
        </button>
      </div>
    </div>
  );
}

export function DisclaimerNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted bg-paperDim border border-line rounded-sm px-3 py-2">{children}</p>;
}
