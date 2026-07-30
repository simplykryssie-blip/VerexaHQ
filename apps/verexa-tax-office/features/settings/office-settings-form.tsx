"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import type { Tables } from "@/types/database";

export function OfficeSettingsForm({ workspace }: { workspace: Tables<"workspaces"> }) {
  const router = useRouter();
  const [name, setName] = useState(workspace.name);
  const [legalName, setLegalName] = useState(workspace.legal_name ?? "");
  const [dbaName, setDbaName] = useState(workspace.dba_name ?? "");
  const [email, setEmail] = useState(workspace.email ?? "");
  const [phone, setPhone] = useState(workspace.phone ?? "");
  const [website, setWebsite] = useState(workspace.website ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("workspaces")
      .update({
        name,
        legal_name: legalName || null,
        dba_name: dbaName || null,
        email: email || null,
        phone: phone || null,
        website: website || null,
      })
      .eq("id", workspace.id);
    setSaving(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Office settings saved");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Office details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Legal name</Label>
            <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>DBA name</Label>
            <Input value={dbaName} onChange={(e) => setDbaName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Website</Label>
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <Button variant="brand" size="sm" disabled={saving} onClick={save}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </CardContent>
    </Card>
  );
}
