"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone } from "lucide-react";
import { useToast } from "@/components/Toast";
import { ClientSearchField, clientSearchResultLabel, type ClientSearchResult } from "@/components/clients/ClientSearchField";

export type PhoneNumberRow = {
  id: string;
  phone_number: string;
  is_free: boolean;
  status: string;
  assigned_client: ClientSearchResult | null;
};

function formatPhone(e164: string) {
  const digits = e164.replace(/^\+1/, "");
  if (digits.length !== 10) return e164;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function AssignPicker({ workspaceId, numberId, current }: { workspaceId: string; numberId: string; current: ClientSearchResult | null }) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  async function assign(client: ClientSearchResult | null) {
    setSaving(true);
    try {
      const res = await fetch("/api/phone-numbers/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumberId: numberId, clientId: client?.id ?? null }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? "Could not update assignment", "error");
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return <ClientSearchField workspaceId={workspaceId} selected={current} onSelect={assign} placeholder="Search a client..." autoFocus />;
  }

  return (
    <button type="button" onClick={() => setEditing(true)} disabled={saving} className="text-xs font-medium text-accent hover:underline disabled:opacity-60">
      {current ? clientSearchResultLabel(current) : "Unassigned -- click to assign"}
    </button>
  );
}

export function PhoneNumbersManager({ workspaceId, isOwner, numbers }: { workspaceId: string; isOwner: boolean; numbers: PhoneNumberRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [provisioning, setProvisioning] = useState(false);

  async function getNumber() {
    setProvisioning(true);
    try {
      const res = await fetch("/api/phone-numbers/provision", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok || data.configured === false) {
        toast.show(data.error ?? data.reason ?? "Could not get a number", "error");
        return;
      }
      toast.show(`Got ${formatPhone(data.phoneNumber.phone_number)}`, "success");
      router.refresh();
    } catch {
      toast.show("Could not get a number", "error");
    } finally {
      setProvisioning(false);
    }
  }

  return (
    <div>
      {numbers.length === 0 ? (
        <p className="text-sm text-muted">No phone numbers yet -- your first one is free.</p>
      ) : (
        <div className="divide-y divide-border">
          {numbers.map((n) => (
            <div key={n.id} className="flex items-center gap-3 py-2.5">
              <Phone size={14} className="shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {formatPhone(n.phone_number)}
                  {n.is_free && <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-muted">Free</span>}
                </p>
                {isOwner ? (
                  <AssignPicker workspaceId={workspaceId} numberId={n.id} current={n.assigned_client} />
                ) : (
                  <p className="text-xs text-muted">{n.assigned_client ? clientSearchResultLabel(n.assigned_client) : "Unassigned"}</p>
                )}
              </div>
              <span className={`shrink-0 text-xs font-medium ${n.status === "paused" ? "text-danger" : "text-success"}`}>
                {n.status === "paused" ? "Paused -- balance too low" : "Active"}
              </span>
            </div>
          ))}
        </div>
      )}
      {isOwner && (
        <button
          type="button"
          onClick={getNumber}
          disabled={provisioning}
          className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:bg-surfaceMuted disabled:opacity-60"
        >
          {provisioning ? "Getting a number..." : numbers.length === 0 ? "Get your free number" : "Get another number -- $4.99/mo"}
        </button>
      )}
    </div>
  );
}
