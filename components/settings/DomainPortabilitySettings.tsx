"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Globe2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useAal2Gate } from "@/components/mfa/Aal2GateProvider";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/EmptyState";

export type PortableEmailDomain = { id: string; domain: string; status: "pending" | "verified" | "failed" };
export type PortableWebsiteDomain = { websiteId: string; websiteName: string; domain: string; verified: boolean };

const EMAIL_STATUS_TONE: Record<string, BadgeTone> = { pending: "warning", verified: "success", failed: "danger" };
const EMAIL_STATUS_LABEL: Record<string, string> = { pending: "Pending verification", verified: "Verified", failed: "Verification failed" };

// The one place a customer-owned domain can always be released from --
// reachable even when this workspace is suspended/archived (see
// isSuspensionRecoveryPath), and deliberately read-only otherwise: no "add
// a domain" here, since adding a new resource while non-operational isn't
// meant to work, only getting your own domain back is. Releasing just
// frees Verexa's own configuration claim on the domain (and, for email,
// removes the Resend-side record) -- the domain itself was always the
// customer's; DNS is what actually determines where it points next.
export function DomainPortabilitySettings({
  emailDomains,
  websiteDomains,
}: {
  emailDomains: PortableEmailDomain[];
  websiteDomains: PortableWebsiteDomain[];
}) {
  if (emailDomains.length === 0 && websiteDomains.length === 0) {
    return <EmptyState message="No customer-owned domains are currently connected to this workspace." />;
  }

  return (
    <div className="space-y-6">
      {emailDomains.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Sending domain</p>
          <div className="mt-2 space-y-2">
            {emailDomains.map((d) => (
              <EmailDomainRow key={d.id} domain={d} />
            ))}
          </div>
        </div>
      )}
      {websiteDomains.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Website domain</p>
          <div className="mt-2 space-y-2">
            {websiteDomains.map((d) => (
              <WebsiteDomainRow key={d.websiteId} domain={d} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmailDomainRow({ domain }: { domain: PortableEmailDomain }) {
  const router = useRouter();
  const toast = useToast();
  const { handleAal2Response } = useAal2Gate();
  const [releasing, setReleasing] = useState(false);

  async function release() {
    if (!confirm(`Disconnect ${domain.domain}? Emails will stop sending from this domain, and it will be free for this or another account to reconnect.`)) return;
    setReleasing(true);
    try {
      const res = await fetch("/api/email-domain/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId: domain.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (await handleAal2Response(res, data)) return;
        throw new Error(data.error ?? "Couldn't disconnect this domain.");
      }
      toast.show(`${domain.domain} disconnected.`, "success");
      router.refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Couldn't disconnect this domain.", "error");
    } finally {
      setReleasing(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accentSoft text-accent">
          <Mail size={15} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium text-ink">{domain.domain}</p>
          <Badge tone={EMAIL_STATUS_TONE[domain.status]}>{EMAIL_STATUS_LABEL[domain.status]}</Badge>
        </div>
      </div>
      <button
        type="button"
        onClick={release}
        disabled={releasing}
        className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:bg-surfaceMuted disabled:opacity-60"
      >
        {releasing ? "Disconnecting..." : "Disconnect"}
      </button>
    </div>
  );
}

function WebsiteDomainRow({ domain }: { domain: PortableWebsiteDomain }) {
  const router = useRouter();
  const toast = useToast();
  const { handleAal2Response } = useAal2Gate();
  const [releasing, setReleasing] = useState(false);

  async function release() {
    if (!confirm(`Disconnect ${domain.domain} from "${domain.websiteName}"? Visitors on that domain will stop reaching this website, and it will be free for this or another account to reconnect.`)) return;
    setReleasing(true);
    try {
      const res = await fetch(`/api/websites/${domain.websiteId}/attach-domain`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (await handleAal2Response(res, data)) return;
        throw new Error(data.error ?? "Couldn't disconnect this domain.");
      }
      toast.show(`${domain.domain} disconnected.`, "success");
      router.refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Couldn't disconnect this domain.", "error");
    } finally {
      setReleasing(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accentSoft text-accent">
          <Globe2 size={15} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium text-ink">{domain.domain}</p>
          <p className="text-xs text-muted">
            {domain.websiteName} -- <Badge tone={domain.verified ? "success" : "warning"}>{domain.verified ? "Verified" : "Not verified"}</Badge>
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={release}
        disabled={releasing}
        className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:bg-surfaceMuted disabled:opacity-60"
      >
        {releasing ? "Disconnecting..." : "Disconnect"}
      </button>
    </div>
  );
}
