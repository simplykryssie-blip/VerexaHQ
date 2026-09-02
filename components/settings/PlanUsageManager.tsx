"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

type BucketMetric = { granted: number; consumed: number; prepaidBalance: number };
type StorageMetric = { granted: number; prepaidBalance: number; usedGb: number };

const EMAIL_PACKS = [
  { units: 1000, label: "1,000 emails" },
  { units: 5000, label: "5,000 emails" },
];
const SMS_PACKS = [
  { units: 250, label: "250 texts" },
  { units: 1000, label: "1,000 texts" },
];
const STORAGE_PACKS = [
  { units: 10, label: "10 GB" },
  { units: 50, label: "50 GB" },
];

function centsToDollars(cents: number) {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

function UsageBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const tone = pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-amber" : "bg-accent";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surfaceMuted">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function PlanUsageManager({
  isOwner,
  emailRateCents,
  smsRateCents,
  storageRateCents,
  email,
  sms,
  storage,
}: {
  isOwner: boolean;
  emailRateCents: number;
  smsRateCents: number;
  storageRateCents: number;
  email: BucketMetric;
  sms: BucketMetric;
  storage: StorageMetric;
}) {
  const toast = useToast();
  const [purchasing, setPurchasing] = useState<string | null>(null);

  async function buy(resourceType: "email" | "sms" | "storage", units: number) {
    const key = `${resourceType}-${units}`;
    setPurchasing(key);
    try {
      const res = await fetch("/api/billing/usage-topup-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceType, units }),
      });
      const data = await res.json();
      if (!res.ok || data.configured === false) {
        toast.show(data.error ?? data.reason ?? "Could not start checkout", "error");
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.show("Could not start checkout", "error");
    } finally {
      setPurchasing(null);
    }
  }

  const emailFreeLeft = Math.max(0, email.granted - email.consumed);
  const smsFreeLeft = Math.max(0, sms.granted - sms.consumed);
  const storageCapacityGb = storage.granted + storage.prepaidBalance;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-ink">Email</p>
          <p className="text-xs text-muted">
            {email.consumed.toLocaleString()} / {email.granted.toLocaleString()} free used
            {email.prepaidBalance > 0 ? ` -- ${email.prepaidBalance.toLocaleString()} prepaid remaining` : ""}
          </p>
        </div>
        <div className="mt-1.5">
          <UsageBar used={email.consumed} total={email.granted} />
        </div>
        {emailFreeLeft === 0 && email.prepaidBalance === 0 && (
          <p className="mt-1.5 text-xs text-danger">Free amount used up -- sending is paused until you buy a top-up.</p>
        )}
        {isOwner && (
          <div className="mt-2 flex gap-2">
            {EMAIL_PACKS.map((p) => (
              <button
                key={p.units}
                type="button"
                onClick={() => buy("email", p.units)}
                disabled={purchasing !== null}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:bg-surfaceMuted disabled:opacity-60"
              >
                {purchasing === `email-${p.units}` ? "Starting checkout..." : `Buy ${p.label} -- $${centsToDollars(p.units * emailRateCents)}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-ink">Text messages</p>
          <p className="text-xs text-muted">
            {sms.consumed.toLocaleString()} / {sms.granted.toLocaleString()} free used
            {sms.prepaidBalance > 0 ? ` -- ${sms.prepaidBalance.toLocaleString()} prepaid remaining` : ""}
          </p>
        </div>
        <div className="mt-1.5">
          <UsageBar used={sms.consumed} total={sms.granted} />
        </div>
        {smsFreeLeft === 0 && sms.prepaidBalance === 0 && (
          <p className="mt-1.5 text-xs text-danger">Free amount used up -- sending is paused until you buy a top-up.</p>
        )}
        {isOwner && (
          <div className="mt-2 flex gap-2">
            {SMS_PACKS.map((p) => (
              <button
                key={p.units}
                type="button"
                onClick={() => buy("sms", p.units)}
                disabled={purchasing !== null}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:bg-surfaceMuted disabled:opacity-60"
              >
                {purchasing === `sms-${p.units}` ? "Starting checkout..." : `Buy ${p.label} -- $${centsToDollars(p.units * smsRateCents)}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-ink">Storage</p>
          <p className="text-xs text-muted">
            {storage.usedGb.toFixed(1)} / {storageCapacityGb.toLocaleString()} GB used
            {storage.prepaidBalance > 0 ? ` -- includes ${storage.prepaidBalance.toLocaleString()} GB purchased` : ""}
          </p>
        </div>
        <div className="mt-1.5">
          <UsageBar used={storage.usedGb} total={storageCapacityGb} />
        </div>
        {storage.usedGb >= storageCapacityGb && (
          <p className="mt-1.5 text-xs text-danger">Storage ceiling reached -- uploads are paused until you buy more.</p>
        )}
        {isOwner && (
          <div className="mt-2 flex gap-2">
            {STORAGE_PACKS.map((p) => (
              <button
                key={p.units}
                type="button"
                onClick={() => buy("storage", p.units)}
                disabled={purchasing !== null}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:bg-surfaceMuted disabled:opacity-60"
              >
                {purchasing === `storage-${p.units}` ? "Starting checkout..." : `Buy ${p.label} -- $${centsToDollars(p.units * storageRateCents)}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {!isOwner && <p className="text-xs text-muted">Only the workspace owner can purchase top-ups.</p>}
    </div>
  );
}
