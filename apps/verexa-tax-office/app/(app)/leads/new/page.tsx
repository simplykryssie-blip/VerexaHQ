import { redirect } from "next/navigation";

// Lead creation happens inline via a dialog on the list page (fewer
// clicks than a separate route) — this redirect exists so the dashboard's
// "Add lead" quick action and any deep link to /leads/new still lands
// somewhere real instead of 404ing.
export default function NewLeadRedirect() {
  redirect("/leads");
}
