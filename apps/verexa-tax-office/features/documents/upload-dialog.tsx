"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_SIZE_BYTES, DOCUMENT_VISIBILITY_LABELS } from "@/lib/validation/documents";

export function UploadDocumentDialog({
  workspaceId,
  clientId,
  engagementId,
  categories,
}: {
  workspaceId: string;
  clientId: string;
  engagementId?: string | null;
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [categoryId, setCategoryId] = useState<string>("none");
  const [customLabel, setCustomLabel] = useState("");
  const [taxYear, setTaxYear] = useState("");
  const [visibility, setVisibility] = useState<keyof typeof DOCUMENT_VISIBILITY_LABELS>("client_and_staff");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!files || files.length === 0) {
      setError("Choose at least one file.");
      return;
    }
    for (const file of Array.from(files)) {
      if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.type)) {
        setError(`"${file.name}" isn't an accepted file type.`);
        return;
      }
      if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
        setError(`"${file.name}" is larger than the 50 MB limit.`);
        return;
      }
    }

    setUploading(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    for (const file of Array.from(files)) {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : undefined;
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${workspaceId}/${clientId}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage.from("tax-client-documents").upload(path, file, { contentType: file.type });
      if (uploadError) {
        setError(friendlyDbError(uploadError.message));
        setUploading(false);
        return;
      }

      // Generate the id client-side and skip .select() on the insert:
      // documents' SELECT policy resolves only through a self-referential
      // can_access_document(id) function, which can't see a row inserted by
      // the same statement, so INSERT ... RETURNING reliably fails RLS even
      // for an authorized staff caller. Knowing the id up front sidesteps it.
      const documentId = crypto.randomUUID();
      const { error: insertError } = await supabase.from("documents").insert({
        id: documentId,
        workspace_id: workspaceId,
        client_id: clientId,
        engagement_id: engagementId ?? null,
        category_id: categoryId === "none" ? null : categoryId,
        bucket_id: "tax-client-documents",
        storage_path: path,
        original_filename: file.name,
        display_name: customLabel || file.name,
        file_extension: ext ?? null,
        mime_type: file.type,
        file_size_bytes: file.size,
        status: "uploaded",
        visibility,
        source: "staff_upload",
        uploaded_by_user_id: user?.id ?? null,
        tax_year: taxYear ? Number(taxYear) : null,
        notes: notes || null,
      });

      if (insertError) {
        setError(friendlyDbError(insertError.message));
        setUploading(false);
        return;
      }

      await supabase.from("document_access_logs").insert({
        workspace_id: workspaceId,
        document_id: documentId,
        actor_user_id: user?.id ?? null,
        action: "upload",
      });
    }

    setUploading(false);
    toast.success(files.length > 1 ? "Files uploaded" : "File uploaded");
    setOpen(false);
    setFiles(null);
    setCustomLabel("");
    setNotes("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="brand" size="sm">
          <Upload className="h-4 w-4" /> Upload document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload documents</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleUpload} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1">
            <Label>Files *</Label>
            <Input type="file" multiple onChange={(e) => setFiles(e.target.files)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tax year</Label>
              <Input type="number" value={taxYear} onChange={(e) => setTaxYear(e.target.value)} placeholder="2025" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Custom label (optional)</Label>
            <Input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Overrides the file name shown to staff/client" />
          </div>
          <div className="space-y-1">
            <Label>Visibility</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_VISIBILITY_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" variant="brand" disabled={uploading}>
              {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
