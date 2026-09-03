"use client";

import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";

export type BookableService = {
  id: string;
  name: string;
  description: string | null;
  estimated_duration_minutes: number | null;
  booking_location_type: string;
};

type Step = "service" | "date" | "slot" | "contact" | "success";

function nextDays(count: number): Date[] {
  const days: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

function toDateParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const inputClass =
  "w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function PublicBookingFlow({
  workspaceSlug,
  workspaceName,
  services,
  preselectedServiceId,
  staffId,
  staffName,
  windowDays,
  embedded = false,
}: {
  workspaceSlug: string;
  workspaceName: string;
  services: BookableService[];
  preselectedServiceId: string | null;
  staffId: string | null;
  staffName: string | null;
  windowDays: number;
  /** Renders as a plain card sized to its container, without the full-page
   * centered layout -- for embedding inside a Websites/Funnels page section,
   * which already provides its own page chrome and background. */
  embedded?: boolean;
}) {
  const preselected = preselectedServiceId ? services.find((s) => s.id === preselectedServiceId) ?? null : null;

  const [step, setStep] = useState<Step>(preselected ? "date" : "service");
  const [serviceId, setServiceId] = useState<string | null>(preselected?.id ?? null);
  const [date, setDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ title: string; start_at: string } | null>(null);

  const selectedService = services.find((s) => s.id === serviceId) ?? null;

  useEffect(() => {
    if (step !== "slot" || !serviceId || !date) return;
    setSlots(null);
    setLoadingSlots(true);
    const params = new URLSearchParams({ workspaceSlug, serviceId, date: toDateParam(date) });
    if (staffId) params.set("staffId", staffId);
    fetch(`/api/public/booking/slots?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [step, serviceId, date, workspaceSlug, staffId]);

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/public/booking/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceSlug,
        serviceId,
        staffId,
        startAt: selectedSlot,
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        email: email.trim(),
        phone: phone.trim() || undefined,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Could not book that time.");
      return;
    }
    setConfirmed(data.appointment);
    setStep("success");
  }

  if (services.length === 0) {
    return (
      <Centered embedded={embedded}>
        <h1 className="text-lg font-semibold text-ink">Nothing available to book right now</h1>
        <p className="mt-2 text-sm text-muted">Please contact {workspaceName} directly to schedule.</p>
      </Centered>
    );
  }

  return (
    <Centered wide embedded={embedded}>
      <h1 className="text-lg font-semibold text-ink">
        Book with {workspaceName}
        {staffName ? ` -- ${staffName}` : ""}
      </h1>

      {step !== "service" && step !== "success" && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            if (step === "date") setStep(preselected ? "date" : "service");
            else if (step === "slot") setStep("date");
            else if (step === "contact") setStep("slot");
          }}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
        >
          <ChevronLeft size={13} /> Back
        </button>
      )}

      {step === "service" && (
        <div className="mt-4 space-y-2">
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setServiceId(s.id);
                setStep("date");
              }}
              className="block w-full rounded-lg border border-border px-4 py-3 text-left transition hover:border-accent"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">{s.name}</p>
                {s.estimated_duration_minutes && <span className="shrink-0 text-xs text-muted">{s.estimated_duration_minutes} min</span>}
              </div>
              {s.description && <p className="mt-0.5 text-xs text-muted">{s.description}</p>}
            </button>
          ))}
        </div>
      )}

      {step === "date" && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-muted">{selectedService?.name}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {nextDays(windowDays).map((d) => (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => {
                  setDate(d);
                  setStep("slot");
                }}
                className="rounded-lg border border-border px-2 py-2 text-center text-xs transition hover:border-accent hover:text-accent"
              >
                <div className="font-medium text-ink">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                <div className="text-muted">{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "slot" && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-muted">
            {selectedService?.name} -- {date?.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
          {loadingSlots ? (
            <p className="py-6 text-center text-sm text-muted">Loading times...</p>
          ) : !slots || slots.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No times available this day. Try another date.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => {
                    setSelectedSlot(slot);
                    setStep("contact");
                  }}
                  className="rounded-lg border border-border px-2 py-2 text-center text-sm font-medium text-slate transition hover:border-accent hover:text-accent"
                >
                  {new Date(slot).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === "contact" && (
        <form onSubmit={submitBooking} className="mt-4 space-y-3">
          <p className="text-xs text-muted">
            {selectedService?.name} -- {date?.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} at{" "}
            {selectedSlot && new Date(selectedSlot).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
            <input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
          </div>
          <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          <input type="tel" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
          >
            {submitting ? "Booking..." : "Confirm booking"}
          </button>
        </form>
      )}

      {step === "success" && confirmed && (
        <div className="mt-4 text-center">
          <p className="text-sm font-medium text-ink">You&apos;re booked!</p>
          <p className="mt-1 text-sm text-muted">
            {confirmed.title} -- {new Date(confirmed.start_at).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
          </p>
          <p className="mt-2 text-xs text-muted">A confirmation email is on its way to {email}.</p>
        </div>
      )}
    </Centered>
  );
}

function Centered({ children, wide = false, embedded = false }: { children: React.ReactNode; wide?: boolean; embedded?: boolean }) {
  const card = (
    <div className={`w-full ${wide ? "max-w-lg" : "max-w-sm"} rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8`}>{children}</div>
  );
  if (embedded) return <div className="mx-auto flex justify-center px-4 py-8">{card}</div>;
  return <div className="flex min-h-screen items-center justify-center bg-surfaceMuted px-4 py-10">{card}</div>;
}
