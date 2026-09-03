import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getValidAccessToken } from "@/lib/zoom/tokens";
import { createZoomMeeting } from "@/lib/zoom/client";

export type BookedMeeting = { location: string | null; meetingUrl: string | null };

/**
 * Resolves the location/meeting_url an appointment should be booked with,
 * for all three booking_location_type values a service can be set to.
 *
 * "zoom" creates a fresh, unique Zoom meeting for this one appointment
 * (never a shared static link) under whichever staff member should host
 * it: the appointment's own staff_id if the client booked that person's
 * specific link, otherwise the service's configured zoom_host_user_id.
 * If no host is resolvable, or that host's Zoom connection is missing or
 * a Zoom API call fails, this degrades to a friendly placeholder rather
 * than blocking the booking -- Zoom being down shouldn't stop a client
 * from getting on the calendar.
 */
export async function resolveBookedMeeting(
  supabase: SupabaseClient<Database>,
  params: {
    locationType: string;
    staticMeetingUrl: string | null;
    staffId: string | null;
    zoomHostUserId: string | null;
    topic: string;
    startTimeIso: string;
    durationMinutes: number;
  }
): Promise<BookedMeeting> {
  const { locationType, staticMeetingUrl, staffId, zoomHostUserId, topic, startTimeIso, durationMinutes } = params;

  if (locationType === "link") {
    return { location: staticMeetingUrl, meetingUrl: staticMeetingUrl };
  }

  if (locationType === "zoom") {
    const hostUserId = staffId ?? zoomHostUserId;
    if (hostUserId) {
      const tokenResult = await getValidAccessToken(supabase, hostUserId);
      if (tokenResult.ok) {
        const meeting = await createZoomMeeting({ accessToken: tokenResult.accessToken, topic, startTimeIso, durationMinutes });
        if (meeting.ok) {
          return { location: meeting.data.join_url, meetingUrl: meeting.data.join_url };
        }
      }
    }
    return { location: "We'll send your meeting link shortly.", meetingUrl: null };
  }

  return { location: "We'll call you", meetingUrl: null };
}
