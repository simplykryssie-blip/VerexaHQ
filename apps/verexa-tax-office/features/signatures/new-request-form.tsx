"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SearchablePicker, type PickerOption } from "@/features/engagements/client-picker";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import type { SignerInput } from "@/lib/validation/signatures";

type DocOption = { id: string; display_name: string; clientId: string };

const BLANK_SIGNER: SignerInput = { name: "", email: "", role: null, clientContactId: null };

export function NewSignatureRequestForm({
  workspaceId,
  clients,
  engagements,
  documents,
}: {
  workspaceId: string;
  clients: PickerOption[];
  engagements: (PickerOption & { clientId: string })[];
  documents: DocOption[];
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);
  const [engagementId, setEngagementId] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [signingOrderRequired, setSigningOrderRequired] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [signers, setSigners] = useState<SignerInput[]>([{ ...BLANK_SIGNER }]);
  const [sendNow, setSendNow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const clientDocuments = documents.filter((d) => !clientId || d.clientId === clientId);
  const engagementOptions = engagements.filter((e) => !clientId || e.clientId === clientId);

  function updateSigner(index: number, patch: Partial<SignerInput>) {
    setSigners((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !title.trim()) {
      setError("Choose a client and enter a title.");
      return;
    }
    if (signers.some((s) => !s.name.trim() || !s.email.trim())) {
      setError("Every signer needs a name and email.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: request, error: reqError } = await supabase
      .from("signature_requests")
      .insert({
        workspace_id: workspaceId,
        client_id: clientId,
        engagement_id: engagementId,
        document_id: documentId,
        title: title.trim(),
        message: message || null,
        signing_order_required: signingOrderRequired,
        expires_at: new Date(Date.now() + expiresInDays * 86_400_000).toISOString(),
        status: sendNow ? "sent" : "draft",
        sent_at: sendNow ? new Date().toISOString() : null,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    if (reqError || !request) {
      setError(friendlyDbError(reqError?.message));
      setSubmitting(false);
      return;
    }

    const { data: insertedSigners, error: signersError } = await supabase
      .from("signature_signers")
      .insert(
        signers.map((s, idx) => ({
          workspace_id: workspaceId,
          signature_request_id: request.id,
          name: s.name,
          email: s.email,
          role: s.role || null,
          client_contact_id: s.clientContactId,
          signing_order: idx + 1,
          status: sendNow ? "sent" : "pending",
        })),
      )
      .select("id");

    if (signersError) {
      setError(friendlyDbError(signersError.message));
      setSubmitting(false);
      return;
    }

    if (sendNow && insertedSigners) {
      for (const s of insertedSigners) {
        await supabase.rpc("issue_signature_token", { p_signer_id: s.id, p_expires_in_hours: expiresInDays * 24 });
      }
    }

    setSubmitting(false);
    toast.success(sendNow ? "Signature request sent" : "Signature request saved as draft");
    router.push(`/signatures/${request.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Client *</Label>
              <SearchablePicker options={clients} value={clientId} onChange={(v) => { setClientId(v); setEngagementId(null); setDocumentId(null); }} placeholder="Search clients…" />
            </div>
            <div className="space-y-1">
              <Label>Engagement</Label>
              <SearchablePicker options={engagementOptions} value={engagementId} onChange={setEngagementId} placeholder="Optional…" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Document to sign</Label>
            <Select value={documentId ?? "none"} onValueChange={(v) => setDocumentId(v === "none" ? null : v)}>
              <SelectTrigger>
                <SelectValue placeholder="No document attached" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No document attached</SelectItem>
                {clientDocuments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="2025 Engagement Letter" />
          </div>
          <div className="space-y-1">
            <Label>Message to signers</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Expires in (days)</Label>
              <Input type="number" min={1} max={90} value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value) || 14)} />
            </div>
            <label className="flex items-center gap-2 text-sm mt-6">
              <Checkbox checked={signingOrderRequired} onCheckedChange={(v) => setSigningOrderRequired(v === true)} />
              Require signing order
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Signers {signingOrderRequired && "(in order)"}</CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={() => setSigners((prev) => [...prev, { ...BLANK_SIGNER }])}>
            <Plus className="h-4 w-4" /> Add signer
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {signers.map((s, idx) => (
            <div key={idx} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {signingOrderRequired ? `Signer ${idx + 1}` : "Signer"}
                </span>
                {signers.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setSigners((prev) => prev.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={s.name} onChange={(e) => updateSigner(idx, { name: e.target.value })} placeholder="Full name" />
                <Input type="email" value={s.email} onChange={(e) => updateSigner(idx, { email: e.target.value })} placeholder="Email" />
              </div>
              <Input value={s.role ?? ""} onChange={(e) => updateSigner(idx, { role: e.target.value })} placeholder="Role (e.g. Taxpayer, Spouse) — optional" />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={sendNow} onCheckedChange={(v) => setSendNow(v === true)} />
          Send immediately (generates signing links)
        </label>
        <Button type="submit" variant="brand" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {sendNow ? "Create & send" : "Save as draft"}
        </Button>
      </div>
    </form>
  );
}
