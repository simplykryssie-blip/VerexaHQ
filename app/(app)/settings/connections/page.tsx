import { redirect } from "next/navigation";

// Connections was merged into Users & Staff (one page, one nav item -- team
// roster and firm-to-firm connections are both "who has access to this
// workspace"). Kept as a redirect, not deleted outright, since the /join
// invite flow generates its own links (/join?token=...) but nothing
// external points at this exact route -- an old bookmark or an
// already-open tab still lands somewhere real instead of 404ing.
export default function ConnectionsRedirect({ searchParams }: { searchParams: { token?: string } }) {
  const qs = searchParams.token ? `?token=${encodeURIComponent(searchParams.token)}` : "";
  redirect(`/settings/users${qs}`);
}
