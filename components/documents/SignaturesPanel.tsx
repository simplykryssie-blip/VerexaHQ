"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import type { DocumentRow, SignatureRequestRow } from "./types";

function parseSigners(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, email] = line.split(",").map((s) => s.trim());
      return { signer_name: name, signer_email: email || null };
    });
}

export function SignaturesPanel({
  signatureRequests,
  documents,
  workspaceId,
}: {
  signatureRequests: SignatureRequestRow[];
  documents: DocumentRow[];
  workspaceId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [attachmentId, setAttachmentId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [signersRaw, setSignersRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");

  async function createRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const signers = parseSigners(signersRaw);
    if (!attachmentId || signers.length === 0) {
      setError("Choose a document and at least one signer.");
      return;
    }

    const { data: request, error: reqError } = await supabase
      .from("signature_requests")
      .insert({ workspace_id: workspaceId, attachment_id: attachmentId, title, due_date: dueDate || null })
      .select("id")
      .single();
    if (reqError || !request) {
      setError(reqError?.message ?? "Could not create signature request.");
      return;
    }

    const { error: signersError } = await supabase.from("signature_request_signers").insert(
      signers.map((s, i) => ({ signature_request_id: request.id, signer_name: s.signer_name, signer_email: s.signer_email, sign_order: i + 1 }))
    );
    if (signersError) {
      setError(signersError.message);
      return;
    }

    toast.show("Signature request created", "success");
    setCreating(false);
    setTitle("");
    setAttachmentId("");
    setDueDate("");
    setSignersRaw("");
    router.refresh();
  }

  async function submitSignature() {
    if (!signingId || !typedName.trim()) return;
    const { error } = await supabase.rpc("record_signature", {
      p_signer_id: signingId,
      p_signature_type: "typed",
      p_typed_name: typedName.trim(),
    });
    setSigningId(null);
    setTypedName("");
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Signature recorded", "success");
    router.refresh();
  }

  async function decline(signerId: string) {
    const reason = window.prompt("Reason for declining (optional):") ?? undefined;
    const { error } = await supabase.rpc("decline_signature", { p_signer_id: signerId, p_reason: reason || undefined });
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Signature declined", "info");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Signature requests</h3>
          <button type="button" onClick={() => setCreating((v) => !v)} className="text-sm font-medium text-accent hover:underline">
            {creating ? "Cancel" : "New request"}
          </button>
        </div>
        {creating && (
          <form onSubmit={createRequest} className="mt-3 space-y-3">
            <input
              required
              placeholder="Title (e.g. Engagement letter)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <select
              required
              value={attachmentId}
              onChange={(e) => setAttachmentId(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="" disabled>
                Select document to sign
              </option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.file_name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <textarea
              required
              placeholder={"Signers, one per line: Name, email@example.com"}
              value={signersRaw}
              onChange={(e) => setSignersRaw(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90">
              Create request
            </button>
          </form>
        )}
      </div>

      {signatureRequests.length === 0 ? (
        <EmptyState message="No signature requests yet." />
      ) : (
        <ul className="space-y-3">
          {signatureRequests.map((r) => {
            const overdue = r.status === "pending" && r.due_date && new Date(r.due_date) < new Date();
            return (
              <li key={r.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">{r.title}</p>
                    <p className="text-xs text-muted">{r.attachment_file_name}</p>
                  </div>
                  <span className={`text-xs capitalize ${overdue ? "text-danger" : "text-muted"}`}>
                    {overdue ? "Expired" : r.status}
                  </span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {r.signers.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate">
                        {s.signer_name} {s.signer_email && <span className="text-muted">({s.signer_email})</span>}
                      </span>
                      {s.status === "pending" ? (
                        <span className="flex items-center gap-2">
                          <button type="button" onClick={() => setSigningId(s.id)} className="flex items-center gap-1 text-accent hover:underline">
                            <PenLine size={12} /> Mark signed
                          </button>
                          <button type="button" onClick={() => decline(s.id)} className="text-danger hover:underline">
                            Decline
                          </button>
                        </span>
                      ) : (
                        <span className={`capitalize ${s.status === "declined" ? "text-danger" : "text-green-700"}`}>
                          {s.status}
                          {s.signed_at && ` -- ${new Date(s.signed_at).toLocaleDateString()}`}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}

      {signingId && (
        <div role="dialog" aria-modal="true" aria-label="Capture signature" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Capture signature</h2>
              <button type="button" onClick={() => setSigningId(null)} aria-label="Close" className="text-muted hover:text-ink">
                <X size={16} />
              </button>
            </div>
            <p className="mt-2 text-sm text-muted">
              Staff-recorded signature (in person or via another channel) -- type the signer&apos;s full name to confirm.
            </p>
            <input
              autoFocus
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Full name"
              className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              type="button"
              onClick={submitSignature}
              disabled={!typedName.trim()}
              className="mt-3 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              Confirm signature
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
