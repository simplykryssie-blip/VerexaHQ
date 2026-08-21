"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Cursor = { startAfterId?: string; startAfter?: number } | null;

type PageResult = {
  ok: boolean;
  error?: string;
  imported?: number;
  skippedDuplicate?: number;
  skippedInvalid?: number;
  skippedTagFilter?: number;
  notesImported?: number;
  tasksImported?: number;
  appointmentsImported?: number;
  conversationsImported?: number;
  customFieldsSet?: number;
  errors?: string[];
  hasMore?: boolean;
  nextCursor?: Cursor;
};

type StartResult = { pausedAutomationIds?: string[]; customFieldDefs?: Record<string, string> };

async function callImportApi(payload: Record<string, unknown>): Promise<PageResult> {
  const res = await fetch("/api/ghl/import-contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

const EXTRA_TYPES = [
  { key: "importCustomFields", label: "Custom fields" },
  { key: "importNotes", label: "Notes" },
  { key: "importTasks", label: "Tasks" },
  { key: "importAppointments", label: "Appointments" },
  { key: "importConversations", label: "Conversations (SMS/email history)" },
] as const;
type ExtraKey = (typeof EXTRA_TYPES)[number]["key"];

const ZERO_TOTALS = {
  imported: 0,
  skippedDuplicate: 0,
  skippedInvalid: 0,
  skippedTagFilter: 0,
  notesImported: 0,
  tasksImported: 0,
  appointmentsImported: 0,
  conversationsImported: 0,
  customFieldsSet: 0,
};

export function GhlImportPanel() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const stopRequestedRef = useRef(false);
  const [tagFilterText, setTagFilterText] = useState("Tax| Individual/ Schedule C\nTax| Corporate Return\nTPB");
  const [extras, setExtras] = useState<Record<ExtraKey, boolean>>({
    importCustomFields: false,
    importNotes: false,
    importTasks: false,
    importAppointments: false,
    importConversations: false,
  });
  const [totals, setTotals] = useState(ZERO_TOTALS);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runImport() {
    const filterTags = tagFilterText
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    setRunning(true);
    stopRequestedRef.current = false;
    setDone(false);
    setError(null);
    setErrors([]);
    setTotals(ZERO_TOTALS);

    const startResult = (await callImportApi({ phase: "start", ...extras }).catch(() => null)) as StartResult | null;
    const pausedAutomationIds = startResult?.pausedAutomationIds ?? [];
    const customFieldDefs = startResult?.customFieldDefs ?? {};

    let cursor: Cursor = null;
    let hasMore = true;
    let stoppedEarly = false;

    try {
      while (hasMore) {
        if (stopRequestedRef.current) {
          stoppedEarly = true;
          break;
        }
        const result = await callImportApi({ phase: "page", cursor, filterTags, ...extras, customFieldDefs });
        if (!result.ok) {
          setError(result.error ?? "Import failed.");
          break;
        }
        setTotals((t) => ({
          imported: t.imported + (result.imported ?? 0),
          skippedDuplicate: t.skippedDuplicate + (result.skippedDuplicate ?? 0),
          skippedInvalid: t.skippedInvalid + (result.skippedInvalid ?? 0),
          skippedTagFilter: t.skippedTagFilter + (result.skippedTagFilter ?? 0),
          notesImported: t.notesImported + (result.notesImported ?? 0),
          tasksImported: t.tasksImported + (result.tasksImported ?? 0),
          appointmentsImported: t.appointmentsImported + (result.appointmentsImported ?? 0),
          conversationsImported: t.conversationsImported + (result.conversationsImported ?? 0),
          customFieldsSet: t.customFieldsSet + (result.customFieldsSet ?? 0),
        }));
        if (result.errors && result.errors.length > 0) {
          setErrors((e) => [...e, ...result.errors!]);
        }
        hasMore = Boolean(result.hasMore);
        cursor = result.nextCursor ?? null;
      }
    } finally {
      await callImportApi({ phase: "finish", pausedAutomationIds }).catch(() => {});
      setRunning(false);
      setDone(true);
      if (stoppedEarly) {
        setError("Import stopped and automations re-enabled. Running the import again starts over from the beginning -- already-imported contacts are skipped as duplicates.");
      }
      router.refresh();
    }
  }

  const anyExtras = Object.values(extras).some(Boolean);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">Import contacts</p>
          <p className="text-xs text-muted">
            Imports name, email, phone, and tags as new leads. New-lead and tag-triggered automations are paused for the duration of the import,
            then re-enabled. Addresses aren&apos;t imported.
          </p>
        </div>
        {running ? (
          <button
            type="button"
            onClick={() => {
              stopRequestedRef.current = true;
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:bg-surfaceMuted"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={runImport}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
          >
            {done ? "Import again" : "Import contacts"}
          </button>
        )}
      </div>

      <div className="mt-3">
        <label className="text-xs font-medium text-ink">Only import contacts tagged (any of, one per line -- leave blank for all)</label>
        <textarea
          value={tagFilterText}
          onChange={(e) => setTagFilterText(e.target.value)}
          disabled={running}
          rows={3}
          className="mt-1 w-full rounded-lg border border-border px-3 py-1.5 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
        />
      </div>

      <div className="mt-3">
        <label className="text-xs font-medium text-ink">Also import, per contact (each needs its scope enabled on your GHL Private Integration Token)</label>
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
          {EXTRA_TYPES.map((t) => (
            <label key={t.key} className="flex items-center gap-1.5 text-xs text-slate">
              <input
                type="checkbox"
                checked={extras[t.key]}
                disabled={running}
                onChange={(e) => setExtras((prev) => ({ ...prev, [t.key]: e.target.checked }))}
                className="h-3.5 w-3.5 rounded border-border"
              />
              {t.label}
            </label>
          ))}
        </div>
        {anyExtras && (
          <p className="mt-1.5 text-xs text-muted">
            Fetching extras per contact is slower -- larger imports will take noticeably longer and run in more, smaller batches.
          </p>
        )}
      </div>

      {(running || done) && (
        <div className="mt-3 rounded-lg bg-surfaceMuted p-3 text-xs text-slate">
          <p>
            {running ? "Importing..." : "Done."} {totals.imported} imported, {totals.skippedDuplicate} already existed, {totals.skippedInvalid} had
            no email or phone, {totals.skippedTagFilter} didn&apos;t match the tag filter.
          </p>
          {(totals.notesImported > 0 ||
            totals.tasksImported > 0 ||
            totals.appointmentsImported > 0 ||
            totals.conversationsImported > 0 ||
            totals.customFieldsSet > 0) && (
            <p className="mt-1">
              Also brought in: {totals.customFieldsSet} contacts with custom fields, {totals.notesImported} notes, {totals.tasksImported} tasks,{" "}
              {totals.appointmentsImported} appointments, {totals.conversationsImported} conversation messages.
            </p>
          )}
          {errors.length > 0 && (
            <div className="mt-2">
              <p className="font-medium text-danger">{errors.length} row(s) failed:</p>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                {errors.slice(0, 20).map((e, i) => (
                  <li key={i} className="text-danger">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
