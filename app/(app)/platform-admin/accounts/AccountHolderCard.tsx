"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Phone, Pencil, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { WORKSPACE_STATUS_TONE } from "@/lib/workspaceStatus";

const STATUS_TONE: Record<string, BadgeTone> = {
  active: "success",
  trialing: "success",
  past_due: "warning",
  unpaid: "danger",
  canceled: "neutral",
};

function money(cents: number | null) {
  if (cents === null) return "--";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type AccountHolderRow = {
  workspace_id: string;
  workspace_name: string;
  workspace_status: string;
  workspace_created_at: string;
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  plan_name: string | null;
  stripe_status: string | null;
  seat_count: number | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  last_payment_amount_cents: number | null;
  last_payment_at: string | null;
};

// Deliberately just name/email/phone/company -- this is Verexa's own
// customer contact record, not the tax-client intake form
// (NewClientButton/create_client), so no SSN/DOB/ITIN/EIN belongs here even
// as a future addition. See update_platform_account_holder's migration.
export function AccountHolderCard({ row }: { row: AccountHolderRow }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState(row.first_name ?? "");
  const [lastName, setLastName] = useState(row.last_name ?? "");
  const [phone, setPhone] = useState(row.phone ?? "");
  const [companyName, setCompanyName] = useState(row.workspace_name);
  const [email, setEmail] = useState(row.email);

  const fullName = row.display_name ?? ([row.first_name, row.last_name].filter(Boolean).join(" ") || "--");

  async function save() {
    setSaving(true);

    const { error: rpcError } = await supabase.rpc("update_platform_account_holder", {
      p_workspace_id: row.workspace_id,
      p_user_id: row.user_id,
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim(),
      p_phone: phone.trim(),
      p_company_name: companyName.trim(),
    });
    if (rpcError) {
      setSaving(false);
      toast.show(rpcError.message, "error");
      return;
    }

    if (email.trim().toLowerCase() !== row.email.toLowerCase()) {
      const res = await fetch("/api/platform-admin/accounts/update-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: row.user_id, email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setSaving(false);
        toast.show(data?.error ?? "Could not update email", "error");
        return;
      }
    }

    setSaving(false);
    setEditing(false);
    toast.show("Account holder updated", "success");
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1">
          {editing ? (
            <div className="grid max-w-xl grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted" htmlFor={`first-${row.user_id}`}>
                  First name
                </label>
                <input
                  id={`first-${row.user_id}`}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted" htmlFor={`last-${row.user_id}`}>
                  Last name
                </label>
                <input
                  id={`last-${row.user_id}`}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-2.5 py-1.5 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted" htmlFor={`company-${row.user_id}`}>
                  Firm name
                </label>
                <input
                  id={`company-${row.user_id}`}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted" htmlFor={`email-${row.user_id}`}>
                  Email
                </label>
                <input
                  id={`email-${row.user_id}`}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted" htmlFor={`phone-${row.user_id}`}>
                  Phone
                </label>
                <input
                  id={`phone-${row.user_id}`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-2.5 py-1.5 text-sm"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setFirstName(row.first_name ?? "");
                    setLastName(row.last_name ?? "");
                    setPhone(row.phone ?? "");
                    setCompanyName(row.workspace_name);
                    setEmail(row.email);
                  }}
                  disabled={saving}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <p className="font-display text-base font-semibold text-ink">{fullName}</p>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-muted hover:text-accent"
                  aria-label="Edit contact info"
                >
                  <Pencil size={13} />
                </button>
              </div>
              <p className="text-sm text-slate">{row.workspace_name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  <Mail size={12} /> {row.email}
                </span>
                {row.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone size={12} /> {row.phone}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {editing ? (
            <button type="button" onClick={() => setEditing(false)} className="text-muted hover:text-ink" aria-label="Close edit form">
              <X size={16} />
            </button>
          ) : (
            <>
              <Badge tone={WORKSPACE_STATUS_TONE[row.workspace_status] ?? "neutral"} className="capitalize">
                {row.workspace_status}
              </Badge>
              <Link href={`/platform-admin/${row.workspace_id}`} className="text-xs font-medium text-accent hover:underline">
                View workspace &rarr;
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Plan</p>
          <p className="mt-0.5 text-slate">{row.plan_name ?? "No plan"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Subscription</p>
          <p className="mt-0.5">
            {row.stripe_status ? (
              <Badge tone={STATUS_TONE[row.stripe_status] ?? "neutral"} className="capitalize">
                {row.stripe_status}
              </Badge>
            ) : (
              <span className="text-muted">--</span>
            )}
            {row.cancel_at_period_end && <span className="ml-1.5 text-xs text-warning">(cancelling)</span>}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Seats</p>
          <p className="mt-0.5 text-slate">{row.seat_count ?? "--"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Renews</p>
          <p className="mt-0.5 text-slate">{row.current_period_end ? new Date(row.current_period_end).toLocaleDateString() : "--"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Last payment</p>
          <p className="mt-0.5 text-slate">
            {money(row.last_payment_amount_cents)}
            {row.last_payment_at && <span className="text-muted"> -- {new Date(row.last_payment_at).toLocaleDateString()}</span>}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Customer since</p>
          <p className="mt-0.5 text-slate">{new Date(row.workspace_created_at).toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
}
