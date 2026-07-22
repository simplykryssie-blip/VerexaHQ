"use client";

import { Mail, Phone, Briefcase, Building2, Link2, ShieldCheck, Star, User, X } from "lucide-react";
import type { Contact } from "@/lib/types";

export default function ContactDetailModal({
  contact,
  isPrimary,
  relationshipType,
  portalAccess,
  contactTypeLabel,
  accountName,
  onClose,
}: {
  contact: Contact;
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
}) {
  const fullName = [contact.first_name, contact.middle_name, contact.last_name].filter(Boolean).join(" ");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4 py-8">
      <div className="bg-white rounded-2xl border border-line shadow-lg w-full max-w-md max-h-full overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-slab text-lg font-bold text-ink">{fullName || "Contact"}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-ink rounded-xl p-1.5 hover:bg-paper transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-[#108A64] text-xs font-semibold px-2.5 py-1 mb-4">
          {isPrimary && <Star size={12} />} {contactTypeLabel}
        </span>

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

        <div className="flex justify-end pt-5">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold py-2.5 px-4 rounded-xl border border-line text-ink hover:bg-paper"
          >
            Close
          </button>
        </div>
      </div>
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
