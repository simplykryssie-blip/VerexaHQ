"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Contact = {
  phone: string | null;
  website: string | null;
  mailing_address: string | null;
  primary_contact_email: string | null;
};

export function FirmContactForm({ workspaceId, contact }: { workspaceId: string; contact: Contact }) {
  const router = useRouter();
  const supabase = createClient();
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [website, setWebsite] = useState(contact.website ?? "");
  const [address, setAddress] = useState(contact.mailing_address ?? "");
  const [email, setEmail] = useState(contact.primary_contact_email ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const { error } = await supabase
      .from("workspaces")
      .update({
        phone: phone || null,
        website: website || null,
        mailing_address: address || null,
        primary_contact_email: email || null,
      })
      .eq("id", workspaceId);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-muted">
        Shown to clients in the Client Portal Invite email and other firm-branded communications.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate">Contact email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate">Website</label>
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://"
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate">Mailing address</label>
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && !error && <p className="text-sm text-success">Saved.</p>}

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
