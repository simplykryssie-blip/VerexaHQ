"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function ProfileForm({
  userId,
  firstName,
  lastName,
  displayName,
}: {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [first, setFirst] = useState(firstName ?? "");
  const [last, setLast] = useState(lastName ?? "");
  const [display, setDisplay] = useState(displayName ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ first_name: first || null, last_name: last || null, display_name: display || null })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Profile updated", "success");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="max-w-md space-y-4 rounded-xl border border-border bg-surface p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="first_name" className="block text-sm font-medium text-slate">
            First name
          </label>
          <input
            id="first_name"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label htmlFor="last_name" className="block text-sm font-medium text-slate">
            Last name
          </label>
          <input
            id="last_name"
            value={last}
            onChange={(e) => setLast(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>
      <div>
        <label htmlFor="display_name" className="block text-sm font-medium text-slate">
          Display name
        </label>
        <input
          id="display_name"
          value={display}
          onChange={(e) => setDisplay(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
