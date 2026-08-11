"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ImportResult = {
  templateId: string;
  templateName: string;
  fieldCount: number;
  approximatedFields: string[];
};

export function JotFormImportModal({
  workspaceId,
  isConnected,
  onClose,
}: {
  workspaceId: string;
  isConnected: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [connected, setConnected] = useState(isConnected);
  const [apiKey, setApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [formInput, setFormInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!apiKey.trim()) {
      setError("Paste your JotForm API key.");
      return;
    }
    setConnecting(true);
    const { error: rpcError } = await supabase.rpc("set_workspace_jotform_api_key", {
      p_workspace_id: workspaceId,
      p_api_key: apiKey.trim(),
    });
    setConnecting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setConnected(true);
    setApiKey("");
  }

  async function disconnect() {
    if (!window.confirm("Disconnect JotForm? You'll need to re-enter your API key to import again.")) return;
    await supabase.rpc("disconnect_workspace_jotform", { p_workspace_id: workspaceId });
    setConnected(false);
  }

  async function runImport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!formInput.trim()) {
      setError("Paste a JotForm form link or ID.");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/jotform/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formIdOrUrl: formInput.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string } & Partial<ImportResult>;
      if (!data.ok) {
        setError(data.error ?? "Import failed.");
        return;
      }
      setResult({
        templateId: data.templateId!,
        templateName: data.templateName!,
        fieldCount: data.fieldCount!,
        approximatedFields: data.approximatedFields ?? [],
      });
    } catch {
      setError("Could not reach the import service. Try again.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Import from JotForm</h2>
          <button type="button" onClick={onClose} className="text-lg text-muted hover:text-ink">
            &times;
          </button>
        </div>

        <div className="mt-3 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">What transfers, and what doesn&apos;t</p>
            <p className="mt-1">
              Field labels, types (text, dropdown, checkbox, date, address, file upload, signature, etc.), answer choices, required
              flags, and field order all transfer.
            </p>
            <p className="mt-1">
              <strong>Conditional show/hide logic, branching, calculations, pricing, and multi-page breaks are not imported.</strong>{" "}
              You&apos;ll need to rebuild any of those manually afterward in the field&apos;s Conditional Logic panel. Field types
              JotForm supports that we don&apos;t (matrix tables, custom widgets, etc.) come in as a plain text field instead, and
              will be flagged after import so you can fix them.
            </p>
          </div>
        </div>

        {!connected ? (
          <form onSubmit={connect} className="mt-4 space-y-2">
            <p className="text-xs text-muted">
              Connect your firm&apos;s JotForm account first. Find your API key under JotForm &gt; Settings &gt; API.
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="JotForm API key"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
                Cancel
              </button>
              <button type="submit" disabled={connecting} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60">
                {connecting ? "Connecting..." : "Connect"}
              </button>
            </div>
          </form>
        ) : result ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-success">
              Imported &quot;{result.templateName}&quot; with {result.fieldCount} field{result.fieldCount === 1 ? "" : "s"} as a draft.
            </p>
            {result.approximatedFields.length > 0 && (
              <p className="text-xs text-muted">
                These came in as a plain text field since JotForm&apos;s type doesn&apos;t have a direct match -- review and adjust
                their type: {result.approximatedFields.join(", ")}.
              </p>
            )}
            <p className="text-xs text-muted">It&apos;s saved as a draft so you can review it before publishing.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
                Close
              </button>
              <button
                type="button"
                onClick={() => router.push(`/templates/organizers/${result.templateId}`)}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
              >
                Open organizer
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={runImport} className="mt-4 space-y-2">
            <input
              value={formInput}
              onChange={(e) => setFormInput(e.target.value)}
              placeholder="https://form.jotform.com/123456789012345 or just the form ID"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex items-center justify-between">
              <button type="button" onClick={disconnect} className="text-xs text-muted hover:text-danger">
                Disconnect JotForm
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
                  Cancel
                </button>
                <button type="submit" disabled={importing} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60">
                  {importing ? "Importing..." : "Import"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
