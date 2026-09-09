"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, ChevronLeft } from "lucide-react";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { BOOKING_WINDOW_DAYS } from "@/lib/businessHours";

export type BookableService = { id: string; name: string; description: string | null; estimated_duration_minutes: number | null };

const DEFAULT_WINDOW_DAYS = BOOKING_WINDOW_DAYS;

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

export function BookAppointment({ services, windowDays = DEFAULT_WINDOW_DAYS }: { services: BookableService[]; windowDays?: number }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"service" | "date" | "slot">("service");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState<string | null>(null);

  const selectedService = services.find((s) => s.id === serviceId) ?? null;

  useEffect(() => {
    if (step !== "slot" || !serviceId || !date) return;
    setSlots(null);
    setLoadingSlots(true);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    fetch(`/api/portal/available-slots?serviceId=${serviceId}&date=${dateStr}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [step, serviceId, date]);

  function reset() {
    setStep("service");
    setServiceId(null);
    setDate(null);
    setSlots(null);
    setBooking(null);
  }

  async function confirmSlot(slot: string) {
    setBooking(slot);
    const res = await fetch("/api/portal/book-appointment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId, startAt: slot }),
    });
    const data = await res.json();
    setBooking(null);
    if (!res.ok) {
      toast.show(data.error ?? "Could not book that time.", "error");
      return;
    }
    toast.show("Appointment booked", "success");
    setOpen(false);
    reset();
    router.refresh();
  }

  if (services.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90"
      >
        <CalendarPlus size={14} /> Book an appointment
      </button>

      {open && (
        <Modal
          title={step === "service" ? "Book an appointment" : step === "date" ? "Choose a date" : "Choose a time"}
          onClose={() => {
            setOpen(false);
            reset();
          }}
        >
          {step !== "service" && (
            <button
              type="button"
              onClick={() => setStep(step === "slot" ? "date" : "service")}
              className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
            >
              <ChevronLeft size={13} /> Back
            </button>
          )}

          {step === "service" && (
            <div className="space-y-2">
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setServiceId(s.id);
                    setStep("date");
                  }}
                  className="block w-full rounded-lg border border-border px-3 py-2.5 text-left transition hover:border-accent"
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
            <div>
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
            <div>
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
                      disabled={booking === slot}
                      onClick={() => confirmSlot(slot)}
                      className="rounded-lg border border-border px-2 py-2 text-center text-sm font-medium text-slate transition hover:border-accent hover:text-accent disabled:opacity-60"
                    >
                      {booking === slot ? "Booking..." : new Date(slot).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
