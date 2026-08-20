import { redirect } from "next/navigation";

// Appointments merged into /calendar (one page instead of two nav items) --
// keep this route alive so old links/bookmarks still land somewhere.
export default function AppointmentsRedirect() {
  redirect("/calendar");
}
