import { redirect } from "next/navigation";

// Partners' contact-info directory now lives on Settings > Users & Staff,
// right alongside the Connections controls it always described managing
// from -- folded into one page instead of two. This keeps the old URL
// working for anyone with it bookmarked.
export default function PartnersPage() {
  redirect("/settings/users");
}
