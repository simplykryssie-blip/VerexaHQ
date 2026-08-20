"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";
import { Pencil, Trash2 } from "lucide-react";
import type { ContactRow, AddressRow } from "./ClientWorkspaceTabs";

type Ids = { clientId: string; workspaceId: string };

const CONTACT_TITLE_OPTIONS = [
  { value: "Owner", label: "Owner" },
  { value: "Partner", label: "Partner" },
  { value: "Attorney", label: "Attorney" },
  { value: "Officer", label: "Officer" },
  { value: "other", label: "Other" },
];

function resolveContactTitle(v: Record<string, string>) {
  return v.title === "other" ? v.custom_title?.trim() || "Other" : v.title || null;
}

export function AddContactForm({ clientId, workspaceId }: Ids) {
  const router = useRouter();
  const supabase = createClient();
  return (
    <InlineAddForm
      label="Add a contact"
      fields={[
        { name: "first_name", label: "First name", required: true },
        { name: "last_name", label: "Last name", required: true },
        { name: "title", label: "Title", type: "select", options: CONTACT_TITLE_OPTIONS },
        { name: "custom_title", label: "Custom title", showIf: (v) => v.title === "other" },
        { name: "email", label: "Email" },
        { name: "phone", label: "Phone" },
      ]}
      onSubmit={async (v) => {
        const { error } = await supabase.from("client_contacts").insert({
          client_id: clientId,
          workspace_id: workspaceId,
          first_name: v.first_name,
          last_name: v.last_name,
          title: resolveContactTitle(v),
          email: v.email || null,
          phone: v.phone || null,
        });
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}

export function EditContactForm({ contact }: { contact: ContactRow }) {
  const router = useRouter();
  const supabase = createClient();
  const knownTitle = CONTACT_TITLE_OPTIONS.some((o) => o.value === contact.title);
  return (
    <InlineAddForm
      label="Edit"
      submitLabel="Save changes"
      initialValues={{
        first_name: contact.first_name ?? "",
        last_name: contact.last_name ?? "",
        title: contact.title ? (knownTitle ? contact.title : "other") : "",
        custom_title: contact.title && !knownTitle ? contact.title : "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
      }}
      fields={[
        { name: "first_name", label: "First name", required: true },
        { name: "last_name", label: "Last name", required: true },
        { name: "title", label: "Title", type: "select", options: CONTACT_TITLE_OPTIONS },
        { name: "custom_title", label: "Custom title", showIf: (v) => v.title === "other" },
        { name: "email", label: "Email" },
        { name: "phone", label: "Phone" },
      ]}
      trigger={(openForm) => (
        <button type="button" onClick={openForm} className="text-muted hover:text-ink" aria-label="Edit contact">
          <Pencil size={13} />
        </button>
      )}
      onSubmit={async (v) => {
        const { error } = await supabase
          .from("client_contacts")
          .update({
            first_name: v.first_name,
            last_name: v.last_name,
            title: resolveContactTitle(v),
            email: v.email || null,
            phone: v.phone || null,
          })
          .eq("id", contact.id);
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}

export function DeleteContactButton({ contactId }: { contactId: string }) {
  const router = useRouter();
  const supabase = createClient();
  async function handleDelete() {
    if (!window.confirm("Delete this contact? This can't be undone.")) return;
    const { error } = await supabase.from("client_contacts").delete().eq("id", contactId);
    if (error) {
      window.alert(error.message);
      return;
    }
    router.refresh();
  }
  return (
    <button type="button" onClick={handleDelete} className="text-muted hover:text-danger" aria-label="Delete contact">
      <Trash2 size={13} />
    </button>
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

const ADDRESS_TYPE_OPTIONS = [
  { value: "mailing", label: "Mailing" },
  { value: "business", label: "Business" },
  { value: "seasonal", label: "Seasonal" },
  { value: "other", label: "Other" },
];

export function EditAddressForm({ address }: { address: AddressRow }) {
  const router = useRouter();
  const supabase = createClient();
  return (
    <InlineAddForm
      label="Edit"
      submitLabel="Save changes"
      initialValues={{
        address_type: address.address_type,
        street: address.street ?? "",
        city: address.city ?? "",
        state: address.state ?? "",
        zip: address.zip ?? "",
      }}
      fields={[
        { name: "address_type", label: "Type", type: "select", required: true, options: ADDRESS_TYPE_OPTIONS },
        { name: "street", label: "Street", required: true },
        { name: "city", label: "City" },
        { name: "state", label: "State" },
        { name: "zip", label: "ZIP" },
      ]}
      trigger={(openForm) => (
        <button type="button" onClick={openForm} className="text-muted hover:text-ink" aria-label="Edit address">
          <Pencil size={13} />
        </button>
      )}
      onSubmit={async (v) => {
        const { error } = await supabase
          .from("client_addresses")
          .update({
            address_type: v.address_type,
            street: v.street,
            city: v.city || null,
            state: v.state || null,
            zip: v.zip || null,
          })
          .eq("id", address.id);
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}

export function DeleteAddressButton({ addressId }: { addressId: string }) {
  const router = useRouter();
  const supabase = createClient();
  async function handleDelete() {
    if (!window.confirm("Delete this address? This can't be undone.")) return;
    const { error } = await supabase.from("client_addresses").delete().eq("id", addressId);
    if (error) {
      window.alert(error.message);
      return;
    }
    router.refresh();
  }
  return (
    <button type="button" onClick={handleDelete} className="text-muted hover:text-danger" aria-label="Delete address">
      <Trash2 size={13} />
    </button>
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
        const { data: invite, error } = await supabase
          .from("client_portal_users")
          .insert({
            client_id: clientId,
            workspace_id: workspaceId,
            invited_name: v.invited_name || null,
            invited_email: v.invited_email,
          })
          .select("invitation_token")
          .single();
        if (error) return error.message;

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
        const acceptUrl = `${appUrl}/portal/accept-invitation?token=${invite.invitation_token}`;

        const emailRes = await fetch("/api/portal-invitations/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            invitedEmail: v.invited_email,
            invitedName: v.invited_name || null,
            acceptUrl,
          }),
        });
        const emailResult = await emailRes.json().catch(() => null);

        router.refresh();

        if (!emailRes.ok || !emailResult?.sent) {
          return `Invite created, but the email couldn't be sent. Share this link with them directly: ${acceptUrl}`;
        }
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
      fields={[
        { name: "subject", label: "Subject" },
        { name: "body", label: "Note", type: "textarea", required: true },
      ]}
      onSubmit={async (v) => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error } = await supabase.from("notes").insert({
          workspace_id: workspaceId,
          entity_type: entityType,
          entity_id: entityId,
          author_id: user?.id,
          subject: v.subject || null,
          body: v.body,
        });
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}

export function EditNoteForm({ note }: { note: { id: string; subject: string | null; body: string } }) {
  const router = useRouter();
  const supabase = createClient();
  return (
    <InlineAddForm
      label="Edit"
      submitLabel="Save changes"
      initialValues={{ subject: note.subject ?? "", body: note.body }}
      fields={[
        { name: "subject", label: "Subject" },
        { name: "body", label: "Note", type: "textarea", required: true },
      ]}
      trigger={(openForm) => (
        <button type="button" onClick={openForm} className="text-muted hover:text-ink" aria-label="Edit note">
          <Pencil size={13} />
        </button>
      )}
      onSubmit={async (v) => {
        const { error } = await supabase
          .from("notes")
          .update({ subject: v.subject || null, body: v.body })
          .eq("id", note.id);
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}
