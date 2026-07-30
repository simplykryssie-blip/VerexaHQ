"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";

type BrandSettings = { logo_path?: string; primary_color?: string };

export function BrandingForm({ workspaceId, settings }: { workspaceId: string; settings: Record<string, unknown> }) {
  const router = useRouter();
  const supabase = createClient();
  const brand = (settings.brand as BrandSettings) ?? {};
  const [primaryColor, setPrimaryColor] = useState(brand.primary_color ?? "#0d9488");
  const [logoPath, setLogoPath] = useState(brand.logo_path ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function uploadLogo(file: File) {
    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${workspaceId}/logo-${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("workspace-brand-assets").upload(path, file, { contentType: file.type, upsert: true });
    setUploading(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    setLogoPath(path);
    const { data } = await supabase.storage.from("workspace-brand-assets").createSignedUrl(path, 3600);
    if (data) setLogoUrl(data.signedUrl);
    toast.success("Logo uploaded — save to apply");
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("workspaces")
      .update({ settings: { ...settings, brand: { logo_path: logoPath, primary_color: primaryColor } } })
      .eq("id", workspaceId);
    setSaving(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Branding saved");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Logo &amp; color</CardTitle>
        <CardDescription>Stored privately — signed URLs are generated wherever the logo is shown.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Logo</Label>
          {(logoUrl || logoPath) && <p className="text-xs text-muted-foreground mb-1">{logoPath}</p>}
          <div className="flex items-center gap-2">
            <Input type="file" accept="image/*" disabled={uploading} onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
        </div>
        <div className="space-y-1 max-w-[200px]">
          <Label>Primary color</Label>
          <div className="flex items-center gap-2">
            <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-9 w-12 rounded border border-border" />
            <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
          </div>
        </div>
        <Button variant="brand" size="sm" disabled={saving} onClick={save}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Save branding
        </Button>
      </CardContent>
    </Card>
  );
}
