import { redirect } from "next/navigation";

// Services no longer has a UI entry point -- Settings > Services isn't
// listed in nav, and a case doesn't need one in front of it (see
// create_engagement's optional p_service_id/p_process_id). The
// services/pricing_rules/billing_rules tables and everything that still
// reads from them (billing, document requests, organizer routing) are
// untouched; this route is just no longer reachable.
export default function ServicesPage() {
  redirect("/settings");
}
