"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ServiceTemplate, WorkspaceMember } from "@/lib/types";

const BILLING_FREQUENCIES = ["One-time", "Monthly", "Quarterly", "Annually"];

export default function ActivateServiceModal({
  clientId,
  workspaceId,
  onClose,
  onActivated,
}: {
  clientId: string;
  workspaceId: string;
  onClose: () => void;
  onActivated: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [counts, setCounts] = useState({ tasks: 0, documents: 0, forms: 0 });

  const [assignedTo, setAssignedTo] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [serviceYear, setServiceYear] = useState(String(new Date().getFullYear()));
  const [price, setPrice] = useState("");
  const [billingFrequency, setBillingFrequency] = useState("One-time");
  const [isRecurring, setIsRecurring] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("service_templates")
      .select("*")
      .eq("is_active", true)
      .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
      .order("template_name")
      .then(({ data }) => setTemplates((data as ServiceTemplate[]) ?? []));
    supabase
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("member_status", "Active")
      .then(({ data }) => setMembers((data as WorkspaceMember[]) ?? []));
  }, [workspaceId]);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;

  useEffect(() => {
    if (!templateId) return;
    setPrice(selectedTemplate?.default_price != null ? String(selectedTemplate.default_price) : "");
    Promise.all([
      supabase.from("service_template_tasks").select("id", { count: "exact", head: true }).eq("service_template_id", templateId),
      supabase.from("service_template_documents").select("id", { count: "exact", head: true }).eq("service_template_id", templateId),
      supabase.from("service_template_forms").select("id", { count: "exact", head: true }).eq("service_template_id", templateId),
    ]).then(([t, d, f]) => {
      setCounts({ tasks: t.count ?? 0, documents: d.count ?? 0, forms: f.count ?? 0 });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  async function activate() {
    setSaving(true);
    setError(null);
    const { data: serviceId, error: rpcError } = await supabase.rpc("apply_service_template_to_client", {
      p_client_id: clientId,
      p_service_template_id: templateId,
      p_start_date: startDate,
      p_due_date: dueDate || null,
      p_assigned_to: assignedTo || null,
      p_price: price ? Number(price) : null,
      p_service_year: serviceYear || null,
      p_billing_frequency: billingFrequency,
      p_is_recurring: isRecurring,
    });
    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }
    const { data: engagement } = await supabase
      .from("engagements")
      .select("id")
      .eq("service_id", serviceId as string)
      .maybeSingle();
    setSaving(false);
    onActivated();
    onClose();
    if (engagement?.id) router.push(`/work/${engagement.id}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-slab text-lg font-bold text-ink">Activate a service</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="mb-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <span className={step >= 1 ? "text-[#108A64]" : ""}>1. Choose service</span>
          <ChevronRight size={12} />
          <span className={step >= 2 ? "text-[#108A64]" : ""}>2. Confirm defaults</span>
          <ChevronRight size={12} />
          <span className={step >= 3 ? "text-[#108A64]" : ""}>3. Activate</span>
        </div>

        {step === 1 && (
          <div className="space-y-2">
            {templates.length === 0 && (
              <div className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
                No service templates are set up for this workspace yet.
              </div>
            )}
            {templates.map((t) => (
              <label
                key={t.id}
                className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                  templateId === t.id ? "border-[#108A64] bg-emerald-50/40" : "border-line"
                }`}
              >
                <div>
                  <div className="font-semibold text-ink">{t.template_name}</div>
                  <div className="text-xs text-muted">{t.service_type}</div>
                </div>
                <input
                  type="radio"
                  name="template"
                  checked={templateId === t.id}
                  onChange={() => setTemplateId(t.id)}
                  className="h-4 w-4 accent-[#108A64]"
                />
              </label>
            ))}
            <div className="flex justify-end pt-2">
              <button
                disabled={!templateId}
                onClick={() => setStep(2)}
                className="rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Owner">
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm">
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name || m.job_title || "Team member"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Service year">
                <input value={serviceYear} onChange={(e) => setServiceYear(e.target.value)} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm" />
              </Field>
              <Field label="Start date">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm" />
              </Field>
              <Field label="Due date">
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm" />
              </Field>
              <Field label="Price">
                <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm" />
              </Field>
              <Field label="Billing frequency">
                <select value={billingFrequency} onChange={(e) => setBillingFrequency(e.target.value)} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm">
                  {BILLING_FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="h-4 w-4 accent-[#108A64]" />
              This is a recurring service
            </label>
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(1)} className="flex items-center gap-1 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink">
                <ChevronLeft size={14} /> Back
              </button>
              <button onClick={() => setStep(3)} className="rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white">
                Preview
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-paper p-4 text-sm">
              <div className="font-semibold text-ink">{selectedTemplate?.template_name}</div>
              <div className="mt-1 text-xs text-muted">
                {counts.tasks} task(s) · {counts.documents} document request(s) · {counts.forms} form(s) will be created automatically.
              </div>
            </div>
            <p className="text-xs text-muted">
              Each service activates independently — if you're adding more than one service, repeat this after this one finishes.
            </p>
            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(2)} className="flex items-center gap-1 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink">
                <ChevronLeft size={14} /> Back
              </button>
              <button
                onClick={activate}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                <CheckCircle2 size={14} /> {saving ? "Activating…" : "Activate service"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-muted">{label}</label>
      {children}
    </div>
  );
}
