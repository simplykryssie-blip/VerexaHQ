"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";
import { Star, Trash2 } from "lucide-react";
type Ids = { clientId: string; workspaceId: string };

const EMAIL_TYPE_OPTIONS = [
  { value: "personal", label: "Personal" },
  { value: "business", label: "Business" },
  { value: "accounting", label: "Accounting" },
  { value: "other", label: "Other" },
];

const PHONE_TYPE_OPTIONS = [
  { value: "mobile", label: "Mobile" },
  { value: "office", label: "Office" },
  { value: "home", label: "Home" },
  { value: "fax", label: "Fax" },
  { value: "other", label: "Other" },
];

export function AddEmailForm({ clientId, workspaceId }: Ids) {
  const router = useRouter();
  const supabase = createClient();
  return (
    <InlineAddForm
      label="Add Email"
      fields={[
        { name: "email", label: "Email", type: "email", required: true },
        { name: "email_type", label: "Type", type: "select", options: EMAIL_TYPE_OPTIONS },
      ]}
      onSubmit={async (v) => {
        const { error } = await supabase.rpc("add_client_email", {
          p_client_id: clientId,
          p_workspace_id: workspaceId,
          p_email: v.email,
          p_make_primary: false,
          p_email_type: v.email_type || "personal",
        });
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}

export function SetEmailPrimaryButton({ emailId }: { emailId: string }) {
  const router = useRouter();
  const supabase = createClient();
  async function handleClick() {
    const { error } = await supabase.rpc("set_client_email_primary", { p_email_id: emailId });
    if (error) {
      window.alert(error.message);
      return;
    }
    router.refresh();
  }
  return (
    <button type="button" onClick={handleClick} className="text-muted hover:text-accent" aria-label="Make primary">
      <Star size={13} />
    </button>
  );
}

export function DeleteEmailButton({ emailId }: { emailId: string }) {
  const router = useRouter();
  const supabase = createClient();
  async function handleDelete() {
    if (!window.confirm("Delete this email? This can't be undone.")) return;
    const { error } = await supabase.rpc("delete_client_email", { p_email_id: emailId });
    if (error) {
      window.alert(error.message);
      return;
    }
    router.refresh();
  }
  return (
    <button type="button" onClick={handleDelete} className="text-muted hover:text-danger" aria-label="Delete email">
      <Trash2 size={13} />
    </button>
  );
}

export function AddPhoneForm({ clientId, workspaceId }: Ids) {
  const router = useRouter();
  const supabase = createClient();
  return (
    <InlineAddForm
      label="Add Phone"
      fields={[
        { name: "phone", label: "Phone", type: "tel", required: true },
        { name: "phone_type", label: "Type", type: "select", options: PHONE_TYPE_OPTIONS },
      ]}
      onSubmit={async (v) => {
        const { error } = await supabase.rpc("add_client_phone", {
          p_client_id: clientId,
          p_workspace_id: workspaceId,
          p_phone: v.phone,
          p_make_primary: false,
          p_phone_type: v.phone_type || "mobile",
        });
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}

export function SetPhonePrimaryButton({ phoneId }: { phoneId: string }) {
  const router = useRouter();
  const supabase = createClient();
  async function handleClick() {
    const { error } = await supabase.rpc("set_client_phone_primary", { p_phone_id: phoneId });
    if (error) {
      window.alert(error.message);
      return;
    }
    router.refresh();
  }
  return (
    <button type="button" onClick={handleClick} className="text-muted hover:text-accent" aria-label="Make primary">
      <Star size={13} />
    </button>
  );
}

export function DeletePhoneButton({ phoneId }: { phoneId: string }) {
  const router = useRouter();
  const supabase = createClient();
  async function handleDelete() {
    if (!window.confirm("Delete this phone? This can't be undone.")) return;
    const { error } = await supabase.rpc("delete_client_phone", { p_phone_id: phoneId });
    if (error) {
      window.alert(error.message);
      return;
    }
    router.refresh();
  }
  return (
    <button type="button" onClick={handleDelete} className="text-muted hover:text-danger" aria-label="Delete phone">
      <Trash2 size={13} />
    </button>
  );
}

export function SetAddressPrimaryButton({ addressId }: { addressId: string }) {
  const router = useRouter();
  const supabase = createClient();
  async function handleClick() {
    const { error } = await supabase.rpc("set_client_address_primary", { p_address_id: addressId });
    if (error) {
      window.alert(error.message);
      return;
    }
    router.refresh();
  }
  return (
    <button type="button" onClick={handleClick} className="text-muted hover:text-accent" aria-label="Make primary">
      <Star size={13} />
    </button>
  );
}
