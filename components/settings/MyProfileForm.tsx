"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Avatar } from "@/components/Avatar";

export function MyProfileForm({
  userId,
  firstName,
  lastName,
  displayName,
  avatarUrl,
  phone,
}: {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  phone: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [first, setFirst] = useState(firstName ?? "");
  const [last, setLast] = useState(lastName ?? "");
  const [display, setDisplay] = useState(displayName ?? "");
  const [phoneValue, setPhoneValue] = useState(phone ?? "");
  const [avatar, setAvatar] = useState(avatarUrl);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    const path = `${userId}/avatar-${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadErr) {
      setUploadingAvatar(false);
      toast.show(uploadErr.message, "error");
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error: updateErr } = await supabase.from("user_profiles").update({ avatar_url: data.publicUrl }).eq("id", userId);
    setUploadingAvatar(false);
    if (updateErr) {
      toast.show(updateErr.message, "error");
      return;
    }
    setAvatar(data.publicUrl);
    toast.show("Photo updated", "success");
    router.refresh();
  }

  async function removeAvatar() {
    setUploadingAvatar(true);
    const { error: updateErr } = await supabase.from("user_profiles").update({ avatar_url: null }).eq("id", userId);
    setUploadingAvatar(false);
    if (updateErr) {
      toast.show(updateErr.message, "error");
      return;
    }
    setAvatar(null);
    router.refresh();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ first_name: first || null, last_name: last || null, display_name: display || null, phone: phoneValue || null })
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
    <div className="max-w-md space-y-4 rounded-xl border border-border bg-surface p-4">
      <div>
        <label className="block text-sm font-medium text-slate">Photo</label>
        <p className="mt-0.5 text-xs text-muted">Shown next to your name on internal messages and your profile.</p>
        <div className="mt-2 flex items-center gap-3">
          <Avatar name={display || `${first} ${last}`.trim()} url={avatar} size="lg" />
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent">
              <UploadCloud size={13} />
              {uploadingAvatar ? "Uploading..." : avatar ? "Replace photo" : "Upload photo"}
              <input
                type="file"
                accept="image/*"
                disabled={uploadingAvatar}
                onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
                className="sr-only"
              />
            </label>
            {avatar && (
              <button type="button" onClick={removeAvatar} disabled={uploadingAvatar} className="text-xs font-medium text-muted hover:text-danger">
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={save} className="space-y-4">
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
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-slate">
            Phone
          </label>
          <input
            id="phone"
            type="tel"
            value={phoneValue}
            onChange={(e) => setPhoneValue(e.target.value)}
            placeholder="(555) 123-4567"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <p className="mt-1 text-xs text-muted">Shown to clients you're the point of contact for, in their portal.</p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </form>
    </div>
  );
}
