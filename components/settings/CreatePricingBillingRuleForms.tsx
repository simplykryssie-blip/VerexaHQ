"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";
import { slugify } from "@/lib/roleSlug";

export function CreatePricingRuleForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const supabase = createClient();

  return (
    <InlineAddForm
      label="New Pricing Rule"
      fields={[
        { name: "name", label: "Name", required: true },
        {
          name: "pricing_method",
          label: "Pricing method",
          type: "select",
          required: true,
          options: [
            { value: "flat_fee", label: "Flat fee" },
            { value: "hourly", label: "Hourly" },
            { value: "custom_quote", label: "Custom quote" },
            { value: "tax_form_based", label: "Tax form based" },
            { value: "complexity_based", label: "Complexity based" },
          ],
        },
        { name: "base_amount", label: "Base amount (optional)" },
        { name: "hourly_rate", label: "Hourly rate (optional)" },
      ]}
      onSubmit={async (v) => {
        const base = slugify(v.name);
        for (let attempt = 0; attempt < 5; attempt++) {
          const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
          const { error } = await supabase.from("pricing_rules").insert({
            workspace_id: workspaceId,
            name: v.name,
            slug,
            pricing_method: v.pricing_method,
            base_amount: v.base_amount ? Number(v.base_amount) : null,
            hourly_rate: v.hourly_rate ? Number(v.hourly_rate) : null,
          });
          if (!error) {
            router.refresh();
            return;
          }
          if (error.code !== "23505") return error.message;
        }
        return "Could not create pricing rule -- try a slightly different name.";
      }}
    />
  );
}

export function CreateBillingRuleForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const supabase = createClient();

  return (
    <InlineAddForm
      label="New Billing Rule"
      fields={[
        { name: "name", label: "Name", required: true },
        {
          name: "invoice_timing",
          label: "Invoice timing",
          type: "select",
          required: true,
          options: [
            { value: "before_work", label: "Before work starts" },
            { value: "after_work", label: "After work completes" },
          ],
        },
      ]}
      onSubmit={async (v) => {
        const base = slugify(v.name);
        for (let attempt = 0; attempt < 5; attempt++) {
          const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
          const { error } = await supabase.from("billing_rules").insert({
            workspace_id: workspaceId,
            name: v.name,
            slug,
            invoice_timing: v.invoice_timing,
          });
          if (!error) {
            router.refresh();
            return;
          }
          if (error.code !== "23505") return error.message;
        }
        return "Could not create billing rule -- try a slightly different name.";
      }}
    />
  );
}
