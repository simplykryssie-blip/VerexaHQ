"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, CheckCircle2, Plus, Pencil, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Deadline, Client } from "@/lib/types";
import NewDeadlineModal from "@/components/NewDeadlineModal";
import { sendEmail, sendSms, getProviderStatus } from "@/lib/notify";

type ClientContact = { name: string; email: string; phone: string };
type DeadlineWithClient = Deadline & { clientName: string; clientEmail: string; clientPhone: string };

function statusIcon(status: string) {
  if (status === "Past Due") return <AlertTriangle size={16} className="text-brick" />;
  if (status === "Due Soon") return <Clock size={16} className="text-amber" />;
  return <CheckCircle2 size={16} className="text-green" />;
}

export default function DeadlinesPage() {
  const [deadlines, setDeadlines] = useState<DeadlineWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState<DeadlineWithClient | null>(null);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [smsConfigured, setSmsConfigured] = useState(false);
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [reminderResult, setReminderResult] = useState<Record<string, string>>({});

  useEffect(() => {
    getProviderStatus().then((s) => {
      setEmailConfigured(s.email);
      setSmsConfigured(s.sms);
    });
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("deadlines")
      .select("*")
      .order("due_date", { ascending: true });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const list = (data as Deadline[]) ?? [];
    const clientIds = Array.from(new Set(list.map((d) => d.client_id)));
    let clientsMap = new Map<string, ClientContact>();
    if (clientIds.length > 0) {
      const { data: clientsData } = await supabase
        .from("clients")
        .select("id, first_name, last_name, business_name, client_type, email, phone")
        .in("id", clientIds);
      (clientsData as (Client & { email: string; phone: string })[] | null)?.forEach((c) => {
        const name =
          c.client_type === "business" && c.business_name
            ? c.business_name
            : `${c.first_name} ${c.last_name}`.trim();
        clientsMap.set(c.id, { name, email: c.email, phone: c.phone });
      });
    }

    setDeadlines(
      list.map((d) => {
        const contact = clientsMap.get(d.client_id);
        return {
          ...d,
          clientName: contact?.name ?? "—",
          clientEmail: contact?.email ?? "",
          clientPhone: contact?.phone ?? "",
        };
      })
    );
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function sendReminder(d: DeadlineWithClient) {
    setSendingReminderId(d.id);
    const results: string[] = [];

    if (emailConfigured && d.clientEmail) {
      const r = await sendEmail(
        d.clientEmail,
        `Reminder: ${d.deadline_title}`,
        `<p>This is a reminder that <strong>${d.deadline_title}</strong> is due on ${d.due_date}.</p>`
      );
      results.push(r.sent ? "Email sent" : `Email failed: ${r.reason ?? r.error}`);
    }
    if (smsConfigured && d.clientPhone) {
      const r = await sendSms(
        d.clientPhone,
        `Reminder: ${d.deadline_title} is due ${d.due_date}.`
      );
      results.push(r.sent ? "Text sent" : `Text failed: ${r.reason ?? r.error}`);
    }
    if (results.length === 0) {
      results.push("No email/SMS provider connected, and/or no contact info on file.");
    }

    setReminderResult((prev) => ({ ...prev, [d.id]: results.join(" · ") }));
    setSendingReminderId(null);
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-4 border-b border-line pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Compliance Calendar
          </div>
          <h1 className="font-slab text-2xl font-bold text-ink">Deadlines</h1>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-ink text-white text-sm font-semibold px-3.5 py-2 rounded-sm hover:bg-[#14273A] transition-colors"
        >
          <Plus size={15} /> New Deadline
        </button>
      </div>

      {showModal && (
        <NewDeadlineModal onClose={() => setShowModal(false)} onSaved={load} />
      )}
      {editingDeadline && (
        <NewDeadlineModal
          deadline={editingDeadline}
          onClose={() => setEditingDeadline(null)}
          onSaved={load}
          onDeleted={load}
        />
      )}

      {error && (
        <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {!emailConfigured && !smsConfigured && (
        <div className="text-xs text-muted bg-white border border-line rounded-sm px-4 py-2 mb-4">
          Connect an email or SMS provider to send real reminders straight from
          here — see the README for the env vars to add.
        </div>
      )}

      <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
        {loading && <div className="px-5 py-6 text-sm text-muted">Loading deadlines…</div>}
        {!loading && deadlines.length === 0 && (
          <div className="px-5 py-6 text-sm text-muted">No deadlines on the calendar yet.</div>
        )}
        {deadlines.map((d) => (
          <div key={d.id} className="px-5 py-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {statusIcon(d.deadline_status)}
                <div>
                  <div className="font-semibold text-ink text-sm">{d.deadline_title}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {d.clientName} · {d.deadline_type}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm tabular-nums font-mono text-ink">{d.due_date}</span>
                {(emailConfigured || smsConfigured) && (
                  <button
                    onClick={() => sendReminder(d)}
                    disabled={sendingReminderId === d.id}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink disabled:opacity-60"
                  >
                    <Send size={12} />
                    {sendingReminderId === d.id ? "Sending…" : "Remind"}
                  </button>
                )}
                <button
                  onClick={() => setEditingDeadline(d)}
                  className="text-muted hover:text-ink"
                  aria-label="Edit deadline"
                >
                  <Pencil size={14} />
                </button>
              </div>
            </div>
            {reminderResult[d.id] && (
              <div className="text-xs text-muted mt-2">{reminderResult[d.id]}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
