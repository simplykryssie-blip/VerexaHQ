"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { CopyIconButton, CopyRecordButton } from "@/components/CopyIconButton";
import { formatDnsRecordForCopy } from "@/lib/dns/formatDnsRecordForCopy";

export type DnsRecord = { record: string; name: string; type: string; ttl: string; status: string; value: string; priority?: number };

export type EmailDomain = {
  id: string;
  domain: string;
  status: "pending" | "verified" | "failed";
  dns_records: DnsRecord[];
  from_local_part: string;
  is_primary: boolean;
};

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

/**
 * canAddAnother is true for ERO Office / Service Bureau workspaces
 * (canUseMultipleSendingDomains) -- every other workspace type still gets
 * at most one domain, same as before this feature existed. The "Primary"
 * badge and "Set as primary" control only render once a workspace
 * actually has more than one domain; a single-domain workspace sees the
 * exact same card it always did.
 */
export function EmailDomainCard({ emailDomains, canAddAnother }: { emailDomains: EmailDomain[]; canAddAnother: boolean }) {
  const router = useRouter();
  const anyUnverified = emailDomains.some((d) => d.status !== "verified");

  // The cron sweep (app/api/cron/verify-pending-email-domains) can flip a
  // domain to verified in the background with nobody clicking anything --
  // this page has no other way to notice that happened short of a manual
  // reload. Polling router.refresh() only re-reads this page's own
  // Supabase query (no Resend API call, no side effects), so it's safe to
  // run every 30s while any domain here is still unverified.
  useEffect(() => {
    if (!anyUnverified) return;
    const interval = setInterval(() => router.refresh(), 30000);
    return () => clearInterval(interval);
  }, [anyUnverified, router]);

  if (emailDomains.length === 0) {
    return <AddDomainForm />;
  }

  const showPrimaryControls = emailDomains.length > 1;

  return (
    <div className="space-y-3">
      {emailDomains.map((domain) => (
        <SendingDomainCard key={domain.id} domain={domain} showPrimaryControls={showPrimaryControls} />
      ))}
      {canAddAnother && <AddDomainForm compact />}
    </div>
  );
}

function AddDomainForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [domainInput, setDomainInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
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
      setDomainInput("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add domain.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={compact ? "rounded-2xl border border-dashed border-border bg-surface p-4" : "rounded-2xl border border-border bg-surface shadow-soft p-5"}>
      {compact ? (
        <p className="text-xs font-medium text-ink">Add another sending domain</p>
      ) : (
        <>
          <p className="text-sm font-medium text-ink">Sending domain</p>
          <p className="mt-1 text-xs text-muted">
            Verify your own domain so client emails come from <span className="font-mono">notifications@yourfirm.com</span> instead of{" "}
            <span className="font-mono">verexahq.com</span>.
          </p>
        </>
      )}
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

function SendingDomainCard({ domain, showPrimaryControls }: { domain: EmailDomain; showPrimaryControls: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [settingPrimary, setSettingPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkVerification() {
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/email-domain/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId: domain.id }),
      });
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
      const res = await fetch("/api/email-domain/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId: domain.id }),
      });
      if (!res.ok) throw new Error();
      toast.show("Sending domain removed.", "success");
      router.refresh();
    } catch {
      toast.show("Couldn't remove the sending domain.", "error");
    } finally {
      setRemoving(false);
    }
  }

  async function setPrimary() {
    setSettingPrimary(true);
    try {
      const res = await fetch("/api/email-domain/set-primary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId: domain.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not set primary domain.");
      toast.show(`${domain.domain} is now the primary sending domain.`, "success");
      router.refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Could not set primary domain.", "error");
    } finally {
      setSettingPrimary(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">Sending domain</p>
          <p className="text-xs text-muted">
            {domain.status === "verified" ? `Client emails send from ${domain.from_local_part}@${domain.domain}` : domain.domain}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {showPrimaryControls && domain.is_primary && <Badge tone="accent">Primary</Badge>}
          <Badge tone={STATUS_TONE[domain.status]}>{STATUS_LABEL[domain.status]}</Badge>
        </div>
      </div>

      {domain.status !== "verified" && domain.dns_records.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-ink">Add these DNS records at your domain registrar, then check verification:</p>
          <div className="mt-2 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-surfaceMuted text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                  {domain.dns_records.some((r) => r.priority !== undefined) && <th className="px-3 py-2 font-medium">Priority</th>}
                  <th className="px-3 py-2 font-medium">
                    <span className="sr-only">Copy</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {domain.dns_records.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-mono">
                      <div className="flex items-center gap-1">
                        <span>{r.type}</span>
                        <CopyIconButton value={r.type} label="Copy DNS record type" />
                      </div>
                    </td>
                    <td className="max-w-[180px] px-3 py-2 font-mono">
                      <div className="flex items-center gap-1">
                        <span className="truncate" title={r.name}>{r.name}</span>
                        <CopyIconButton value={r.name} label="Copy DNS host/name" />
                      </div>
                    </td>
                    <td className="max-w-[260px] px-3 py-2 font-mono">
                      <div className="flex items-center gap-1">
                        <span className="truncate" title={r.value}>{r.value}</span>
                        <CopyIconButton value={r.value} label="Copy DNS value" />
                      </div>
                    </td>
                    {domain.dns_records.some((rec) => rec.priority !== undefined) && (
                      <td className="px-3 py-2 font-mono">
                        {r.priority !== undefined && (
                          <div className="flex items-center gap-1">
                            <span>{r.priority}</span>
                            <CopyIconButton value={String(r.priority)} label="Copy DNS priority" />
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <CopyRecordButton text={formatDnsRecordForCopy(r)} />
                    </td>
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
        {domain.status !== "verified" && (
          <button
            type="button"
            onClick={checkVerification}
            disabled={verifying}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {verifying ? "Checking..." : "Check verification"}
          </button>
        )}
        {showPrimaryControls && domain.status === "verified" && !domain.is_primary && (
          <button
            type="button"
            onClick={setPrimary}
            disabled={settingPrimary}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:bg-surfaceMuted disabled:opacity-60"
          >
            {settingPrimary ? "Setting..." : "Set as primary"}
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
