"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function ChangeMemberRoleSelect({
  memberId,
  currentRoleId,
  roles,
}: {
  memberId: string;
  currentRoleId: string;
  roles: { id: string; name: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [roleId, setRoleId] = useState(currentRoleId);
  const [saving, setSaving] = useState(false);

  async function handleChange(newRoleId: string) {
    const previous = roleId;
    setRoleId(newRoleId);
    setSaving(true);
    const { error } = await supabase.from("workspace_users").update({ role_id: newRoleId }).eq("id", memberId);
    setSaving(false);
    if (error) {
      setRoleId(previous);
      toast.show(error.message, "error");
      return;
    }
    toast.show("Role updated", "success");
    router.refresh();
  }

  return (
    <select
      value={roleId}
      disabled={saving}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded-lg border border-border bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
    >
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}
