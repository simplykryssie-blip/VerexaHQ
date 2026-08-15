import { redirect } from "next/navigation";

// See app/(app)/settings/services/page.tsx -- the whole Services settings
// tree is no longer reachable from the UI, this just catches anyone with an
// old /settings/services/[id] link bookmarked.
export default function ServiceDetailPage() {
  redirect("/settings");
}
