import { z } from "zod";
import type { Enums } from "@/types/database";

type AppointmentStatus = Enums<"appointment_status">;
type AppointmentLocationType = Enums<"appointment_location_type">;

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
  rescheduled: "Rescheduled",
};

export const APPOINTMENT_LOCATION_LABELS: Record<AppointmentLocationType, string> = {
  office: "Office",
  phone: "Phone",
  video: "Video",
  client_location: "Client location",
  other: "Other",
};

export const APPOINTMENT_LOCATION_TYPES = Object.keys(APPOINTMENT_LOCATION_LABELS) as [AppointmentLocationType, ...AppointmentLocationType[]];

export function appointmentStatusLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (APPOINTMENT_STATUS_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
export function appointmentLocationLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (APPOINTMENT_LOCATION_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}

export const REMINDER_TIMING_OPTIONS = [
  { value: 10080, label: "1 week before" },
  { value: 1440, label: "1 day before" },
  { value: 120, label: "2 hours before" },
  { value: 60, label: "1 hour before" },
  { value: 15, label: "15 minutes before" },
];

export const appointmentSchema = z.object({
  title: z.string().trim().min(1, "Enter a title."),
  description: z.string().max(2000).optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  leadId: z.string().uuid().optional().nullable(),
  engagementId: z.string().uuid().optional().nullable(),
  appointmentTypeId: z.string().uuid().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  locationType: z.enum(APPOINTMENT_LOCATION_TYPES).default("office"),
  locationText: z.string().max(500).optional().nullable(),
  startsAt: z.string().min(1, "Choose a start time."),
  durationMinutes: z.coerce.number().int().min(5).max(480).default(30),
  clientNotes: z.string().max(2000).optional().nullable(),
  internalNotes: z.string().max(2000).optional().nullable(),
  reminderTimings: z.array(z.number()).default([1440]),
});
export type AppointmentInput = z.infer<typeof appointmentSchema>;
