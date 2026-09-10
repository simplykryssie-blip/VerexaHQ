"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/PasswordInput";

type ImportResult = {
  templateId: string;
  templateName: string;
  placeholderFields: string[];
  requiresSignature: boolean;
};

type JotFormListing = {
  id: string;
  title: string;
  status: string;
  submissionCount: number;
  updatedAt: string | null;
};

export function JotFormDocumentImportModal({
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
  const [showManualInput, setShowManualInput] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [forms, setForms] = useState<JotFormListing[] | null>(null);
  const [formsLoading, setFormsLoading] = useState(false);
  const [formsError, setFormsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (connected && forms === null) void loadForms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  async function loadForms() {
    setFormsLoading(true);
    setFormsError(null);
    try {
      const res = await fetch("/api/jotform/forms");
      const data = (await res.json()) as { ok: boolean; error?: string; forms?: JotFormListing[] };
      if (!data.ok) {
        setFormsError(data.error ?? "Could not load your JotForm forms.");
        setForms([]);
        return;
      }
      setForms(data.forms ?? []);
    } catch {
      setFormsError("Could not reach JotForm. You can still import by pasting a form link below.");
      setForms([]);
    } finally {
      setFormsLoading(false);
    }
  }

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
    setForms(null);
  }

  async function importForm(formIdOrUrl: string) {
    setError(null);
    try {
      const res = await fetch("/api/jotform/import-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formIdOrUrl }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string } & Partial<ImportResult>;
      if (!data.ok) {
        setError(data.error ?? "Import failed.");
        return;
      }
      setResult({
        templateId: data.templateId!,
        templateName: data.templateName!,
        placeholderFields: data.placeholderFields ?? [],
        requiresSignature: Boolean(data.requiresSignature),
      });
    } catch {
      setError("Could not reach the import service. Try again.");
    } finally {
      setImporting(false);
      setImportingId(null);
    }
  }

  async function runManualImport(e: React.FormEvent) {
    e.preventDefault();
    if (!formInput.trim()) {
      setError("Paste a JotForm form link or ID.");
      return;
    }
    setImporting(true);
    await importForm(formInput.trim());
  }

  async function importFromList(id: string) {
    setImportingId(id);
    await importForm(id);
  }

  const filteredForms = (forms ?? []).filter((f) => f.title.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-softHover">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-ink">Import from JotForm</h2>
          <button type="button" onClick={onClose} className="text-lg text-muted hover:text-ink">
            &times;
          </button>
        </div>

        <div className="mt-3 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">How this is different from importing a form</p>
            <p className="mt-1">
              A document is one flowing page, not a list of questions -- headings, text blocks, and page breaks come across as
              real document content. A signature question in the source form just turns on this document&apos;s own{" "}
              <strong>Requires signature</strong> setting -- Verexa handles the actual signing, not JotForm&apos;s.
            </p>
            <p className="mt-1">
              <strong>Every other question (name, date, checkbox, upload, etc.) has no place in a flowing document</strong>, so
              each one comes in as a plain placeholder line with its question text -- replace it with a real merge field (or
              delete it) in the document editor afterward.
            </p>
          </div>
        </div>

        {!connected ? (
          <form onSubmit={connect} className="mt-4 space-y-2">
            <p className="text-xs text-muted">
              Connect your firm&apos;s JotForm account first. Find your API key under JotForm &gt; Settings &gt; API.
            </p>
            <PasswordInput
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
            <p className="text-sm text-success">Imported &quot;{result.templateName}&quot; as a draft document.</p>
            {result.requiresSignature && <p className="text-xs text-muted">A signature was found in the source form -- Requires signature is turned on.</p>}
            {result.placeholderFields.length > 0 && (
              <p className="text-xs text-muted">
                These questions came in as plain placeholder lines -- replace with a merge field or remove them:{" "}
                {result.placeholderFields.join(", ")}.
              </p>
            )}
            <p className="text-xs text-muted">It&apos;s saved as a draft so you can review it before publishing.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
                Close
              </button>
              <button
                type="button"
                onClick={() => router.push(`/templates/engagement-letters/${result.templateId}`)}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
              >
                Open document
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {!showManualInput && (
              <>
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-muted" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search your forms..."
                    className="w-full rounded-lg border border-border py-2 pl-8 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>

                {formsLoading ? (
                  <p className="py-4 text-center text-sm text-muted">Loading your JotForm forms...</p>
                ) : formsError ? (
                  <p className="text-sm text-danger">{formsError}</p>
                ) : filteredForms.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted">
                    {forms && forms.length === 0 ? "No forms found on your JotForm account." : "No forms match that search."}
                  </p>
                ) : (
                  <ul className="max-h-72 space-y-1.5 overflow-y-auto">
                    {filteredForms.map((f) => (
                      <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{f.title}</p>
                          <p className="text-xs text-muted">
                            {f.submissionCount} submission{f.submissionCount === 1 ? "" : "s"}
                            {f.status === "DISABLED" && " -- disabled"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => importFromList(f.id)}
                          disabled={importingId !== null}
                          className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accentSoft disabled:opacity-60"
                        >
                          {importingId === f.id ? "Importing..." : "Import"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {showManualInput && (
              <form onSubmit={runManualImport} className="space-y-2">
                <input
                  autoFocus
                  value={formInput}
                  onChange={(e) => setFormInput(e.target.value)}
                  placeholder="https://form.jotform.com/123456789012345 or just the form ID"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowManualInput(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
                    Back to list
                  </button>
                  <button type="submit" disabled={importing} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60">
                    {importing ? "Importing..." : "Import"}
                  </button>
                </div>
              </form>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex items-center justify-between border-t border-border pt-2">
              <button type="button" onClick={disconnect} className="text-xs text-muted hover:text-danger">
                Disconnect JotForm
              </button>
              <div className="flex items-center gap-3">
                {!showManualInput && (
                  <>
                    <button type="button" onClick={loadForms} disabled={formsLoading} className="flex items-center gap-1 text-xs text-muted hover:text-ink disabled:opacity-60">
                      <RefreshCw size={12} className={formsLoading ? "animate-spin" : undefined} /> Refresh
                    </button>
                    <button type="button" onClick={() => setShowManualInput(true)} className="text-xs text-accent hover:underline">
                      Paste a link instead
                    </button>
                  </>
                )}
                <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
