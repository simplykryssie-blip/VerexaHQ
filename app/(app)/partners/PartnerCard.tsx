"use client";

import { useState } from "react";
import { Phone, Mail, Globe, MapPin, NotebookPen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

function ContactLine({ icon: Icon, children }: { icon: typeof Phone; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-slate">
      <Icon size={14} className="shrink-0 text-muted" aria-hidden="true" />
      {children}
    </p>
  );
}

export function PartnerCard({
  connectionId,
  name,
  statusBadge,
  phone,
  email,
  website,
  mailingAddress,
  initialNotes,
}: {
  connectionId: string;
  name: string;
  statusBadge: React.ReactNode;
  phone: string | null;
  email: string | null;
  website: string | null;
  mailingAddress: string | null;
  initialNotes: string | null;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function saveNotes() {
    setSaving(true);
    const { error } = await supabase.from("firm_connections").update({ notes: notes.trim() || null }).eq("id", connectionId);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setDirty(false);
    toast.show("Notes saved", "success");
  }

  const hasContactInfo = phone || email || website || mailingAddress;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-base font-semibold text-ink">{name}</h3>
        {statusBadge}
      </div>

      <div className="mt-3 space-y-1.5">
        {hasContactInfo ? (
          <>
            {phone && <ContactLine icon={Phone}>{phone}</ContactLine>}
            {email && (
              <ContactLine icon={Mail}>
                <a href={`mailto:${email}`} className="hover:text-accent hover:underline">
                  {email}
                </a>
              </ContactLine>
            )}
            {website && (
              <ContactLine icon={Globe}>
                <a href={website} target="_blank" rel="noreferrer" className="hover:text-accent hover:underline">
                  {website}
                </a>
              </ContactLine>
            )}
            {mailingAddress && <ContactLine icon={MapPin}>{mailingAddress}</ContactLine>}
          </>
        ) : (
          <p className="text-sm text-muted">This partner hasn&apos;t filled in their business contact info yet.</p>
        )}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          <NotebookPen size={12} aria-hidden="true" />
          Your notes on this partner
        </label>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setDirty(true);
          }}
          rows={2}
          placeholder="Specialty, agreement terms, anything worth remembering about this partner..."
          className="mt-1.5 w-full resize-y rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {dirty && (
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={saveNotes}
              disabled={saving}
              className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save notes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
