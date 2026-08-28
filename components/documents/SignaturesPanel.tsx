"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine, X, Link as LinkIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { createSignatureRequestFromTemplate } from "@/lib/documents/createSignatureRequestFromTemplate";
import { uploadSignatureImageClient } from "@/lib/documents/uploadSignatureImage";
import { renderEmail } from "@/lib/email/template";
import { SignaturePad, type SignatureMode } from "@/components/SignaturePad";
import type { Audience, DocumentRow, EngagementLetterTemplateOption, EntityType, SignatureRequestRow } from "./types";

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
  templates = [],
  entityType,
  entityId,
  clientName,
  clientEmail,
  firmName,
  workspaceId,
  audience = "staff",
  canCreate = true,
}: {
  signatureRequests: SignatureRequestRow[];
  documents: DocumentRow[];
  templates?: EngagementLetterTemplateOption[];
  entityType?: EntityType;
  entityId?: string;
  clientName?: string;
  clientEmail?: string | null;
  firmName?: string;
  workspaceId: string;
  audience?: Audience;
  canCreate?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [source, setSource] = useState<"upload" | "template">("template");
  const [title, setTitle] = useState("");
  const [attachmentId, setAttachmentId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [dueDate, setDueDate] = useState("");
  // Defaults to the client this panel is already open for -- otherwise
  // there's no visible way to say who a request goes to beyond typing a
  // name/email into a bare textarea from scratch.
  const [signersRaw, setSignersRaw] = useState(clientName ? `${clientName}, ${clientEmail ?? ""}` : "");
  const [error, setError] = useState<string | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [signatureMode, setSignatureMode] = useState<SignatureMode>("typed");
  const [typedName, setTypedName] = useState("");
  const [drawnDataUrl, setDrawnDataUrl] = useState<string | null>(null);
  const [signingError, setSigningError] = useState<string | null>(null);
  const [submittingSignature, setSubmittingSignature] = useState(false);

  async function createRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const signers = parseSigners(signersRaw);
    if (source === "upload" && !attachmentId) {
      setError("Choose a document and at least one signer.");
      return;
    }
    if (source === "template" && !templateId) {
      setError("Choose a template and at least one signer.");
      return;
    }
    if (signers.length === 0) {
      setError("Add at least one signer.");
      return;
    }

    if (source === "template") {
      const template = templates.find((t) => t.id === templateId);
      if (!template || !entityType || !entityId) {
        setError("Could not prepare the document to sign.");
        return;
      }
      const result = await createSignatureRequestFromTemplate({
        supabase,
        workspaceId,
        entityType,
        entityId,
        template,
        clientName,
        firmName,
        signers,
        title,
        dueDate,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
    } else {
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
    }

    toast.show("Signature request created", "success");

    if (clientEmail) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: clientEmail,
          sender: "notifications",
          subject: `Ready to sign: ${title}`,
          html: renderEmail({
            heading: "You have a document to sign",
            bodyHtml: `<p>Please log in to your client portal to review and sign <strong>${title}</strong>.</p>`,
            ctaLabel: "Go to portal",
            ctaUrl: `${appUrl}/portal/login`,
          }),
        }),
      }).catch(() => {
        // Best-effort -- the request itself is already created.
      });
    }

    setCreating(false);
    setTitle("");
    setAttachmentId("");
    setTemplateId("");
    setDueDate("");
    setSignersRaw("");
    router.refresh();
  }

  function closeSigningModal() {
    setSigningId(null);
    setSignatureMode("typed");
    setTypedName("");
    setDrawnDataUrl(null);
    setSigningError(null);
  }

  async function submitSignature() {
    if (!signingId) return;
    // Staff mode stays typed-only (recording a signature captured in person
    // or via another channel); portal mode lets the signer pick either.
    const usingDrawnMode = audience === "portal" && signatureMode === "drawn";
    if (usingDrawnMode ? !drawnDataUrl : !typedName.trim()) return;
    setSigningError(null);

    let signatureImagePath: string | undefined;

    if (usingDrawnMode) {
      const request = signatureRequests.find((r) => r.signers.some((s) => s.id === signingId));
      if (!request) {
        setSigningError("Could not find this signing request.");
        return;
      }
      setSubmittingSignature(true);
      const uploadResult = await uploadSignatureImageClient(supabase, workspaceId, request.id, drawnDataUrl as string);
      if ("error" in uploadResult) {
        setSubmittingSignature(false);
        setSigningError(uploadResult.error);
        return;
      }
      signatureImagePath = uploadResult.path;
    } else {
      setSubmittingSignature(true);
    }

    const { error } = await supabase.rpc("record_signature", {
      p_signer_id: signingId,
      p_signature_type: usingDrawnMode ? "drawn" : "typed",
      p_typed_name: usingDrawnMode ? undefined : typedName.trim(),
      p_signature_image_path: signatureImagePath,
    });
    setSubmittingSignature(false);
    if (error) {
      setSigningError(error.message);
      return;
    }
    closeSigningModal();
    toast.show("Signature recorded", "success");
    router.refresh();
  }

  async function copySigningLink(token: string) {
    const url = `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/sign/${token}`;
    await navigator.clipboard.writeText(url);
    toast.show("Signing link copied -- send it to anyone, no account needed", "success");
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
      <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Signature requests</h3>
          {audience === "staff" && canCreate && (
            <button type="button" onClick={() => setCreating((v) => !v)} className="text-sm font-medium text-accent hover:underline">
              {creating ? "Cancel" : "New request"}
            </button>
          )}
        </div>
        {audience === "staff" && canCreate && creating && (
          <form onSubmit={createRequest} className="mt-3 space-y-3">
            <input
              required
              placeholder="Title (e.g. Engagement letter)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="flex gap-1 rounded-lg bg-surfaceMuted p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => setSource("template")}
                className={`flex-1 rounded-md px-2 py-1.5 transition ${source === "template" ? "bg-surface text-accent shadow-sm" : "text-muted"}`}
              >
                Form template
              </button>
              <button
                type="button"
                onClick={() => setSource("upload")}
                className={`flex-1 rounded-md px-2 py-1.5 transition ${source === "upload" ? "bg-surface text-accent shadow-sm" : "text-muted"}`}
              >
                Uploaded file
              </button>
            </div>
            {source === "template" ? (
              templates.length === 0 ? (
                <p className="text-xs text-muted">
                  No engagement letter templates are published yet -- add one in Settings &gt; Templates, or switch to Uploaded file.
                </p>
              ) : (
                <select
                  required
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="" disabled>
                    Select a form template
                  </option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )
            ) : (
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
            )}
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div>
              <label className="block text-xs font-medium text-muted">
                Who signs this -- one per line, as &quot;Name, email@example.com&quot;
              </label>
              <textarea
                required
                placeholder={"Signers, one per line: Name, email@example.com"}
                value={signersRaw}
                onChange={(e) => setSignersRaw(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="mt-1 text-xs text-muted">
                {clientName
                  ? `Pre-filled with ${clientName}. Add another line to include additional signers (e.g. a spouse).`
                  : "This is who the signing link goes to -- add one signer per line."}
              </p>
            </div>
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
              <li key={r.id} className="rounded-2xl border border-border bg-surface shadow-soft p-4">
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
                          {audience === "staff" && (
                            <button
                              type="button"
                              onClick={() => copySigningLink(s.access_token)}
                              className="flex items-center gap-1 text-accent hover:underline"
                              title="Copy a public signing link -- no account needed"
                            >
                              <LinkIcon size={12} /> Copy link
                            </button>
                          )}
                          <button type="button" onClick={() => setSigningId(s.id)} className="flex items-center gap-1 text-accent hover:underline">
                            <PenLine size={12} /> {audience === "portal" ? "Sign now" : "Mark signed"}
                          </button>
                          <button type="button" onClick={() => decline(s.id)} className="text-danger hover:underline">
                            Decline
                          </button>
                        </span>
                      ) : (
                        <span className={`capitalize ${s.status === "declined" ? "text-danger" : "text-success"}`}>
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
        <div role="dialog" aria-modal="true" aria-label="Capture signature" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 py-8">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-softHover">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-ink">Capture signature</h2>
              <button type="button" onClick={closeSigningModal} aria-label="Close" className="text-muted hover:text-ink">
                <X size={16} />
              </button>
            </div>
            {audience === "portal" ? (
              <div className="mt-3">
                <SignaturePad
                  mode={signatureMode}
                  onModeChange={setSignatureMode}
                  typedName={typedName}
                  onTypedNameChange={setTypedName}
                  onDrawnChange={setDrawnDataUrl}
                  typedLabel="Type your full name to sign this document electronically"
                />
              </div>
            ) : (
              <>
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
              </>
            )}
            {signingError && <p className="mt-2 text-sm text-danger">{signingError}</p>}
            <button
              type="button"
              onClick={submitSignature}
              disabled={submittingSignature || (audience === "portal" && signatureMode === "drawn" ? !drawnDataUrl : !typedName.trim())}
              className="mt-3 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {submittingSignature ? "Signing..." : "Confirm signature"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
