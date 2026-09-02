import { ClientQuickViewDrawer } from "@/app/(app)/clients/[id]/ClientQuickViewDrawer";
import { getClientWorkspaceData } from "@/app/(app)/clients/[id]/getClientWorkspaceData";

export const dynamic = "force-dynamic";

// Intercepts a client-side navigation from /clients (the list) to
// /clients/[id], rendering the Quick-View drawer over the still-visible list
// instead of the full page -- a direct visit or a hard refresh at this exact
// URL skips interception entirely and gets the real page
// (app/(app)/clients/[id]/page.tsx). Fetches through the same
// getClientWorkspaceData() the full page uses, so the drawer is never a
// second, drifting copy of what a client record actually looks like.
export default async function ClientQuickViewInterceptedPage({ params }: { params: { id: string } }) {
  const data = await getClientWorkspaceData(params.id);
  if (!data) return null;

  return <ClientQuickViewDrawer {...data} />;
}
