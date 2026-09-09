"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import {
  IRS_AUTHORIZATION_STATUS_LABELS,
  getManualAdvanceOptions,
  type IrsAuthorizationStatus,
} from "@/lib/irsAuthorizationStatus";

const TERMINAL: IrsAuthorizationStatus[] = ["denied", "revoked"];

export function IrsAuthorizationStatusPanel({
  authorizationId,
  status,
  canManage,
}: {
  authorizationId: string;
  status: IrsAuthorizationStatus;
  canManage: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<IrsAuthorizationStatus | null>(null);
  const [note, setNote] = useState("");

  const options = getManualAdvanceOptions(status);

  async function advance(target: IrsAuthorizationStatus, withNote: string | null) {
    setBusy(true);
    const { error } = await supabase.rpc("set_irs_authorization_status", {
      p_authorization_id: authorizationId,
      p_status: target,
      p_note: withNote ?? undefined,
    });
    setBusy(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setRevealed(null);
    setNote("");
    toast.show(`Marked ${IRS_AUTHORIZATION_STATUS_LABELS[target]}.`, "success");
    router.refresh();
  }

  if (!canManage) {
    return <p className="text-sm text-muted">You don&apos;t have permission to advance this authorization&apos;s status.</p>;
  }

  if (options.length === 0) {
    return <p className="text-sm text-muted">This authorization is in a terminal status and can&apos;t be advanced further.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate">Advance status</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isTerminal = TERMINAL.includes(option);
          const toneClasses = isTerminal
            ? "border-danger text-danger hover:bg-dangerSoft"
            : "border-accent text-accent hover:bg-accentSoft";
          return (
            <button
              key={option}
              type="button"
              disabled={busy}
              onClick={() => (isTerminal ? setRevealed(option) : advance(option, null))}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${toneClasses}`}
            >
              {IRS_AUTHORIZATION_STATUS_LABELS[option]}
            </button>
          );
        })}
      </div>

      {revealed && (
        <div className="rounded-lg border border-border bg-surfaceMuted p-3">
          <label className="block text-xs font-medium text-slate">
            Reason for marking {IRS_AUTHORIZATION_STATUS_LABELS[revealed]}
            <input
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy || !note.trim()}
              onClick={() => advance(revealed, note.trim())}
              className="rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white hover:bg-danger/90 disabled:opacity-60"
            >
              Confirm {IRS_AUTHORIZATION_STATUS_LABELS[revealed]}
            </button>
            <button
              type="button"
              onClick={() => {
                setRevealed(null);
                setNote("");
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
