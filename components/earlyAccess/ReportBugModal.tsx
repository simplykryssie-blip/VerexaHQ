"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";
import type { BugSeverity } from "@/lib/earlyAccess/types";

const SEVERITIES: BugSeverity[] = ["low", "medium", "high", "critical"];

// Diagnostic metadata is limited to what's safe to capture automatically:
// URL, module (route), app version, browser UA, viewport, timestamp.
// Never captures auth tokens, form field values, secret values, or console
// output.
export default function ReportBugModal({
  workspaceId,
  campaignId,
  appVersion,
  onClose,
}: {
  workspaceId: string;
  campaignId: string | null;
  appVersion: string | null;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [severity, setSeverity] = useState<BugSeverity>("medium");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      setSubmitting(false);
      setError("Your session expired. Please sign in again.");
      return;
    }

    const { error: insertError } = await supabase.from("early_access_bug_reports").insert({
      campaign_id: campaignId,
      workspace_id: workspaceId,
      reported_by: userId,
      title,
      description,
      expected_behavior: expected || null,
      actual_behavior: actual || null,
      module: pathname,
      page_url: typeof window !== "undefined" ? window.location.href : null,
      browser_info: typeof navigator !== "undefined" ? navigator.userAgent : null,
      app_version: appVersion,
      severity,
      diagnostic_metadata: {
        viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : null,
        reported_at: new Date().toISOString(),
      },
    });

    setSubmitting(false);
    if (insertError) {
      setError(friendlyError(insertError, "Couldn't submit that bug report. Please try again."));
      return;
    }
    setDone(true);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-sm border border-line bg-white p-6">
        <div className="mb-4 flex items-start justify-between">
          <h3 className="font-slab text-lg font-bold text-ink">Report a bug</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="space-y-3">
            <div className="rounded-sm border border-green/30 bg-green/10 px-3 py-2 text-sm text-green">
              Thanks — your report was submitted and the team can see it.
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-sm bg-ink py-2 text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              required
              placeholder="Short title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-sm border border-line px-3 py-2 text-sm"
            />
            <textarea
              required
              placeholder="What happened?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-sm border border-line px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <textarea
                placeholder="Expected behavior (optional)"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                rows={2}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Actual behavior (optional)"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                rows={2}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as BugSeverity)}
                className="mt-1 w-full rounded-sm border border-line px-3 py-2 text-sm capitalize"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted">
              We automatically include this page&apos;s URL and your browser info to help
              investigate. We never capture passwords, tokens, or other secret values.
            </p>
            {error && (
              <div className="rounded-sm border border-brick/30 bg-brick/10 px-3 py-2 text-xs text-brick">
                {error}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-sm border border-line py-2 text-sm font-semibold text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-sm bg-ink py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
