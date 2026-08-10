"use client";

import { useState } from "react";
import { Check, Copy, Link as LinkIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function PublicLinkToggle({
  table,
  id,
  path,
  publicToken,
  initialIsPublic,
}: {
  table: "organizer_templates" | "engagement_letter_templates";
  id: string;
  path: "o" | "e";
  publicToken: string;
  initialIsPublic: boolean;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = typeof window !== "undefined" ? `${window.location.origin}/${path}/${publicToken}` : "";

  async function toggle() {
    const next = !isPublic;
    setSaving(true);
    const { error } = await supabase.from(table).update({ is_public: next }).eq("id", id);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setIsPublic(next);
    toast.show(next ? "Public link enabled" : "Public link disabled", "success");
  }

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
      <LinkIcon size={13} className="text-muted" aria-hidden="true" />
      <span className="text-xs font-medium text-slate">Public link</span>
      <button
        type="button"
        role="switch"
        aria-checked={isPublic}
        onClick={toggle}
        disabled={saving}
        className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-60 ${isPublic ? "bg-accent" : "bg-surfaceMuted"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${isPublic ? "left-[18px]" : "left-0.5"}`} />
      </button>
      {isPublic && (
        <button type="button" onClick={copyLink} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
          {copied ? (
            <>
              <Check size={12} /> Copied
            </>
          ) : (
            <>
              <Copy size={12} /> Copy link
            </>
          )}
        </button>
      )}
    </div>
  );
}
