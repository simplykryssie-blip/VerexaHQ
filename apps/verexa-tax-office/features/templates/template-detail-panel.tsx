"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Rocket, Archive, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { templateStatusLabel, TEMPLATE_VISIBILITY_LABELS } from "@/lib/validation/templates";
import { formatDateTime } from "@/lib/formatters";
import type { Tables } from "@/types/database";

type TemplateRow = Tables<"templates">;
type VersionRow = Tables<"template_versions">;

export function TemplateDetailPanel({ template, versions }: { template: TemplateRow; versions: VersionRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState(template.current_version_id ?? versions[0]?.id ?? "");
  const selectedVersion = versions.find((v) => v.id === selectedVersionId) ?? versions[0];

  const content = (selectedVersion?.content as Record<string, unknown>) ?? {};
  const [subject, setSubject] = useState(typeof content.subject === "string" ? content.subject : "");
  const [bodyText, setBodyText] = useState(typeof content.body_text === "string" ? content.body_text : "");
  const [jsonContent, setJsonContent] = useState(JSON.stringify(content, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const canManage = template.is_system_template !== true;
  const isEditableVersion = selectedVersion?.status === "draft";

  async function saveContent() {
    if (!selectedVersion) return;
    let nextContent: Record<string, unknown>;
    if (template.kind === "message") {
      nextContent = { subject, body_text: bodyText };
    } else {
      try {
        nextContent = JSON.parse(jsonContent);
        setJsonError(null);
      } catch {
        setJsonError("That's not valid JSON.");
        return;
      }
    }
    setBusy(true);
    const { error } = await supabase.from("template_versions").update({ content: nextContent as never }).eq("id", selectedVersion.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Version saved");
    router.refresh();
  }

  async function publishVersion() {
    if (!selectedVersion) return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: vError } = await supabase
      .from("template_versions")
      .update({ status: "published", published_at: new Date().toISOString(), published_by: user?.id ?? null })
      .eq("id", selectedVersion.id);
    if (vError) {
      toast.error(friendlyDbError(vError.message));
      setBusy(false);
      return;
    }
    const { error: tError } = await supabase
      .from("templates")
      .update({ status: "published", current_version_id: selectedVersion.id, latest_published_version_id: selectedVersion.id, published_at: new Date().toISOString() })
      .eq("id", template.id);
    setBusy(false);
    if (tError) {
      toast.error(friendlyDbError(tError.message));
      return;
    }
    toast.success("Version published");
    router.refresh();
  }

  async function newDraftVersion() {
    setBusy(true);
    const nextNumber = Math.max(...versions.map((v) => v.version_number), 0) + 1;
    const { data, error } = await supabase
      .from("template_versions")
      .insert({ template_id: template.id, version_number: nextNumber, status: "draft", name: template.name, content: selectedVersion?.content ?? {} })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) {
      toast.error(friendlyDbError(error?.message));
      return;
    }
    await supabase.from("templates").update({ current_version_id: data.id }).eq("id", template.id);
    toast.success("New draft version created");
    router.refresh();
  }

  async function archiveTemplate() {
    if (!confirm("Archive this template? It will no longer be assignable.")) return;
    setBusy(true);
    const { error } = await supabase.from("templates").update({ status: "archived", archived_at: new Date().toISOString() }).eq("id", template.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Template archived");
    router.refresh();
  }

  async function updateVisibility(v: string) {
    setBusy(true);
    const { error } = await supabase.from("templates").update({ visibility: v as never }).eq("id", template.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">{template.name}</CardTitle>
            {template.description && <CardDescription>{template.description}</CardDescription>}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={template.status === "published" ? "success" : template.status === "archived" ? "destructive" : "secondary"}>
              {templateStatusLabel(template.status)}
            </Badge>
            {template.is_system_template && <Badge variant="outline">System</Badge>}
            {canManage && template.status !== "archived" && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={archiveTemplate}>
                <Archive className="h-4 w-4" /> Archive
              </Button>
            )}
          </div>
        </CardHeader>
        {canManage && (
          <CardContent>
            <div className="space-y-1 max-w-[240px]">
              <Label className="text-xs">Visibility</Label>
              <Select value={template.visibility} onValueChange={updateVisibility} disabled={busy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TEMPLATE_VISIBILITY_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Versions</CardTitle>
          {canManage && (
            <Button size="sm" variant="outline" disabled={busy} onClick={newDraftVersion}>
              <Plus className="h-4 w-4" /> New draft version
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelectedVersionId(v.id)}
              className={`w-full text-left rounded-md border p-2.5 text-sm ${v.id === selectedVersionId ? "border-brand bg-brand/5" : "border-border"}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">Version {v.version_number}</span>
                <Badge variant={v.status === "published" ? "success" : "secondary"}>{templateStatusLabel(v.status)}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{formatDateTime(v.created_at)}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      {selectedVersion && canManage && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Content — Version {selectedVersion.version_number}</CardTitle>
            {isEditableVersion && (
              <Button size="sm" variant="brand" disabled={busy} onClick={publishVersion}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <Rocket className="h-4 w-4" /> Publish
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {!isEditableVersion && <p className="text-xs text-muted-foreground">Published versions are read-only — create a new draft version to edit.</p>}
            {template.kind === "message" ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Subject</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!isEditableVersion} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Body</Label>
                  <Textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={8} disabled={!isEditableVersion} />
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs">Content (JSON)</Label>
                <Textarea value={jsonContent} onChange={(e) => setJsonContent(e.target.value)} rows={12} disabled={!isEditableVersion} className="font-mono text-xs" />
                {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
              </div>
            )}
            {isEditableVersion && (
              <Button size="sm" variant="outline" disabled={busy} onClick={saveContent}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Save content
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
