"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm, type FieldDef } from "@/components/InlineAddForm";
import { Pencil } from "lucide-react";
import type { PortalUserRow } from "./ClientWorkspaceTabs";

type ProfileClient = {
  id: string;
  client_type: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
};

export function EditClientProfileForm({ client, portalUsers }: { client: ProfileClient; portalUsers: PortalUserRow[] }) {
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
        const emailChanged = (v.primary_email || "").trim().toLowerCase() !== (client.primary_email ?? "").trim().toLowerCase();

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

        // A portal login is a real auth.users account (or a still-pending
        // invite token) tied to whatever email it was invited/created under
        // -- changing the client's primary_email here never touches that on
        // its own. For a pre-acceptance or no-longer-live invite, updating
        // invited_email just means the next invite goes to the right
        // address. For an already-active login, the account's real sign-in
        // email is a credential the client controls, not something to
        // silently rewrite from a profile edit -- surface it instead.
        if (emailChanged && v.primary_email) {
          const portalUser = portalUsers.find((p) => p.is_primary) ?? portalUsers[0];
          if (portalUser && portalUser.invited_email.toLowerCase() !== v.primary_email.trim().toLowerCase()) {
            if (portalUser.status === "active") {
              window.alert(
                `Heads up: this client's active portal login is still under ${portalUser.invited_email}. Updating their sign-in email isn't done from here -- they can change it from their own portal settings.`
              );
            } else if (
              window.confirm(`Also update this client's portal invitation email from ${portalUser.invited_email} to ${v.primary_email}?`)
            ) {
              await supabase
                .from("client_portal_users")
                .update({ invited_email: v.primary_email.trim().toLowerCase() })
                .eq("id", portalUser.id);
            }
          }
        }

        router.refresh();
      }}
    />
  );
}
