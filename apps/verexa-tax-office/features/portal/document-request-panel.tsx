"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_SIZE_BYTES } from "@/lib/validation/documents";
import { requestStatusLabel, requestItemStatusLabel } from "@/lib/validation/document-requests";
import { formatDate } from "@/lib/formatters";

// Narrow, client-safe shapes — document_requests.internal_notes and
// document_request_items.waiver_reason/metadata are staff-only and must
// never be passed into this "use client" component (every field on a prop
// serializes into the page's RSC payload whether or not it's rendered).
type RequestRow = { id: string; title: string; status: string; due_date: string | null; client_message: string | null };
type ItemRow = {
  id: string;
  status: string;
  document_label: string;
  custom_label: string | null;
  description: string | null;
  category_id: string | null;
  tax_year: number | null;
  category?: { name?: string } | null;
};
type DocRow = { id: string; request_item_id: string | null; display_name: string; status: string };

export function PortalDocumentRequestPanel({
  workspaceId,
  clientId,
  request,
  items,
  documents,
}: {
  workspaceId: string;
  clientId: string;
  request: RequestRow;
  items: ItemRow[];
  documents: DocRow[];
}) {
  const router = useRouter();

  const completedCount = items.filter((i) => i.status === "accepted" || i.status === "waived" || i.status === "not_applicable").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">{request.title}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{request.due_date ? `Due ${formatDate(request.due_date)}` : "No due date"}</p>
          </div>
          <Badge variant="secondary">{requestStatusLabel(request.status)}</Badge>
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
          <ItemCard
            key={item.id}
            workspaceId={workspaceId}
            clientId={clientId}
            item={item}
            documents={documents.filter((d) => d.request_item_id === item.id)}
            onUploaded={() => router.refresh()}
          />
        ))}
      </div>
    </div>
  );
}

function ItemCard({
  workspaceId,
  clientId,
  item,
  documents,
  onUploaded,
}: {
  workspaceId: string;
  clientId: string;
  item: ItemRow;
  documents: DocRow[];
  onUploaded: () => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = item.status === "accepted" || item.status === "waived" || item.status === "not_applicable";

  async function upload() {
    if (!file) return;
    if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.type)) {
      setError("That file type isn't accepted.");
      return;
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      setError("That file is larger than the 50 MB limit.");
      return;
    }
    setUploading(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const ext = file.name.includes(".") ? file.name.split(".").pop() : undefined;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${workspaceId}/${clientId}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage.from("tax-client-documents").upload(path, file, { contentType: file.type });
    if (uploadError) {
      setError(friendlyDbError(uploadError.message));
      setUploading(false);
      return;
    }

    const { data: doc, error: insertError } = await supabase
      .from("documents")
      .insert({
        workspace_id: workspaceId,
        client_id: clientId,
        category_id: item.category_id,
        request_item_id: item.id,
        bucket_id: "tax-client-documents",
        storage_path: path,
        original_filename: file.name,
        display_name: item.custom_label || item.document_label || file.name,
        file_extension: ext ?? null,
        mime_type: file.type,
        file_size_bytes: file.size,
        status: "uploaded",
        visibility: "client_and_staff",
        source: "client_upload",
        uploaded_by_user_id: user?.id ?? null,
        tax_year: item.tax_year,
      })
      .select("id")
      .single();

    if (insertError || !doc) {
      setError(friendlyDbError(insertError?.message));
      setUploading(false);
      return;
    }

    await supabase.from("document_access_logs").insert({ workspace_id: workspaceId, document_id: doc.id, actor_user_id: user?.id ?? null, action: "upload" });

    setUploading(false);
    toast.success("File uploaded");
    setOpen(false);
    setFile(null);
    onUploaded();
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
              item.status === "accepted" ? "success" : item.status === "rejected" ? "destructive" : item.status === "uploaded" || item.status === "under_review" ? "warning" : "secondary"
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

        {!done && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Upload className="h-3.5 w-3.5" /> Upload file
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload: {item.custom_label || item.document_label}</DialogTitle>
              </DialogHeader>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <DialogFooter>
                <Button variant="brand" disabled={!file || uploading} onClick={upload}>
                  {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Upload
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}
