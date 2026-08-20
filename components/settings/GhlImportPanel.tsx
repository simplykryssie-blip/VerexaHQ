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
  errors?: string[];
  hasMore?: boolean;
  nextCursor?: Cursor;
};

async function callImportApi(payload: Record<string, unknown>): Promise<PageResult> {
  const res = await fetch("/api/ghl/import-contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export function GhlImportPanel() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const stopRequestedRef = useRef(false);
  const [totals, setTotals] = useState({ imported: 0, skippedDuplicate: 0, skippedInvalid: 0 });
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runImport() {
    setRunning(true);
    stopRequestedRef.current = false;
    setDone(false);
    setError(null);
    setErrors([]);
    setTotals({ imported: 0, skippedDuplicate: 0, skippedInvalid: 0 });

    const startResult = await callImportApi({ phase: "start" }).catch(() => null);
    const pausedAutomationIds = (startResult as { pausedAutomationIds?: string[] } | null)?.pausedAutomationIds ?? [];

    let cursor: Cursor = null;
    let hasMore = true;
    let stoppedEarly = false;

    try {
      while (hasMore) {
        if (stopRequestedRef.current) {
          stoppedEarly = true;
          break;
        }
        const result = await callImportApi({ phase: "page", cursor });
        if (!result.ok) {
          setError(result.error ?? "Import failed.");
          break;
        }
        setTotals((t) => ({
          imported: t.imported + (result.imported ?? 0),
          skippedDuplicate: t.skippedDuplicate + (result.skippedDuplicate ?? 0),
          skippedInvalid: t.skippedInvalid + (result.skippedInvalid ?? 0),
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

      {(running || done) && (
        <div className="mt-3 rounded-lg bg-surfaceMuted p-3 text-xs text-slate">
          <p>
            {running ? "Importing..." : "Done."} {totals.imported} imported, {totals.skippedDuplicate} already existed, {totals.skippedInvalid} had
            no email or phone.
          </p>
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
