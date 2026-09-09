import { entityHref } from "@/lib/notifications/present";

/** Where clicking a task should navigate: the specific record it's actually
 * about (an organizer response awaiting review) if it has one, otherwise the
 * engagement or client it's attached to. Mirrors entityHref's URL shapes so
 * a task and a notification about the same thing land on the same page. */
export function taskHref(t: {
  related_organizer_response_id?: string | null;
  engagement_id?: string | null;
  client_id?: string | null;
}): string | null {
  if (t.related_organizer_response_id) return entityHref("organizer_response", t.related_organizer_response_id);
  if (t.engagement_id) return entityHref("engagement", t.engagement_id);
  if (t.client_id) return entityHref("client", t.client_id);
  return null;
}
