"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

export type DnsRecord = { record: string; name: string; type: string; ttl: string; status: string; value: string; priority?: number };

type EmailDomain = {
  domain: string;
  status: "pending" | "verified" | "failed";
  dns_records: DnsRecord[];
  from_local_part: string;
} | null;

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "warning",
  verified: "success",
  failed: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending verification",
  verified: "Verified",
  failed: "Verification failed",
};

export function EmailDomainCard({ emailDomain }: { emailDomain: EmailDomain }) {
  const router = useRouter();
  const toast = useToast();
  const [domainInput, setDomainInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addDomain(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!domainInput.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/email-domain/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainInput.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not add domain.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add domain.");
    } finally {
      setSubmitting(false);
    }
  }

  async function checkVerification() {
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/email-domain/verify", { method: "POST" });
      const data = (await res.json()) as { error?: string; domain?: { status: string } };
      if (!res.ok) throw new Error(data.error ?? "Could not check verification.");
      if (data.domain?.status === "verified") {
        toast.show("Domain verified -- emails now send from your own domain.", "success");
      } else {
        toast.show("Not verified yet -- DNS changes can take a few minutes to a few hours to propagate.", "info");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check verification.");
    } finally {
      setVerifying(false);
    }
  }

  async function remove() {
    setRemoving(true);
    try {
      const res = await fetch("/api/email-domain/disconnect", { method: "POST" });
      if (!res.ok) throw new Error();
      toast.show("Sending domain removed -- emails will send from verexahq.com again.", "success");
      router.refresh();
    } catch {
      toast.show("Couldn't remove the sending domain.", "error");
    } finally {
      setRemoving(false);
    }
  }

  if (!emailDomain) {
    return (
      <div className="rounded-2xl border border-border bg-surface shadow-soft p-5">
        <p className="text-sm font-medium text-ink">Sending domain</p>
        <p className="mt-1 text-xs text-muted">
          Verify your own domain so client emails come from <span className="font-mono">notifications@yourfirm.com</span> instead of{" "}
          <span className="font-mono">verexahq.com</span>.
        </p>
        <form onSubmit={addDomain} className="mt-3 flex gap-2">
          <input
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            placeholder="yourfirm.com"
            className="flex-1 rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={submitting || !domainInput.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {submitting ? "Adding..." : "Add domain"}
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">Sending domain</p>
          <p className="text-xs text-muted">
            {emailDomain.status === "verified"
              ? `Client emails send from ${emailDomain.from_local_part}@${emailDomain.domain}`
              : emailDomain.domain}
          </p>
        </div>
        <Badge tone={STATUS_TONE[emailDomain.status]}>{STATUS_LABEL[emailDomain.status]}</Badge>
      </div>

      {emailDomain.status !== "verified" && emailDomain.dns_records.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-ink">Add these DNS records at your domain registrar, then check verification:</p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-surfaceMuted text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                  {emailDomain.dns_records.some((r) => r.priority !== undefined) && <th className="px-3 py-2 font-medium">Priority</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {emailDomain.dns_records.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-mono">{r.type}</td>
                    <td className="max-w-[180px] truncate px-3 py-2 font-mono" title={r.name}>{r.name}</td>
                    <td className="max-w-[260px] truncate px-3 py-2 font-mono" title={r.value}>{r.value}</td>
                    {emailDomain.dns_records.some((rec) => rec.priority !== undefined) && (
                      <td className="px-3 py-2 font-mono">{r.priority ?? ""}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            DNS changes can take a few minutes to a few hours to propagate before verification succeeds. This is
            also checked automatically every 15 minutes -- no need to keep clicking Check verification.
          </p>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex gap-2">
        {emailDomain.status !== "verified" && (
          <button
            type="button"
            onClick={checkVerification}
            disabled={verifying}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {verifying ? "Checking..." : "Check verification"}
          </button>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={removing}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:bg-surfaceMuted disabled:opacity-60"
        >
          {removing ? "Removing..." : "Remove"}
        </button>
      </div>
    </div>
  );
}
