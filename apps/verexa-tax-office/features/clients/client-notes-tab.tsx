"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { Loader2 } from "lucide-react";

export function ClientNotesTab({ clientId, notes }: { clientId: string; notes: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("clients").update({ notes: value }).eq("id", clientId);
    setSaving(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Notes saved");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Internal notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea rows={8} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Add internal notes about this client…" />
        <Button variant="brand" size="sm" onClick={save} disabled={saving || value === (notes ?? "")}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save notes
        </Button>
      </CardContent>
    </Card>
  );
}
