"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

type BucketMetric = { granted: number; consumed: number; prepaidBalance: number };
type StorageMetric = { granted: number; prepaidBalance: number; usedGb: number };

const MINIMUM_TOPUP_DOLLARS = 25;
const QUICK_AMOUNTS = [25, 50, 100];

const RESOURCE_UNIT_LABEL: Record<"email" | "sms" | "storage", string> = {
  email: "emails",
  sms: "texts",
  storage: "GB",
};

function UsageBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const tone = pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-amber" : "bg-accent";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surfaceMuted">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function TopUp({
  resourceType,
  rateCents,
  disabled,
  onBuy,
}: {
  resourceType: "email" | "sms" | "storage";
  rateCents: number;
  disabled: boolean;
  onBuy: (resourceType: "email" | "sms" | "storage", amountCents: number) => void;
}) {
  const [amount, setAmount] = useState(String(MINIMUM_TOPUP_DOLLARS));
  const parsed = Number(amount);
  const isValid = Number.isFinite(parsed) && parsed >= MINIMUM_TOPUP_DOLLARS;
  const estimatedUnits = isValid && rateCents > 0 ? (parsed * 100) / rateCents : 0;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {QUICK_AMOUNTS.map((amt) => (
        <button
          key={amt}
          type="button"
          onClick={() => setAmount(String(amt))}
          className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
            amount === String(amt) ? "border-accent bg-accentSoft text-accent" : "border-border text-slate hover:bg-surfaceMuted"
          }`}
        >
          ${amt}
        </button>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted">$</span>
        <input
          type="number"
          min={MINIMUM_TOPUP_DOLLARS}
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-20 rounded-lg border border-border px-2 py-1 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <button
        type="button"
        onClick={() => onBuy(resourceType, Math.round(parsed * 100))}
        disabled={disabled || !isValid}
        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
      >
        {disabled ? "Starting checkout..." : "Top up"}
      </button>
      {isValid ? (
        <span className="text-xs text-muted">&asymp; {estimatedUnits.toLocaleString(undefined, { maximumFractionDigits: 0 })} {RESOURCE_UNIT_LABEL[resourceType]}</span>
      ) : (
        <span className="text-xs text-danger">${MINIMUM_TOPUP_DOLLARS} minimum</span>
      )}
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
  const [purchasing, setPurchasing] = useState<"email" | "sms" | "storage" | null>(null);

  async function buy(resourceType: "email" | "sms" | "storage", amountCents: number) {
    setPurchasing(resourceType);
    try {
      const res = await fetch("/api/billing/usage-topup-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceType, amountCents }),
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
        {isOwner && <TopUp resourceType="email" rateCents={emailRateCents} disabled={purchasing !== null} onBuy={buy} />}
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
        {isOwner && <TopUp resourceType="sms" rateCents={smsRateCents} disabled={purchasing !== null} onBuy={buy} />}
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
        {isOwner && <TopUp resourceType="storage" rateCents={storageRateCents} disabled={purchasing !== null} onBuy={buy} />}
      </div>

      {!isOwner && <p className="text-xs text-muted">Only the workspace owner can purchase top-ups.</p>}
    </div>
  );
}
