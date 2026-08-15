"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, Link as LinkIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function PublicLinkToggle({
  table,
  id,
  path,
  publicToken,
  status,
  initialIsPublic,
  initialRequiresPortalSignup,
}: {
  table: "organizer_templates" | "engagement_letter_templates";
  id: string;
  path: "o" | "e";
  publicToken: string;
  status: string;
  initialIsPublic: boolean;
  initialRequiresPortalSignup: boolean;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [requiresSignup, setRequiresSignup] = useState(initialRequiresPortalSignup);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // The public link RPCs (get_public_organizer_template /
  // get_public_engagement_letter_template) require status = 'published' in
  // addition to is_public -- a draft template's link 404s with no
  // explanation otherwise. Block turning it on from here, and surface it
  // clearly if it's already on for a template that's since gone back to draft.
  const isPublishable = status === "published";
  const isPublic_butNotPublished = isPublic && !isPublishable;

  const url = typeof window !== "undefined" ? `${window.location.origin}/${path}/${publicToken}` : "";

  async function toggle() {
    if (!isPublic && !isPublishable) {
      toast.show("Publish this template before turning on its public link.", "error");
      return;
    }
    const next = !isPublic;
    setSaving(true);
    // Turning the public link off also turns off portal-signup -- the check
    // constraint requires it, and there's no meaning to "requires signup"
    // on a link that no longer exists.
    const { error } = await supabase
      .from(table)
      .update(next ? { is_public: next } : { is_public: next, requires_portal_signup: false })
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setIsPublic(next);
    if (!next) setRequiresSignup(false);
    toast.show(next ? "Public link enabled" : "Public link disabled", "success");
  }

  async function toggleSignup() {
    const next = !requiresSignup;
    setSaving(true);
    const { error } = await supabase.from(table).update({ requires_portal_signup: next }).eq("id", id);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setRequiresSignup(next);
    toast.show(next ? "Now requires a portal account to complete" : "No longer requires a portal account", "success");
  }

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
      <LinkIcon size={13} className="text-muted" aria-hidden="true" />
      <span className="text-xs font-medium text-slate">Public link</span>
      <button
        type="button"
        role="switch"
        aria-checked={isPublic}
        onClick={toggle}
        disabled={saving || (!isPublic && !isPublishable)}
        title={!isPublic && !isPublishable ? "Publish this template first -- a draft's public link won't work." : undefined}
        className={`relative h-5 w-9 shrink-0 rounded-full border transition disabled:opacity-60 ${isPublic ? "border-accent bg-accent" : "border-border bg-border"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${isPublic ? "left-[18px]" : "left-0.5"}`} />
      </button>
      {isPublic_butNotPublished && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-danger" title="This template is a draft, so its public link 404s for visitors. Publish it to make the link work.">
          <AlertTriangle size={12} /> Link is dead -- still a draft
        </span>
      )}
      {isPublic && (
        <>
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
          <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
          <span className="text-xs font-medium text-slate">Requires a portal account</span>
          <button
            type="button"
            role="switch"
            aria-checked={requiresSignup}
            onClick={toggleSignup}
            disabled={saving}
            title="When on, the visitor creates a real client portal account right in the same form -- no staff invite, no waiting."
            className={`relative h-5 w-9 shrink-0 rounded-full border transition disabled:opacity-60 ${requiresSignup ? "border-accent bg-accent" : "border-border bg-border"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${requiresSignup ? "left-[18px]" : "left-0.5"}`} />
          </button>
        </>
      )}
    </div>
  );
}
