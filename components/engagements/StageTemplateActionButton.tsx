"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FileText, PenLine } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { sendOrganizerToEngagement } from "@/lib/organizer/sendOrganizerToEngagement";
import { createSignatureRequestFromTemplate } from "@/lib/documents/createSignatureRequestFromTemplate";

type Kind = "organizer" | "documentRequest" | "engagementLetter";

const LABELS: Record<Kind, string> = {
  organizer: "Send Organizer",
  documentRequest: "Request Documents",
  engagementLetter: "Send for Signature",
};

const ICONS: Record<Kind, typeof BookOpen> = {
  organizer: BookOpen,
  documentRequest: FileText,
  engagementLetter: PenLine,
};

export function StageTemplateActionButton({
  kind,
  template,
  sentStatus,
  engagementId,
  clientId,
  workspaceId,
  primaryEmail,
  firmName,
  clientName,
}: {
  kind: Kind;
  template: { id: string; name: string; body_html?: string };
  sentStatus: string | null;
  engagementId: string;
  clientId: string;
  workspaceId: string;
  primaryEmail: string | null;
  firmName?: string;
  clientName?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [signerModalOpen, setSignerModalOpen] = useState(false);
  const [signerName, setSignerName] = useState(clientName ?? "");
  const [signerEmail, setSignerEmail] = useState(primaryEmail ?? "");

  if (sentStatus) {
    return (
      <span className="inline-flex items-center rounded-full bg-surfaceMuted px-2 py-0.5 text-xs capitalize text-muted">
        {template.name}: {sentStatus.replace(/_/g, " ")}
      </span>
    );
  }

  const Icon = ICONS[kind];

  async function handleClick() {
    if (kind === "engagementLetter") {
      setSignerModalOpen(true);
      return;
    }
    setBusy(true);
    if (kind === "organizer") {
      const error = await sendOrganizerToEngagement({
        supabase,
        workspaceId,
        clientId,
        engagementId,
        template,
        primaryEmail,
        appUrl: process.env.NEXT_PUBLIC_APP_URL || window.location.origin,
      });
      setBusy(false);
      if (error) {
        toast.show(error, "error");
        return;
      }
    } else {
      const { error } = await supabase.rpc("create_document_request", {
        p_workspace_id: workspaceId,
        p_entity_type: "engagement",
        p_entity_id: engagementId,
        p_template_id: template.id,
        p_title: template.name,
      });
      setBusy(false);
      if (error) {
        toast.show(error.message, "error");
        return;
      }
    }
    toast.show(`${LABELS[kind]} sent`, "success");
    router.refresh();
  }

  async function confirmSendForSignature() {
    if (!signerName.trim() || !signerEmail.trim()) return;
    setBusy(true);
    const result = await createSignatureRequestFromTemplate({
      supabase,
      workspaceId,
      entityType: "engagement",
      entityId: engagementId,
      template: { id: template.id, name: template.name, body_html: template.body_html ?? "" },
      clientName: signerName,
      firmName,
      signers: [{ signer_name: signerName.trim(), signer_email: signerEmail.trim() }],
      title: template.name,
    });
    setBusy(false);
    if ("error" in result) {
      toast.show(result.error, "error");
      return;
    }
    setSignerModalOpen(false);
    toast.show("Sent for signature", "success");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-slate transition hover:border-accent hover:text-accent disabled:opacity-60"
      >
        <Icon size={12} /> {LABELS[kind]}: {template.name}
      </button>

      {signerModalOpen && (
        <Modal title="Send for signature" onClose={() => setSignerModalOpen(false)}>
          <div className="space-y-2">
            <input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Signer name"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <input
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              placeholder="Signer email"
              type="email"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setSignerModalOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSendForSignature}
                disabled={busy || !signerName.trim() || !signerEmail.trim()}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {busy ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
