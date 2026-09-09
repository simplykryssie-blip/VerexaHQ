export type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";

export type AppointmentRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  meeting_url: string | null;
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
  portal_visible: boolean;
  client_id: string | null;
  client_label: string | null;
  client_email: string | null;
  engagement_id: string | null;
  engagement_label: string | null;
  staff_id: string | null;
  staff_name: string | null;
};

export type ClientOption = { id: string; label: string; email: string | null };
export type EngagementOption = { id: string; client_id: string; label: string };
export type StaffOption = { id: string; label: string };
export type ServiceOption = {
  id: string;
  name: string;
  estimated_duration_minutes: number | null;
  booking_location_type: string;
  booking_meeting_url: string | null;
  allow_overlapping_bookings: boolean;
};
