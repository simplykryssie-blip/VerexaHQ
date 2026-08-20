"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm, type FieldDef } from "@/components/InlineAddForm";
import { Pencil } from "lucide-react";

type ProfileClient = {
  id: string;
  client_type: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
};

export function EditClientProfileForm({ client }: { client: ProfileClient }) {
  const router = useRouter();
  const supabase = createClient();
  const isBusiness = client.client_type === "business";

  const fields: FieldDef[] = isBusiness
    ? [
        { name: "business_name", label: "Business name", required: true },
        { name: "primary_email", label: "Primary email", type: "email" },
        { name: "primary_phone", label: "Primary phone", type: "tel" },
      ]
    : [
        { name: "first_name", label: "First name", required: true },
        { name: "last_name", label: "Last name", required: true },
        { name: "primary_email", label: "Primary email", type: "email" },
        { name: "primary_phone", label: "Primary phone", type: "tel" },
      ];

  return (
    <InlineAddForm
      label="Edit"
      submitLabel="Save changes"
      fields={fields}
      initialValues={{
        first_name: client.first_name ?? "",
        last_name: client.last_name ?? "",
        business_name: client.business_name ?? "",
        primary_email: client.primary_email ?? "",
        primary_phone: client.primary_phone ?? "",
      }}
      trigger={(openForm) => (
        <button
          type="button"
          onClick={openForm}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
        >
          <Pencil size={12} /> Edit
        </button>
      )}
      onSubmit={async (v) => {
        const { error } = await supabase
          .from("clients")
          .update(
            isBusiness
              ? {
                  business_name: v.business_name,
                  primary_email: v.primary_email || null,
                  primary_phone: v.primary_phone || null,
                }
              : {
                  first_name: v.first_name,
                  last_name: v.last_name,
                  primary_email: v.primary_email || null,
                  primary_phone: v.primary_phone || null,
                }
          )
          .eq("id", client.id);
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}
