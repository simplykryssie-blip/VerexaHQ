import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { SupportArticleManager, type SupportArticleRow } from "@/components/support/SupportArticleManager";

export const dynamic = "force-dynamic";

export default async function ManageSupportPage() {
  const supabase = createClient();
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");

  if (!isPlatformAdmin) {
    return (
      <>
        <PageHeader backHref="/support" backLabel="Support" title="Manage Support Content" />
        <div className="flex-1 px-8 py-6">
          <EmptyState message="You don't have permission to manage Support content." />
        </div>
      </>
    );
  }

  const { data: articles } = await supabase
    .from("support_articles")
    .select("id, section, title, body, image_url, display_order")
    .order("display_order");

  const rows: SupportArticleRow[] = (articles ?? []).map((a) => ({
    ...a,
    section: a.section as SupportArticleRow["section"],
  }));

  return (
    <>
      <PageHeader
        backHref="/support"
        backLabel="Support"
        title="Manage Support Content"
        description="Edit the articles every workspace on Verexa sees under Support -- add a photo, reorder, or add a new article."
      />
      <div className="flex-1 px-8 py-6">
        <SupportArticleManager articles={rows} />
      </div>
    </>
  );
}
