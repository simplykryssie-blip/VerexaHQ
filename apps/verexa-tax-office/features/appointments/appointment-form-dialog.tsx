"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SearchablePicker, type PickerOption } from "@/features/engagements/client-picker";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { APPOINTMENT_LOCATION_LABELS, REMINDER_TIMING_OPTIONS } from "@/lib/validation/appointments";
import { format } from "date-fns";

type AppointmentType = { id: string; name: string; duration_minutes: number; location_type: string };

export function AppointmentFormDialog({
  workspaceId,
  clients,
  leads,
  staff,
  appointmentTypes,
  defaultStart,
  fixedClientId,
}: {
  workspaceId: string;
  clients: PickerOption[];
  leads: PickerOption[];
  staff: PickerOption[];
  appointmentTypes: AppointmentType[];
  defaultStart?: Date;
  fixedClientId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState<string | null>(fixedClientId ?? null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [appointmentTypeId, setAppointmentTypeId] = useState<string | null>(null);
  const [assignedUserId, setAssignedUserId] = useState<string | null>(null);
  const [locationType, setLocationType] = useState<keyof typeof APPOINTMENT_LOCATION_LABELS>("office");
  const [locationText, setLocationText] = useState("");
  const [startsAt, setStartsAt] = useState(format(defaultStart ?? new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [clientNotes, setClientNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [reminderTimings, setReminderTimings] = useState<number[]>([1440]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Enter a title.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const starts = new Date(startsAt);
    const ends = new Date(starts.getTime() + durationMinutes * 60_000);

    const { error: dbError } = await supabase.from("appointments").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      lead_id: leadId,
      appointment_type_id: appointmentTypeId,
      assigned_user_id: assignedUserId,
      title: title.trim(),
      location_type: locationType,
      location_text: locationText || null,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      client_notes: clientNotes || null,
      internal_notes: internalNotes || null,
      reminder_settings: { timing_minutes: reminderTimings },
      created_by: user?.id ?? null,
    });

    setSubmitting(false);
    if (dbError) {
      setError(friendlyDbError(dbError.message));
      return;
    }
    toast.success("Appointment scheduled");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="brand" size="sm">
          <Plus className="h-4 w-4" /> New appointment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule an appointment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Intake consultation" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!fixedClientId && (
              <div className="space-y-1">
                <Label>Client</Label>
                <SearchablePicker options={clients} value={clientId} onChange={(v) => { setClientId(v); setLeadId(null); }} placeholder="Search clients…" />
              </div>
            )}
            <div className="space-y-1">
              <Label>Lead</Label>
              <SearchablePicker options={leads} value={leadId} onChange={(v) => { setLeadId(v); setClientId(fixedClientId ?? null); }} placeholder="Search leads…" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Appointment type</Label>
              <Select
                value={appointmentTypeId ?? "none"}
                onValueChange={(v) => {
                  setAppointmentTypeId(v === "none" ? null : v);
                  const t = appointmentTypes.find((t) => t.id === v);
                  if (t) {
                    setDurationMinutes(t.duration_minutes);
                    setLocationType(t.location_type as typeof locationType);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {appointmentTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Assigned staff</Label>
              <SearchablePicker options={staff} value={assignedUserId} onChange={setAssignedUserId} placeholder="Staff member…" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Starts</Label>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Duration (minutes)</Label>
              <Input type="number" min={5} step={5} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value) || 30)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Location</Label>
            <Select value={locationType} onValueChange={(v) => setLocationType(v as typeof locationType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(APPOINTMENT_LOCATION_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {locationType === "video" && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <VideoOff className="h-3.5 w-3.5" /> Zoom not connected — this appointment will be created without a join link.
              </p>
            )}
            {(locationType === "office" || locationType === "client_location" || locationType === "other") && (
              <Input className="mt-1" value={locationText} onChange={(e) => setLocationText(e.target.value)} placeholder="Address or details (optional)" />
            )}
          </div>

          <div className="space-y-1">
            <Label>Notes visible to client</Label>
            <Textarea value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Internal notes</Label>
            <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} />
          </div>

          <div className="space-y-1">
            <Label>Reminder timing</Label>
            <div className="flex flex-wrap gap-3">
              {REMINDER_TIMING_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={reminderTimings.includes(opt.value)}
                    onCheckedChange={(checked) =>
                      setReminderTimings((prev) => (checked ? [...prev, opt.value] : prev.filter((v) => v !== opt.value)))
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Schedule appointment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
