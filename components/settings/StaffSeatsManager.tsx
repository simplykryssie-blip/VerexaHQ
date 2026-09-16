"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

export type SeatSummary = {
  included_seats: number;
  active_paid_seats: number;
  pending_seats: number;
  active_staff_count: number;
  per_seat_price_cents: number;
  available_seats: number;
};

export type ActivePaidSeat = { id: string; activated_at: string | null; prorated_amount_cents: number | null };

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function StaffSeatsManager({ summary, activeSeats }: { summary: SeatSummary; activeSeats: ActivePaidSeat[] }) {
  const toast = useToast();
  const router = useRouter();
  const [previewing, setPreviewing] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [proratedAmountCents, setProratedAmountCents] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function startAddSeat() {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/settings/seats/preview", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? "Could not preview seat cost", "error");
        return;
      }
      if (data.reason) {
        setPreviewError(data.reason);
        setConfirming(true);
        return;
      }
      setProratedAmountCents(data.proratedAmountCents);
      setConfirming(true);
    } finally {
      setPreviewing(false);
    }
  }

  async function confirmPurchase() {
    setPurchasing(true);
    try {
      const res = await fetch("/api/settings/seats/purchase", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? "Could not purchase seat", "error");
        return;
      }
      if (data.status === "active") {
        toast.show("Your additional staff seat is active.", "success");
      } else if (data.status === "pending") {
        toast.show("Payment is processing -- the seat will activate once it's confirmed.", "success");
      } else {
        toast.show(data.error ?? "Payment failed -- the seat was not activated.", "error");
      }
      setConfirming(false);
      setProratedAmountCents(null);
      router.refresh();
    } finally {
      setPurchasing(false);
    }
  }

  async function removeSeat(seatId: string) {
    if (!window.confirm("Remove this paid seat? This stops future recurring billing for it -- there is no refund or credit for the current period.")) return;
    setRemoving(seatId);
    try {
      const res = await fetch("/api/settings/seats/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show(data.error ?? "Could not remove seat", "error");
        return;
      }
      toast.show("Seat removed. It will not renew.", "success");
      router.refresh();
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted">Included seats</p>
          <p className="text-lg font-semibold text-ink">{summary.included_seats}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Paid seats</p>
          <p className="text-lg font-semibold text-ink">{summary.active_paid_seats}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Total active seats</p>
          <p className="text-lg font-semibold text-ink">{summary.included_seats + summary.active_paid_seats}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Available seats</p>
          <p className="text-lg font-semibold text-ink">{summary.available_seats}</p>
        </div>
      </div>

      <p className="text-xs text-muted">Additional seat: {formatCents(summary.per_seat_price_cents)}/month + applicable sales tax</p>

      {summary.pending_seats > 0 && <p className="text-xs text-amber">A seat purchase is currently processing.</p>}

      {activeSeats.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {activeSeats.map((seat) => (
            <li key={seat.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-slate">
                Active since {seat.activated_at ? new Date(seat.activated_at).toLocaleDateString() : "--"}
                {seat.prorated_amount_cents !== null ? ` -- ${formatCents(seat.prorated_amount_cents)} prorated at purchase` : ""}
              </span>
              <button
                type="button"
                onClick={() => removeSeat(seat.id)}
                disabled={removing === seat.id}
                className="text-xs font-medium text-danger hover:underline disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {!confirming ? (
        <button
          type="button"
          onClick={startAddSeat}
          disabled={previewing || summary.pending_seats > 0}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {previewing ? "Checking price..." : "Add Staff Seat"}
        </button>
      ) : (
        <div className="rounded-xl border border-border bg-surfaceMuted p-4">
          <h4 className="font-display text-sm font-semibold text-ink">Add Staff Seat</h4>
          {previewError ? (
            <p className="mt-2 text-sm text-danger">{previewError}</p>
          ) : (
            <div className="mt-2 space-y-1 text-sm text-slate">
              <p>Included seats: {summary.included_seats}</p>
              <p>Current paid seats: {summary.active_paid_seats}</p>
              <p>Additional seat: {formatCents(summary.per_seat_price_cents)}/month + applicable sales tax</p>
              <p className="font-medium text-ink">
                Prorated amount due today: {proratedAmountCents !== null ? formatCents(proratedAmountCents) : "--"}
              </p>
              <p className="text-xs text-muted">
                This charges the prorated amount now for the rest of your current billing period. The seat becomes active only after payment
                succeeds; the full monthly price applies starting your next billing cycle.
              </p>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setProratedAmountCents(null);
                setPreviewError(null);
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-slate hover:border-accent hover:text-accent"
            >
              Cancel
            </button>
            {!previewError && (
              <button
                type="button"
                onClick={confirmPurchase}
                disabled={purchasing || proratedAmountCents === null}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {purchasing ? "Processing..." : "Confirm & Pay"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
