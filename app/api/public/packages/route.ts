import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

// Public, unauthenticated -- resolves a page's selected package_ids (a
// Packages/services website section, see components/site/sections/
// PackagesSection.tsx) to that SAME workspace's current, published package
// data. Tenant isolation is enforced server-side (workspace resolved by
// slug, packages filtered to that workspace_id) rather than trusted from
// the client -- an id for another workspace's package can never resolve
// here. Only 'published' packages are returned, so a package the workspace
// later archives or un-publishes silently drops off the live page instead
// of leaving a dead "Purchase Now" button.
export async function GET(request: Request) {
  const allowed = await checkRateLimit(`public-packages:${clientIp(request)}`, 60, 60);
  if (!allowed) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const workspaceSlug = searchParams.get("workspaceSlug");
  const idsParam = searchParams.get("ids");
  if (!workspaceSlug) return NextResponse.json({ error: "workspaceSlug is required." }, { status: 400 });

  const ids = (idsParam ?? "").split(",").filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ packages: [] });

  const supabase = createServiceClient();

  const { data: workspace } = await supabase.from("workspaces").select("id").eq("slug", workspaceSlug).maybeSingle();
  if (!workspace) return NextResponse.json({ error: "This page isn't available." }, { status: 404 });

  const { data: packages } = await supabase
    .from("firm_packages")
    .select("id, name, description, flat_price, billing_cadence, stripe_payment_link_url")
    .eq("workspace_id", workspace.id)
    .eq("status", "published")
    .in("id", ids);

  // Preserve the order the page author chose, not whatever order the DB returned.
  const byId = new Map((packages ?? []).map((p) => [p.id, p]));
  const ordered = ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));

  return NextResponse.json({ packages: ordered });
}
