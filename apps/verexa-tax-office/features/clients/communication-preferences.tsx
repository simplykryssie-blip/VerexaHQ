"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import type { Tables } from "@/types/database";

export function ClientCommunicationPreferences({
  workspaceId,
  clientId,
  preferences,
}: {
  workspaceId: string;
  clientId: string;
  preferences: Tables<"client_communication_preferences"> | null;
}) {
  const router = useRouter();
  const [emailConsent, setEmailConsent] = useState(preferences?.email_consent ?? true);
  const [smsConsent, setSmsConsent] = useState(preferences?.sms_consent ?? false);
  const [preferredMethod, setPreferredMethod] = useState(preferences?.preferred_contact_method ?? "email");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("client_communication_preferences").upsert(
      {
        workspace_id: workspaceId,
        client_id: clientId,
        email_consent: emailConsent,
        sms_consent: smsConsent,
        preferred_contact_method: preferredMethod,
      },
      { onConflict: "workspace_id,client_id" },
    );
    setSaving(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Communication preferences saved");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notification preferences</CardTitle>
        <CardDescription>Controls what reminders and messages this client can receive once providers are connected.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={emailConsent} onCheckedChange={(v) => setEmailConsent(v === true)} />
          Email consent
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={smsConsent} onCheckedChange={(v) => setSmsConsent(v === true)} />
          SMS consent
        </label>
        <div className="space-y-1 max-w-[220px]">
          <label className="text-xs text-muted-foreground">Preferred contact method</label>
          <Select value={preferredMethod} onValueChange={setPreferredMethod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">Text message</SelectItem>
              <SelectItem value="phone">Phone call</SelectItem>
              <SelectItem value="portal">Client portal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(preferences?.email_suppressed || preferences?.sms_suppressed) && (
          <p className="text-xs text-warning">
            {preferences.email_suppressed && "Email delivery has been suppressed (bounced or invalid). "}
            {preferences.sms_suppressed && "SMS delivery has been suppressed."}
          </p>
        )}
        <Button size="sm" variant="brand" disabled={saving} onClick={save}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save preferences
        </Button>
      </CardContent>
    </Card>
  );
}
