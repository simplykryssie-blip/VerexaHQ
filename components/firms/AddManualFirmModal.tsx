"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";

const TIER_LABEL: Record<string, string> = {
  ero_ptin: "PTIN",
  service_bureau_ero: "ERO",
  service_bureau_ptin: "PTIN",
};

const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

// A firm that never touches VerexaHQ -- no invite, no signup, no workspace
// of its own -- just a record the ERO/Service Bureau keeps of who they're
// connected to, same as the invite-based flow but skipping the part where
// someone has to accept anything. Mirrors ConnectionInviteGenerator's
// tier picker for workspaces that can connect more than one kind of firm.
export function AddManualFirmModal({ workspaceId, availableRelationshipTypes }: { workspaceId: string; availableRelationshipTypes: string[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [relationshipType, setRelationshipType] = useState(availableRelationshipTypes[0] ?? "ero_ptin");
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  function reset() {
    setName("");
    setOwnerName("");
    setPhone("");
    setEmail("");
    setWebsite("");
    setAddress("");
    setNotes("");
    setRelationshipType(availableRelationshipTypes[0] ?? "ero_ptin");
  }

  async function submit() {
    if (!name.trim()) {
      toast.show("A firm name is required.", "error");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("create_manual_firm_connection", {
      p_workspace_id: workspaceId,
      p_relationship_type: relationshipType,
      p_name: name.trim(),
      p_owner_name: ownerName.trim() || undefined,
      p_phone: phone.trim() || undefined,
      p_email: email.trim() || undefined,
      p_website: website.trim() || undefined,
      p_address: address.trim() || undefined,
      p_notes: notes.trim() || undefined,
    });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Firm added", "success");
    reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
      >
        <Plus size={14} aria-hidden="true" /> Add a firm manually
      </button>

      {open && (
        <Modal title="Add a firm manually" onClose={() => setOpen(false)}>
          <p className="text-xs text-muted">
            For a firm that doesn&apos;t use VerexaHQ -- no invite needed, they won&apos;t get an account. You keep this record yourself.
          </p>
          <div className="mt-4 space-y-3">
            {availableRelationshipTypes.length > 1 && (
              <label className={labelClass}>
                Type
                <select value={relationshipType} onChange={(e) => setRelationshipType(e.target.value)} className={inputClass}>
                  {availableRelationshipTypes.map((type) => (
                    <option key={type} value={type}>
                      {TIER_LABEL[type] ?? type}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={labelClass}>
              Firm name*
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              Owner name
              <input type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputClass} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>
                Phone
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
              </label>
              <label className={labelClass}>
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              </label>
            </div>
            <label className={labelClass}>
              Website
              <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              Mailing address
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-ink">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accentHover disabled:opacity-60"
            >
              {saving ? "Adding..." : "Add firm"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
