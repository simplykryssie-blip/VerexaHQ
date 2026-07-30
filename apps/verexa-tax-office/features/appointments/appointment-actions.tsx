"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/validation/appointments";

export function AppointmentStatusSelect({ appointmentId, status }: { appointmentId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function update(next: string) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("appointments").update({ status: next as never }).eq("id", appointmentId);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Appointment updated");
    router.refresh();
  }

  return (
    <Select value={status} onValueChange={update} disabled={busy}>
      <SelectTrigger className="w-44">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SelectValue />}
      </SelectTrigger>
      <SelectContent>
        {Object.entries(APPOINTMENT_STATUS_LABELS).map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ZoomStatus({ joinUrl }: { joinUrl?: string | null }) {
  if (joinUrl) {
    return (
      <a href={joinUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-brand underline underline-offset-2">
        Join Zoom meeting
      </a>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <VideoOff className="h-4 w-4" /> Zoom not connected
    </p>
  );
}
