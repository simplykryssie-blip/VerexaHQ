"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Archive, ArchiveRestore, Trash2, CheckCircle2, XCircle, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { documentStatusLabel, documentVisibilityLabel } from "@/lib/validation/documents";
import { formatDate } from "@/lib/formatters";
import type { Tables } from "@/types/database";

type DocumentRow = Tables<"documents"> & {
  client?: { first_name?: string | null; last_name?: string | null; company?: string | null } | null;
  engagement?: { engagement_number?: string | null; title?: string | null } | null;
  category?: { name?: string | null } | null;
};

export function DocumentsTable({ documents, showClient = true }: { documents: DocumentRow[]; showClient?: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function download(doc: DocumentRow) {
    setBusyId(doc.id);
    const { data, error } = await supabase.storage.from(doc.bucket_id).createSignedUrl(doc.storage_path, 300);
    setBusyId(null);
    if (error || !data) {
      toast.error(friendlyDbError(error?.message));
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("document_access_logs").insert({ workspace_id: doc.workspace_id, document_id: doc.id, actor_user_id: user?.id ?? null, action: "download" });
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function setStatus(doc: DocumentRow, status: string, notes?: string) {
    setBusyId(doc.id);
    const patch: Record<string, unknown> = { status };
    if (notes) patch.notes = notes;
    const { error } = await supabase.from("documents").update(patch as never).eq("id", doc.id);
    setBusyId(null);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("document_access_logs").insert({ workspace_id: doc.workspace_id, document_id: doc.id, actor_user_id: user?.id ?? null, action: "review" });
    toast.success(`Document marked ${documentStatusLabel(status)}`);
    router.refresh();
  }

  async function archive(doc: DocumentRow) {
    setBusyId(doc.id);
    const { error } = await supabase.from("documents").update({ archived_at: new Date().toISOString(), status: "archived" }).eq("id", doc.id);
    setBusyId(null);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Document archived");
    router.refresh();
  }

  async function restore(doc: DocumentRow) {
    setBusyId(doc.id);
    const { error } = await supabase.from("documents").update({ archived_at: null, deleted_at: null, status: "available" }).eq("id", doc.id);
    setBusyId(null);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Document restored");
    router.refresh();
  }

  async function softDelete(doc: DocumentRow) {
    if (!confirm(`Delete "${doc.display_name}"? It can be restored later from the archive filter.`)) return;
    setBusyId(doc.id);
    const { error } = await supabase.from("documents").update({ deleted_at: new Date().toISOString(), status: "deleted" }).eq("id", doc.id);
    setBusyId(null);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Document deleted");
    router.refresh();
  }

  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No documents here yet.</p>;
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            {showClient && <TableHead>Client</TableHead>}
            <TableHead>Category</TableHead>
            <TableHead>Visibility</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => (
            <TableRow key={doc.id}>
              <TableCell>
                <div className="font-medium">{doc.display_name}</div>
                <div className="text-xs text-muted-foreground">
                  v{doc.version_number} · {doc.tax_year ?? "—"}
                </div>
              </TableCell>
              {showClient && <TableCell>{doc.client?.company || `${doc.client?.first_name ?? ""} ${doc.client?.last_name ?? ""}`.trim() || "—"}</TableCell>}
              <TableCell>{doc.category?.name ?? "—"}</TableCell>
              <TableCell className="text-xs">{documentVisibilityLabel(doc.visibility)}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    doc.status === "approved"
                      ? "success"
                      : doc.status === "rejected" || doc.status === "deleted"
                        ? "destructive"
                        : doc.status === "needs_review"
                          ? "warning"
                          : "secondary"
                  }
                >
                  {documentStatusLabel(doc.status)}
                </Badge>
              </TableCell>
              <TableCell className="text-xs">{formatDate(doc.uploaded_at)}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1 flex-wrap">
                  <Button size="sm" variant="ghost" disabled={busyId === doc.id} onClick={() => download(doc)} title="Download">
                    {busyId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  </Button>
                  {doc.status === "needs_review" || doc.status === "uploaded" ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setStatus(doc, "approved")} title="Approve">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      </Button>
                      <RejectDialog onConfirm={(notes) => setStatus(doc, "rejected", notes)} />
                      <ReplacementDialog onConfirm={(notes) => setStatus(doc, "needs_review", notes)} />
                    </>
                  ) : null}
                  {!doc.archived_at && !doc.deleted_at && (
                    <Button size="sm" variant="ghost" onClick={() => archive(doc)} title="Archive">
                      <Archive className="h-4 w-4" />
                    </Button>
                  )}
                  {(doc.archived_at || doc.deleted_at) && (
                    <Button size="sm" variant="ghost" onClick={() => restore(doc)} title="Restore">
                      <ArchiveRestore className="h-4 w-4" />
                    </Button>
                  )}
                  {!doc.deleted_at && (
                    <Button size="sm" variant="ghost" onClick={() => softDelete(doc)} title="Delete">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                  <ReplaceVersionDialog doc={doc} onDone={() => router.refresh()} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RejectDialog({ onConfirm }: { onConfirm: (notes: string) => void }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Reject">
          <XCircle className="h-4 w-4 text-destructive" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject document</DialogTitle>
        </DialogHeader>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Why is this being rejected?" />
        <DialogFooter>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm(notes);
              setOpen(false);
              setNotes("");
            }}
          >
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReplacementDialog({ onConfirm }: { onConfirm: (notes: string) => void }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Request replacement">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a replacement file</DialogTitle>
        </DialogHeader>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What's wrong with this file?" />
        <DialogFooter>
          <Button
            variant="brand"
            onClick={() => {
              onConfirm(notes);
              setOpen(false);
              setNotes("");
            }}
          >
            Request replacement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReplaceVersionDialog({ doc, onDone }: { doc: DocumentRow; onDone: () => void }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function replace() {
    if (!file) return;
    setBusy(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${doc.workspace_id}/${doc.client_id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from(doc.bucket_id).upload(path, file, { contentType: file.type });
    if (uploadError) {
      toast.error(friendlyDbError(uploadError.message));
      setBusy(false);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from("documents").insert({
      workspace_id: doc.workspace_id,
      client_id: doc.client_id,
      engagement_id: doc.engagement_id,
      household_member_id: doc.household_member_id,
      category_id: doc.category_id,
      request_item_id: doc.request_item_id,
      bucket_id: doc.bucket_id,
      storage_path: path,
      original_filename: file.name,
      display_name: doc.display_name,
      file_extension: file.name.includes(".") ? file.name.split(".").pop() : null,
      mime_type: file.type,
      file_size_bytes: file.size,
      status: "uploaded",
      visibility: doc.visibility,
      source: "staff_upload",
      uploaded_by_user_id: user?.id ?? null,
      version_number: doc.version_number + 1,
      replaces_document_id: doc.id,
      tax_year: doc.tax_year,
    });
    if (insertError) {
      toast.error(friendlyDbError(insertError.message));
      setBusy(false);
      return;
    }
    await supabase.from("documents").update({ is_latest_version: false, status: "replaced" }).eq("id", doc.id);
    setBusy(false);
    toast.success("New version uploaded");
    setOpen(false);
    setFile(null);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Upload new version">
          <RefreshCw className="h-4 w-4 text-brand" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a new version of &ldquo;{doc.display_name}&rdquo;</DialogTitle>
        </DialogHeader>
        <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <DialogFooter>
          <Button variant="brand" disabled={!file || busy} onClick={replace}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Replace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
