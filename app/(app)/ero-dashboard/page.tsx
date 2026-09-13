import { redirect } from "next/navigation";

// Phase 5D: this page's old team-workload + bespoke Partner Payouts content
// is retired -- the network-relevant part is now represented properly on
// /ero-network via the Phase 5B/5C aggregate RPCs, and the office-relevant
// part was already duplicated on /dashboard. This route is kept (not
// deleted) purely so the old URL still resolves for anyone with it bookmarked
// or linked.
export default function EroDashboardPage() {
  redirect("/ero-network");
}
