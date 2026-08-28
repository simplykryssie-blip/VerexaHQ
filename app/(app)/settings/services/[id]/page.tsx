import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { ServiceForm, type ServiceRow, type Option } from "@/components/settings/ServiceForm";

export const dynamic = "force-dynamic";

export default async function ServiceDetailPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  const { data: service } = await supabase
    .from("services")
    .select("*")
    .eq("id", params.id)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (!service) notFound();

  const [
    { data: categories },
    { data: pipelines },
    { data: organizerTemplates },
    { data: documentRequestTemplates },
    { data: documentFolderTemplates },
    { data: pricingRules },
    { data: billingRules },
    { data: canManage },
  ] = await Promise.all([
    supabase.from("service_categories").select("id, name").eq("workspace_id", workspace.id).order("display_order"),
    supabase.from("processes").select("id, name").eq("workspace_id", workspace.id).eq("status", "published").order("name"),
    supabase.from("organizer_templates").select("id, name").eq("workspace_id", workspace.id).eq("status", "published").order("name"),
    supabase.from("document_request_templates").select("id, name").eq("workspace_id", workspace.id).eq("status", "published").order("name"),
    supabase.from("document_folder_templates").select("id, name").eq("workspace_id", workspace.id).eq("status", "published").order("name"),
    supabase.from("pricing_rules").select("id, name").eq("workspace_id", workspace.id).eq("status", "published").order("name"),
    supabase.from("billing_rules").select("id, name").eq("workspace_id", workspace.id).eq("status", "published").order("name"),
    supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
  ]);

  const asOptions = (rows: { id: string; name: string }[] | null): Option[] => rows ?? [];

  return (
    <div className="max-w-2xl">
      <Link href="/settings/services" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden="true" /> Back to Services
      </Link>
      <h1 className="font-display text-lg font-semibold text-ink">{service.name}</h1>
      <div className="mt-4">
        <ServiceForm
          service={service as ServiceRow}
          categories={asOptions(categories)}
          pipelines={asOptions(pipelines)}
          organizerTemplates={asOptions(organizerTemplates)}
          documentRequestTemplates={asOptions(documentRequestTemplates)}
          documentFolderTemplates={asOptions(documentFolderTemplates)}
          pricingRules={asOptions(pricingRules)}
          billingRules={asOptions(billingRules)}
          canManage={Boolean(canManage)}
        />
      </div>
    </div>
  );
}
