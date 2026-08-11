"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileCheck } from "lucide-react";
import { useToast } from "@/components/Toast";
import { OrganizerAnswerReveal } from "./OrganizerAnswerReveal";

export type OrganizerFieldAnswer = { fieldId: string; answerId: string | null; label: string; fieldType: string; display: string; maskable: boolean };
export type OrganizerRepeaterGroup = { fieldId: string; label: string; instances: { index: number; fields: OrganizerFieldAnswer[] }[] };
export type OrganizerResponseDetail = {
  id: string;
  status: string;
  submitted_at: string | null;
  template_name: string;
  filed_as_attachment?: boolean;
  topLevel?: OrganizerFieldAnswer[];
  repeaters?: OrganizerRepeaterGroup[];
};

// Clicking anywhere on the row expands/collapses the answers -- the
// content was previously only rendered inline with no way to open/close
// it, which read as "nothing happens when I click this."
export function OrganizerResponseCard({ response }: { response: OrganizerResponseDetail }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [filing, setFiling] = useState(false);

  const hasAnswers = response.status === "submitted" || response.status === "reviewed";

  async function fileNow(e: React.MouseEvent) {
    e.stopPropagation();
    setFiling(true);
    try {
      const res = await fetch("/api/documents/file-organizer-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId: response.id }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        toast.show(data.error ?? "Could not file this organizer.", "error");
        return;
      }
      toast.show("Filed to Documents.", "success");
      window.location.reload();
    } catch {
      toast.show("Could not file this organizer.", "error");
    } finally {
      setFiling(false);
    }
  }

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => hasAnswers && setOpen((v) => !v)}
        disabled={!hasAnswers}
        className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm disabled:cursor-default"
      >
        <span className="flex items-center gap-2 text-slate">
          {hasAnswers && (open ? <ChevronDown size={14} className="shrink-0 text-muted" /> : <ChevronRight size={14} className="shrink-0 text-muted" />)}
          {response.template_name}
        </span>
        <span className="flex items-center gap-2">
          {hasAnswers && !response.filed_as_attachment && (
            <button
              type="button"
              onClick={fileNow}
              disabled={filing}
              className="inline-flex items-center gap-1 rounded-full border border-accent px-2 py-0.5 text-[11px] font-medium text-accent hover:bg-accentSoft disabled:opacity-60"
              title="File this organizer's answers into Documents"
            >
              <FileCheck size={11} /> {filing ? "Filing..." : "File to Documents"}
            </button>
          )}
          <span className="capitalize text-muted">
            {response.status.replace("_", " ")}
            {response.submitted_at && ` -- submitted ${new Date(response.submitted_at).toLocaleDateString()}`}
          </span>
        </span>
      </button>

      {open && hasAnswers && (
        <div className="space-y-3 border-t border-border p-3">
          {(response.topLevel ?? []).map((f) => (
            <div key={f.fieldId} className="flex items-start justify-between gap-4 text-sm">
              <span className="text-muted">{f.label}</span>
              <span className="text-right text-slate">
                {f.maskable && f.answerId ? <OrganizerAnswerReveal answerId={f.answerId} masked={f.display} /> : f.display}
              </span>
            </div>
          ))}

          {(response.repeaters ?? []).map((r) => (
            <div key={r.fieldId}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{r.label}</p>
              {r.instances.length === 0 ? (
                <p className="mt-1 text-xs text-muted">None provided.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {r.instances.map((instance) => (
                    <div key={instance.index} className="rounded-lg bg-surfaceMuted p-2">
                      <p className="text-xs font-medium text-ink">
                        {r.label} {instance.index + 1}
                      </p>
                      <div className="mt-1 space-y-1">
                        {instance.fields.map((f) => (
                          <div key={f.fieldId} className="flex items-start justify-between gap-4 text-xs">
                            <span className="text-muted">{f.label}</span>
                            <span className="text-right text-slate">
                              {f.maskable && f.answerId ? <OrganizerAnswerReveal answerId={f.answerId} masked={f.display} /> : f.display}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {(response.topLevel ?? []).length === 0 && (response.repeaters ?? []).length === 0 && (
            <p className="text-xs text-muted">No answers were recorded on this organizer.</p>
          )}
        </div>
      )}
    </div>
  );
}
