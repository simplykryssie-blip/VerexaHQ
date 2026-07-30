"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, CheckCircle2, XCircle, RefreshCw, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { requestStatusLabel, requestItemStatusLabel } from "@/lib/validation/document-requests";
import { formatDate } from "@/lib/formatters";
import type { Tables } from "@/types/database";

type RequestRow = Tables<"document_requests">;
type ItemRow = Tables<"document_request_items"> & { category?: { name?: string } | null };
type DocRow = { id: string; request_item_id: string | null; display_name: string; status: string };

export function DocumentRequestPanel({ request, items, documents }: { request: RequestRow; items: ItemRow[]; documents: DocRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  async function sendRequest() {
    setBusy(true);
    const { error } = await supabase.from("document_requests").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", request.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Request sent to client");
    router.refresh();
  }

  async function cancelRequest() {
    if (!confirm("Cancel this document request?")) return;
    setBusy(true);
    const { error } = await supabase.from("document_requests").update({ status: "cancelled" }).eq("id", request.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Request cancelled");
    router.refresh();
  }

  const completedCount = items.filter((i) => i.status === "accepted" || i.status === "waived" || i.status === "not_applicable").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">{request.title}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Due {formatDate(request.due_date)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{requestStatusLabel(request.status)}</Badge>
            {request.status === "draft" && (
              <Button size="sm" variant="brand" disabled={busy} onClick={sendRequest}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <Send className="h-4 w-4" /> Send
              </Button>
            )}
            {request.status !== "cancelled" && request.status !== "completed" && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={cancelRequest}>
                <Ban className="h-4 w-4" /> Cancel
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-brand-gradient" style={{ width: `${items.length ? Math.round((completedCount / items.length) * 100) : 0}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {completedCount} of {items.length} items complete
          </p>
          {request.client_message && <p className="text-sm mt-3">&ldquo;{request.client_message}&rdquo;</p>}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {items.map((item) => (
          <ItemRowCard key={item.id} item={item} documents={documents.filter((d) => d.request_item_id === item.id)} onChanged={() => router.refresh()} />
        ))}
      </div>
    </div>
  );
}

function ItemRowCard({ item, documents, onChanged }: { item: ItemRow; documents: DocRow[]; onChanged: () => void }) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [waiveReason, setWaiveReason] = useState("");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceReason, setReplaceReason] = useState("");

  async function setStatus(status: string, patch?: Record<string, unknown>) {
    setBusy(true);
    const { error } = await supabase
      .from("document_request_items")
      .update({ status, completed_at: ["accepted", "waived", "not_applicable"].includes(status) ? new Date().toISOString() : null, ...patch } as never)
      .eq("id", item.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success(`Item marked ${requestItemStatusLabel(status)}`);
    onChanged();
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-sm font-medium">{item.custom_label || item.document_label}</p>
            {item.category?.name && <p className="text-xs text-muted-foreground">{item.category.name}</p>}
            {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
          </div>
          <Badge
            variant={
              item.status === "accepted"
                ? "success"
                : item.status === "rejected"
                  ? "destructive"
                  : item.status === "uploaded" || item.status === "under_review"
                    ? "warning"
                    : "secondary"
            }
          >
            {requestItemStatusLabel(item.status)}
          </Badge>
        </div>

        {documents.length > 0 && (
          <ul className="text-xs text-muted-foreground list-disc pl-4">
            {documents.map((d) => (
              <li key={d.id}>{d.display_name}</li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-1 flex-wrap pt-1">
          {(item.status === "uploaded" || item.status === "under_review") && (
            <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStatus("accepted")}>
                <CheckCircle2 className="h-4 w-4 text-success" /> Accept
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStatus("rejected")}>
                <XCircle className="h-4 w-4 text-destructive" /> Reject
              </Button>
              <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="ghost">
                    <RefreshCw className="h-4 w-4" /> Request replacement
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Request a replacement file</DialogTitle>
                  </DialogHeader>
                  <Textarea value={replaceReason} onChange={(e) => setReplaceReason(e.target.value)} rows={3} placeholder="What's wrong with the current file?" />
                  <DialogFooter>
                    <Button
                      variant="brand"
                      onClick={() => {
                        setStatus("requested", { description: replaceReason ? `${item.description ?? ""}\n\nReplacement requested: ${replaceReason}`.trim() : item.description });
                        setReplaceOpen(false);
                      }}
                    >
                      Request replacement
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
          {item.status !== "waived" && item.status !== "accepted" && (
            <Dialog open={waiveOpen} onOpenChange={setWaiveOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost">
                  Waive
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Waive this item</DialogTitle>
                </DialogHeader>
                <Textarea value={waiveReason} onChange={(e) => setWaiveReason(e.target.value)} rows={3} placeholder="Why isn't this needed?" />
                <DialogFooter>
                  <Button
                    variant="brand"
                    disabled={!waiveReason.trim()}
                    onClick={() => {
                      setStatus("waived", { waiver_reason: waiveReason });
                      setWaiveOpen(false);
                    }}
                  >
                    Waive item
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
