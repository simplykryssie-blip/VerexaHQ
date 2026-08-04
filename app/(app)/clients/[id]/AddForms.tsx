"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";

type Ids = { clientId: string; workspaceId: string };

export function AddContactForm({ clientId, workspaceId }: Ids) {
  const router = useRouter();
  const supabase = createClient();
  return (
    <InlineAddForm
      label="Add Contact"
      fields={[
        { name: "first_name", label: "First name", required: true },
        { name: "last_name", label: "Last name", required: true },
        { name: "email", label: "Email" },
        { name: "phone", label: "Phone" },
      ]}
      onSubmit={async (v) => {
        const { error } = await supabase.from("client_contacts").insert({
          client_id: clientId,
          workspace_id: workspaceId,
          first_name: v.first_name,
          last_name: v.last_name,
          email: v.email || null,
          phone: v.phone || null,
        });
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}

export function AddAddressForm({ clientId, workspaceId }: Ids) {
  const router = useRouter();
  const supabase = createClient();
  return (
    <InlineAddForm
      label="Add Address"
      fields={[
        {
          name: "address_type",
          label: "Type",
          type: "select",
          required: true,
          options: [
            { value: "mailing", label: "Mailing" },
            { value: "business", label: "Business" },
            { value: "seasonal", label: "Seasonal" },
            { value: "other", label: "Other" },
          ],
        },
        { name: "street", label: "Street", required: true },
        { name: "city", label: "City" },
        { name: "state", label: "State" },
        { name: "zip", label: "ZIP" },
      ]}
      onSubmit={async (v) => {
        const { error } = await supabase.from("client_addresses").insert({
          client_id: clientId,
          workspace_id: workspaceId,
          address_type: v.address_type,
          street: v.street,
          city: v.city || null,
          state: v.state || null,
          zip: v.zip || null,
        });
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}

export function AddPhoneForm({ clientId, workspaceId }: Ids) {
  const router = useRouter();
  const supabase = createClient();
  return (
    <InlineAddForm
      label="Add Phone"
      fields={[
        {
          name: "phone_type",
          label: "Type",
          type: "select",
          required: true,
          options: [
            { value: "mobile", label: "Mobile" },
            { value: "office", label: "Office" },
            { value: "home", label: "Home" },
            { value: "fax", label: "Fax" },
            { value: "other", label: "Other" },
          ],
        },
        { name: "phone_number", label: "Phone number", type: "tel", required: true },
      ]}
      onSubmit={async (v) => {
        const { error } = await supabase.from("client_phones").insert({
          client_id: clientId,
          workspace_id: workspaceId,
          phone_type: v.phone_type,
          phone_number: v.phone_number,
        });
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}

export function AddEmailForm({ clientId, workspaceId }: Ids) {
  const router = useRouter();
  const supabase = createClient();
  return (
    <InlineAddForm
      label="Add Email"
      fields={[
        {
          name: "email_type",
          label: "Type",
          type: "select",
          required: true,
          options: [
            { value: "personal", label: "Personal" },
            { value: "business", label: "Business" },
            { value: "accounting", label: "Accounting" },
            { value: "other", label: "Other" },
          ],
        },
        { name: "email", label: "Email", type: "email", required: true },
      ]}
      onSubmit={async (v) => {
        const { error } = await supabase.from("client_emails").insert({
          client_id: clientId,
          workspace_id: workspaceId,
          email_type: v.email_type,
          email: v.email,
        });
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}

export function AddRelationshipForm({ clientId, workspaceId }: Ids) {
  const router = useRouter();
  const supabase = createClient();
  return (
    <InlineAddForm
      label="Add Relationship"
      fields={[
        {
          name: "relationship_type",
          label: "Type",
          type: "select",
          required: true,
          options: [
            "spouse",
            "dependent",
            "parent",
            "child",
            "business",
            "trust",
            "estate",
            "partner",
            "owner",
            "officer",
            "other",
          ].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })),
        },
        { name: "related_name", label: "Name", required: true },
      ]}
      onSubmit={async (v) => {
        const { error } = await supabase.from("client_relationships").insert({
          client_id: clientId,
          workspace_id: workspaceId,
          relationship_type: v.relationship_type,
          related_name: v.related_name,
        });
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}

export function AddPortalUserForm({ clientId, workspaceId }: Ids) {
  const router = useRouter();
  const supabase = createClient();
  return (
    <InlineAddForm
      label="Invite Additional"
      fields={[
        { name: "invited_name", label: "Name" },
        { name: "invited_email", label: "Email", type: "email", required: true },
      ]}
      onSubmit={async (v) => {
        const { error } = await supabase.from("client_portal_users").insert({
          client_id: clientId,
          workspace_id: workspaceId,
          invited_name: v.invited_name || null,
          invited_email: v.invited_email,
        });
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}

export function AddNoteForm({
  entityType,
  entityId,
  workspaceId,
}: {
  entityType: string;
  entityId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  return (
    <InlineAddForm
      label="New Note"
      fields={[{ name: "body", label: "Note", required: true }]}
      onSubmit={async (v) => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error } = await supabase.from("notes").insert({
          workspace_id: workspaceId,
          entity_type: entityType,
          entity_id: entityId,
          author_id: user?.id,
          body: v.body,
        });
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}
