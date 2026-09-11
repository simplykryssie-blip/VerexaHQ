"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import type { BuilderPage } from "./types";

const fieldClass =
  "w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const monoFieldClass = `${fieldClass} font-mono text-xs`;

export type PageSettingsPatch = {
  meta_description: string | null;
  background_color: string | null;
  custom_css: string | null;
  custom_js: string | null;
  schema_markup: string | null;
};

export function PageSettingsPanel({
  page,
  onClose,
  onSaved,
}: {
  page: BuilderPage;
  onClose: () => void;
  onSaved: (patch: PageSettingsPatch) => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [metaDescription, setMetaDescription] = useState(page.meta_description ?? "");
  const [backgroundColor, setBackgroundColor] = useState(page.background_color ?? "");
  const [customCss, setCustomCss] = useState(page.custom_css ?? "");
  const [customJs, setCustomJs] = useState(page.custom_js ?? "");
  const [schemaMarkup, setSchemaMarkup] = useState(page.schema_markup ?? "");
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmedSchema = schemaMarkup.trim();
    if (trimmedSchema) {
      try {
        JSON.parse(trimmedSchema);
        setSchemaError(null);
      } catch {
        setSchemaError("This isn't valid JSON -- schema markup needs to parse as JSON-LD.");
        return;
      }
    } else {
      setSchemaError(null);
    }

    setSaving(true);
    setError(null);
    const patch: PageSettingsPatch = {
      meta_description: metaDescription.trim() || null,
      background_color: backgroundColor.trim() || null,
      custom_css: customCss.trim() || null,
      custom_js: customJs.trim() || null,
      schema_markup: trimmedSchema || null,
    };
    const { error: updateError } = await supabase.from("site_pages").update(patch).eq("id", page.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    toast.show("Page settings saved", "success");
    onSaved(patch);
    onClose();
  }

  return (
    <Modal title="Page settings" onClose={onClose} size="xl">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink">Meta description</label>
          <textarea
            value={metaDescription}
            onChange={(e) => setMetaDescription(e.target.value)}
            rows={2}
            placeholder="Shown under the title in search results..."
            className={fieldClass}
          />
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
            rows={6}
            placeholder=".hero { letter-spacing: 0.02em; }"
            className={monoFieldClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink">Custom JavaScript</label>
          <p className="mb-1 text-[11px] text-muted">
            Runs on the published page only, wrapped in a script tag -- for site-wide tracking (Google Analytics, Meta
            Pixel), use the website&apos;s tracking scripts in Website Settings instead.
          </p>
          <textarea
            value={customJs}
            onChange={(e) => setCustomJs(e.target.value)}
            rows={6}
            placeholder="console.log('page loaded');"
            className={monoFieldClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink">Schema markup (JSON-LD)</label>
          <p className="mb-1 text-[11px] text-muted">Structured data for search engines -- must be valid JSON.</p>
          <textarea
            value={schemaMarkup}
            onChange={(e) => setSchemaMarkup(e.target.value)}
            rows={6}
            placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "LocalBusiness",\n  "name": "..."\n}'}
            className={monoFieldClass}
          />
          {schemaError && <p className="mt-1 text-xs text-danger">{schemaError}</p>}
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
