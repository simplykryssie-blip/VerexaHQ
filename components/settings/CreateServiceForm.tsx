"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";

type Option = { id: string; name: string };

export function CreateServiceForm({
  workspaceId,
  categories,
  pricingRules,
  billingRules,
  organizerTemplates,
  documentRequestTemplates,
  documentFolderTemplates,
  engagementLetterTemplates,
  defaultOpen,
  onSuccess,
}: {
  workspaceId: string;
  categories: Option[];
  pricingRules: Option[];
  billingRules: Option[];
  organizerTemplates: Option[];
  documentRequestTemplates: Option[];
  documentFolderTemplates: Option[];
  engagementLetterTemplates: Option[];
  defaultOpen?: boolean;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();

  const toOptions = (rows: Option[]) => rows.map((r) => ({ value: r.id, label: r.name }));

  return (
    <InlineAddForm
      label="New Service Package"
      defaultOpen={defaultOpen}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "slug", label: "Slug (unique key)", required: true },
        { name: "service_category_id", label: "Category", type: "select", options: toOptions(categories) },
        { name: "default_price", label: "Default price" },
        { name: "pricing_rule_id", label: "Pricing rule", type: "select", options: toOptions(pricingRules) },
        { name: "billing_rule_id", label: "Billing rule", type: "select", options: toOptions(billingRules) },
        { name: "organizer_template_id", label: "Organizer template", type: "select", options: toOptions(organizerTemplates) },
        { name: "document_request_template_id", label: "Document request template", type: "select", options: toOptions(documentRequestTemplates) },
        { name: "document_folder_template_id", label: "Document folder template", type: "select", options: toOptions(documentFolderTemplates) },
        { name: "engagement_letter_template_id", label: "Engagement letter template", type: "select", options: toOptions(engagementLetterTemplates) },
      ]}
      onSubmit={async (v) => {
        const { error } = await supabase.from("services").insert({
          workspace_id: workspaceId,
          name: v.name,
          slug: v.slug,
          service_category_id: v.service_category_id || null,
          default_price: v.default_price ? Number(v.default_price) : null,
          pricing_rule_id: v.pricing_rule_id || null,
          billing_rule_id: v.billing_rule_id || null,
          organizer_template_id: v.organizer_template_id || null,
          document_request_template_id: v.document_request_template_id || null,
          document_folder_template_id: v.document_folder_template_id || null,
          engagement_letter_template_id: v.engagement_letter_template_id || null,
          status: "draft",
        });
        if (error) return error.message;
        router.refresh();
        onSuccess?.();
      }}
    />
  );
}
