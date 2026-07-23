"use client";

import { useState } from "react";
import { Mail, Phone, Briefcase, Building2, Link2, Pencil, ShieldCheck, Star, User, X } from "lucide-react";
import type { Contact } from "@/lib/types";
import { supabase } from "@/lib/supabase";

export default function ContactDetailModal({
  contact,
  linkId,
  isPrimary,
  relationshipType,
  portalAccess,
  contactTypeLabel,
  accountName,
  onClose,
  onSaved,
}: {
  contact: Contact;
  // account_contacts.id for this specific relationship — needed so an edit
  // here can also keep the link's own portal_access flag in sync, the same
  // way ClientModal's save flow does.
  linkId: string;
  isPrimary: boolean;
  relationshipType: string | null;
  portalAccess: boolean;
  // Derived from the account_contacts link's parent-account context (e.g.
  // "Primary Business Contact" / "Business Contact") — never from the
  // contact person's own client/account type, since this person is not a
  // separate client account.
  contactTypeLabel: string;
  accountName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    first_name: contact.first_name ?? "",
    middle_name: contact.middle_name ?? "",
    last_name: contact.last_name ?? "",
    personal_email: contact.personal_email ?? "",
    personal_phone: contact.personal_phone ?? "",
    occupation: contact.occupation ?? "",
    portal_access: portalAccess,
  });

  const fullName = [contact.first_name, contact.middle_name, contact.last_name].filter(Boolean).join(" ");

  async function handleSave() {
    setSaving(true);
    setError(null);
    const { error: contactError } = await supabase
      .from("contacts")
      .update({
        first_name: form.first_name,
        middle_name: form.middle_name || null,
        last_name: form.last_name,
        personal_email: form.personal_email || null,
        personal_phone: form.personal_phone || null,
        occupation: form.occupation || null,
        portal_access: form.portal_access,
      })
      .eq("id", contact.id);
    if (contactError) {
      setSaving(false);
      setError(contactError.message);
      return;
    }
    const { error: linkError } = await supabase
      .from("account_contacts")
      .update({ portal_access: form.portal_access })
      .eq("id", linkId);
    if (linkError) {
      setSaving(false);
      setError(`Contact updated, but the portal-access link failed to update: ${linkError.message}`);
      return;
    }
    setSaving(false);
    setEditing(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4 py-8">
      <div className="bg-white rounded-2xl border border-line shadow-lg w-full max-w-md max-h-full overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-slab text-lg font-bold text-ink">{editing ? "Edit Contact" : fullName || "Contact"}</h3>
          <div className="flex items-center gap-1">
            {!editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="Edit contact"
                className="text-muted hover:text-ink rounded-xl p-1.5 hover:bg-paper transition-colors"
              >
                <Pencil size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-muted hover:text-ink rounded-xl p-1.5 hover:bg-paper transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {!editing && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-[#108A64] text-xs font-semibold px-2.5 py-1 mb-4">
            {isPrimary && <Star size={12} />} {contactTypeLabel}
          </span>
        )}

        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <input
                placeholder="First name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="contact-input col-span-1"
              />
              <input
                placeholder="Middle"
                value={form.middle_name}
                onChange={(e) => setForm({ ...form, middle_name: e.target.value })}
                className="contact-input col-span-1"
              />
              <input
                placeholder="Last name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className="contact-input col-span-1"
              />
            </div>
            <input
              type="email"
              placeholder="Email"
              value={form.personal_email}
              onChange={(e) => setForm({ ...form, personal_email: e.target.value })}
              className="contact-input w-full"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={form.personal_phone}
              onChange={(e) => setForm({ ...form, personal_phone: e.target.value })}
              className="contact-input w-full"
            />
            <input
              placeholder="Occupation"
              value={form.occupation}
              onChange={(e) => setForm({ ...form, occupation: e.target.value })}
              className="contact-input w-full"
            />
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.portal_access}
                onChange={(e) => setForm({ ...form, portal_access: e.target.checked })}
                className="h-4 w-4 accent-[#108A64]"
              />
              Portal access
            </label>
            {error && <p className="text-xs text-brick">{error}</p>}
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <DetailRow icon={Building2} label="Business/account name" value={accountName} />
            <DetailRow icon={Link2} label="Relationship type" value={relationshipType} />
            <DetailRow icon={Star} label="Primary contact" value={isPrimary ? "Yes" : "No"} />
            <DetailRow icon={ShieldCheck} label="Portal access" value={portalAccess ? "Enabled" : "Disabled"} />
            <DetailRow icon={User} label="First name" value={contact.first_name} />
            <DetailRow icon={User} label="Middle name" value={contact.middle_name} />
            <DetailRow icon={User} label="Last name" value={contact.last_name} />
            <DetailRow icon={Mail} label="Email" value={contact.personal_email} />
            <DetailRow icon={Phone} label="Phone" value={contact.personal_phone} />
            <DetailRow icon={Briefcase} label="Occupation" value={contact.occupation} />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-5">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                  setForm({
                    first_name: contact.first_name ?? "",
                    middle_name: contact.middle_name ?? "",
                    last_name: contact.last_name ?? "",
                    personal_email: contact.personal_email ?? "",
                    personal_phone: contact.personal_phone ?? "",
                    occupation: contact.occupation ?? "",
                    portal_access: portalAccess,
                  });
                }}
                className="text-sm font-semibold py-2.5 px-4 rounded-xl border border-line text-ink hover:bg-paper"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="text-sm font-semibold py-2.5 px-4 rounded-xl bg-[#108A64] text-white hover:bg-[#0d7555] disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-semibold py-2.5 px-4 rounded-xl border border-line text-ink hover:bg-paper"
            >
              Close
            </button>
          )}
        </div>
      </div>
      <style jsx global>{`
        .contact-input {
          border: 1px solid #ddeae5;
          border-radius: 0.75rem;
          padding: 0.6rem 0.75rem;
          font-size: 0.875rem;
          background: #fff;
          outline: none;
        }
        .contact-input:focus {
          border-color: #108a64;
          box-shadow: 0 0 0 3px rgba(16, 138, 100, 0.12);
        }
      `}</style>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-muted">
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{label}</div>
        <div className="text-sm text-ink break-anywhere">{value || "—"}</div>
      </div>
    </div>
  );
}
