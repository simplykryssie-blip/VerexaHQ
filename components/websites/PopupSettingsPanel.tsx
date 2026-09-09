"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";

const fieldClass =
  "w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export type PopupTriggerType = "on_load" | "after_delay" | "exit_intent" | "scroll_percent";
export type PopupFrequency = "every_visit" | "once_per_session" | "once_ever" | "every_n_days";

export type PopupSettings = {
  id: string;
  trigger_type: PopupTriggerType;
  trigger_value: number | null;
  display_frequency: PopupFrequency;
  frequency_days: number | null;
  target_page_ids: string[] | null;
  background_color: string | null;
  custom_css: string | null;
};

export type PopupSettingsPatch = {
  trigger_type: PopupTriggerType;
  trigger_value: number | null;
  display_frequency: PopupFrequency;
  frequency_days: number | null;
  target_page_ids: string[] | null;
  background_color: string | null;
  custom_css: string | null;
};

const TRIGGER_OPTIONS: { value: PopupTriggerType; label: string; help: string }[] = [
  { value: "on_load", label: "Immediately on load", help: "Shows as soon as the page finishes loading." },
  { value: "after_delay", label: "After a time delay", help: "Shows this many seconds after the page loads." },
  { value: "exit_intent", label: "Exit intent", help: "Shows when a visitor's mouse moves toward leaving the page (desktop only)." },
  { value: "scroll_percent", label: "On scroll", help: "Shows once a visitor scrolls past this percent of the page." },
];

const FREQUENCY_OPTIONS: { value: PopupFrequency; label: string }[] = [
  { value: "every_visit", label: "Every visit" },
  { value: "once_per_session", label: "Once per browser session" },
  { value: "once_ever", label: "Once ever, per visitor" },
  { value: "every_n_days", label: "Every N days" },
];

export function PopupSettingsPanel({
  popup,
  pageOptions,
  onClose,
  onSaved,
}: {
  popup: PopupSettings;
  pageOptions: { id: string; title: string }[];
  onClose: () => void;
  onSaved: (patch: PopupSettingsPatch) => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [triggerType, setTriggerType] = useState<PopupTriggerType>(popup.trigger_type);
  const [triggerValue, setTriggerValue] = useState(popup.trigger_value != null ? String(popup.trigger_value) : "");
  const [frequency, setFrequency] = useState<PopupFrequency>(popup.display_frequency);
  const [frequencyDays, setFrequencyDays] = useState(popup.frequency_days != null ? String(popup.frequency_days) : "");
  const [targetAllPages, setTargetAllPages] = useState(!popup.target_page_ids || popup.target_page_ids.length === 0);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>(popup.target_page_ids ?? []);
  const [backgroundColor, setBackgroundColor] = useState(popup.background_color ?? "");
  const [customCss, setCustomCss] = useState(popup.custom_css ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePage(id: string) {
    setSelectedPageIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const patch: PopupSettingsPatch = {
      trigger_type: triggerType,
      trigger_value: triggerType === "after_delay" || triggerType === "scroll_percent" ? Number(triggerValue) || null : null,
      display_frequency: frequency,
      frequency_days: frequency === "every_n_days" ? Number(frequencyDays) || null : null,
      target_page_ids: targetAllPages ? null : selectedPageIds,
      background_color: backgroundColor.trim() || null,
      custom_css: customCss.trim() || null,
    };
    const { error: updateError } = await supabase.from("site_popups").update(patch).eq("id", popup.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    toast.show("Popup settings saved", "success");
    onSaved(patch);
    onClose();
  }

  return (
    <Modal title="Popup settings" onClose={onClose} size="xl">
      <div className="space-y-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink">When should this popup show?</label>
          <div className="space-y-2">
            {TRIGGER_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm transition ${
                  triggerType === opt.value ? "border-accent bg-accentSoft" : "border-border hover:border-accent/50"
                }`}
              >
                <input
                  type="radio"
                  name="trigger_type"
                  checked={triggerType === opt.value}
                  onChange={() => setTriggerType(opt.value)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium text-ink">{opt.label}</span>
                  <span className="block text-xs text-muted">{opt.help}</span>
                </span>
              </label>
            ))}
          </div>
          {triggerType === "after_delay" && (
            <label className="mt-2 flex items-center gap-2 text-xs text-muted">
              Delay (seconds)
              <input
                type="number"
                min={0}
                value={triggerValue}
                onChange={(e) => setTriggerValue(e.target.value)}
                className="w-24 rounded-lg border border-border px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
          )}
          {triggerType === "scroll_percent" && (
            <label className="mt-2 flex items-center gap-2 text-xs text-muted">
              Scroll percent
              <input
                type="number"
                min={1}
                max={100}
                value={triggerValue}
                onChange={(e) => setTriggerValue(e.target.value)}
                className="w-24 rounded-lg border border-border px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink">How often should a visitor see it?</label>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as PopupFrequency)} className={fieldClass}>
            {FREQUENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {frequency === "every_n_days" && (
            <label className="mt-2 flex items-center gap-2 text-xs text-muted">
              Days between shows
              <input
                type="number"
                min={1}
                value={frequencyDays}
                onChange={(e) => setFrequencyDays(e.target.value)}
                className="w-24 rounded-lg border border-border px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink">Which pages should show it?</label>
          <label className="flex items-center gap-2 text-sm text-slate">
            <input type="checkbox" checked={targetAllPages} onChange={(e) => setTargetAllPages(e.target.checked)} />
            All pages on this website
          </label>
          {!targetAllPages && (
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {pageOptions.length === 0 ? (
                <p className="px-1 py-1 text-xs text-muted">No pages on this website yet.</p>
              ) : (
                pageOptions.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm text-slate hover:bg-surfaceMuted">
                    <input type="checkbox" checked={selectedPageIds.includes(p.id)} onChange={() => togglePage(p.id)} />
                    {p.title}
                  </label>
                ))
              )}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink">Background color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={backgroundColor || "#ffffff"}
              onChange={(e) => setBackgroundColor(e.target.value)}
              className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1"
            />
            <input
              value={backgroundColor}
              onChange={(e) => setBackgroundColor(e.target.value)}
              placeholder="#ffffff (default: white)"
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink">Custom CSS</label>
          <textarea
            value={customCss}
            onChange={(e) => setCustomCss(e.target.value)}
            rows={4}
            placeholder=".cta { font-weight: 600; }"
            className={`${fieldClass} font-mono text-xs`}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate hover:bg-surfaceMuted">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
