"use client";

import { useState } from "react";

export function DeleteStageDialog({
  stageName,
  affectedCount,
  otherStages,
  onCancel,
  onConfirm,
}: {
  stageName: string;
  affectedCount: number;
  otherStages: { id: string; name: string }[];
  onCancel: () => void;
  onConfirm: (destination: { stageId: string } | { newStageName: string }) => void;
}) {
  const CREATE_NEW = "__create_new__";
  const [selection, setSelection] = useState("");
  const [newStageName, setNewStageName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canConfirm = selection === CREATE_NEW ? newStageName.trim().length > 0 : selection.length > 0;

  function handleConfirm() {
    setSubmitting(true);
    if (selection === CREATE_NEW) {
      onConfirm({ newStageName: newStageName.trim() });
    } else {
      onConfirm({ stageId: selection });
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-lg">
        <h3 className="text-sm font-semibold text-ink">Move engagements before deleting</h3>
        <p className="mt-2 text-sm text-slate">
          <strong>{affectedCount}</strong> engagement{affectedCount === 1 ? " is" : "s are"} currently on &quot;{stageName}&quot;. Choose
          where they should move before this stage can be deleted.
        </p>

        <select
          value={selection}
          onChange={(e) => setSelection(e.target.value)}
          className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="" disabled>
            Select a destination stage
          </option>
          {otherStages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value={CREATE_NEW}>+ Create new stage...</option>
        </select>

        {selection === CREATE_NEW && (
          <input
            autoFocus
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
            placeholder="New stage name"
            className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate hover:bg-surfaceMuted">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm || submitting}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {submitting ? "Moving..." : "Move & delete stage"}
          </button>
        </div>
      </div>
    </div>
  );
}
