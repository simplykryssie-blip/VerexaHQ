"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Ban, Link as LinkIcon, Copy, FileCheck, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { signatureRequestStatusLabel, signerStatusLabel } from "@/lib/validation/signatures";
import { formatDateTime } from "@/lib/formatters";
import type { Tables } from "@/types/database";

type RequestRow = Tables<"signature_requests">;
type SignerRow = Tables<"signature_signers">;
type EventRow = Tables<"signature_events">;
type CertificateRow = Tables<"signature_certificates">;

export function SignatureRequestPanel({
  request,
  signers,
  events,
  certificate,
}: {
  request: RequestRow;
  signers: SignerRow[];
  events: EventRow[];
  certificate: CertificateRow | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [linkDialog, setLinkDialog] = useState<{ name: string; link: string } | null>(null);

  async function sendRequest() {
    setBusy(true);
    const { error } = await supabase.from("signature_requests").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", request.id);
    if (error) {
      toast.error(friendlyDbError(error.message));
      setBusy(false);
      return;
    }
    for (const s of signers) {
      await issueLink(s, false);
    }
    setBusy(false);
    toast.success("Request sent");
    router.refresh();
  }

  async function cancelRequest() {
    if (!confirm("Cancel this signature request? Signers will no longer be able to sign.")) return;
    setBusy(true);
    const { error } = await supabase.from("signature_requests").update({ status: "cancelled" }).eq("id", request.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Request cancelled");
    router.refresh();
  }

  async function issueLink(signer: SignerRow, showDialog = true) {
    const { data, error } = await supabase.rpc("issue_signature_token", { p_signer_id: signer.id, p_expires_in_hours: 336 });
    if (error || !data) {
      toast.error(friendlyDbError(error?.message));
      return;
    }
    const link = `${window.location.origin}/portal/sign/${data}`;
    if (showDialog) setLinkDialog({ name: signer.name, link });
    return link;
  }

  async function createCertificate() {
    setBusy(true);
    const { data, error } = await supabase.rpc("create_signature_certificate", {
      p_signature_request_id: request.id,
      p_document_sha256: undefined,
      p_signed_document_id: undefined,
      p_certificate_document_id: undefined,
    });
    setBusy(false);
    if (error || !data) {
      toast.error(friendlyDbError(error?.message));
      return;
    }
    toast.success("Certificate generated");
    router.refresh();
  }

  const signedCount = signers.filter((s) => s.status === "signed").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">{request.title}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {signedCount} of {signers.length} signed
              {request.signing_order_required && " · Signing order required"}
              {request.expires_at && ` · Expires ${formatDateTime(request.expires_at)}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={request.status === "completed" ? "success" : request.status === "declined" || request.status === "expired" || request.status === "cancelled" ? "destructive" : "secondary"}>
              {signatureRequestStatusLabel(request.status)}
            </Badge>
            {request.status === "draft" && (
              <Button size="sm" variant="brand" disabled={busy} onClick={sendRequest}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <Send className="h-4 w-4" /> Send
              </Button>
            )}
            {!["completed", "cancelled", "declined", "expired"].includes(request.status) && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={cancelRequest}>
                <Ban className="h-4 w-4" /> Cancel
              </Button>
            )}
          </div>
        </CardHeader>
        {request.message && (
          <CardContent>
            <p className="text-sm">&ldquo;{request.message}&rdquo;</p>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signer progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {signers.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5 flex-wrap">
              <div>
                <p className="text-sm font-medium">
                  {s.signing_order}. {s.name} {s.role && <span className="text-xs text-muted-foreground">({s.role})</span>}
                </p>
                <p className="text-xs text-muted-foreground">{s.email}</p>
                {s.signed_at && <p className="text-xs text-success">Signed {formatDateTime(s.signed_at)}</p>}
                {s.declined_at && <p className="text-xs text-destructive">Declined: {s.decline_reason}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={s.status === "signed" ? "success" : s.status === "declined" || s.status === "expired" ? "destructive" : "secondary"}>{signerStatusLabel(s.status)}</Badge>
                {s.status !== "signed" && request.status !== "cancelled" && request.status !== "draft" && (
                  <Button size="sm" variant="outline" onClick={() => issueLink(s)}>
                    <LinkIcon className="h-3.5 w-3.5" /> Resend
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events recorded yet.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between rounded bg-secondary px-2 py-1.5">
                  <span>{e.event_type.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">{formatDateTime(e.event_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {request.status === "completed" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="h-4 w-4" /> Certificate of completion
            </CardTitle>
            {!certificate && (
              <Button size="sm" variant="outline" disabled={busy} onClick={createCertificate}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Generate certificate
              </Button>
            )}
          </CardHeader>
          {certificate && (
            <CardContent className="text-sm space-y-1">
              <p>Certificate #{certificate.certificate_number}</p>
              <p className="text-xs text-muted-foreground">Completed {formatDateTime(certificate.completed_at)}</p>
              {certificate.certificate_document_id && (
                <Button size="sm" variant="outline" className="mt-2" asChild>
                  <a href={`/documents?client=${request.client_id}`}>
                    <Download className="h-3.5 w-3.5" /> View in Documents
                  </a>
                </Button>
              )}
            </CardContent>
          )}
        </Card>
      )}

      <Dialog open={!!linkDialog} onOpenChange={(open) => !open && setLinkDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signing link for {linkDialog?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Email/SMS delivery isn&apos;t connected yet, so share this link with the signer directly.
          </p>
          <div className="flex items-center gap-2">
            <input readOnly value={linkDialog?.link ?? ""} className="flex-1 rounded-md border border-border bg-muted px-2 py-1.5 text-xs" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (linkDialog) navigator.clipboard.writeText(linkDialog.link);
                toast.success("Link copied");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <DialogFooter />
        </DialogContent>
      </Dialog>
    </div>
  );
}
