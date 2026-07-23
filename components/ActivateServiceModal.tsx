"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ServiceTemplate } from "@/lib/types";

export default function ActivateServiceModal({
  clientId,
  workspaceId,
  initialServiceType,
  requestedServiceLabel,
  onClose,
  onActivated,
}: {
  clientId: string;
  workspaceId: string;
  // Set when this modal was opened from a specific Requested Service row.
  // If a service_templates row shares this service_type, it's preselected
  // (never auto-submitted — the user still confirms). Either way, when
  // requestedServiceLabel is set the modal shows which request triggered it.
  initialServiceType?: string;
  requestedServiceLabel?: string;
  onClose: () => void;
  onActivated: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [counts, setCounts] = useState({ tasks: 0, documents: 0, forms: 0 });

  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  // services.service_year is a real (text) column, but apply_service_
  // template_to_client also passes it straight into
  // `nullif(p_service_year, '')::int` for engagements.tax_year — a
  // non-numeric value would fail that cast mid-transaction, so this is
  // validated up front as either blank or a plain 4-digit year.
  const [serviceYear, setServiceYear] = useState(() => new Date().getFullYear().toString());
  const [dateError, setDateError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only templates apply_service_template_to_client can actually activate:
  // workspace-owned templates, or global templates that are explicitly
  // marked as platform templates (workspace_id is null alone isn't enough —
  // the RPC also requires is_platform_template = true).
  useEffect(() => {
    supabase
      .from("service_templates")
      .select("*")
      .eq("is_active", true)
      .or(`workspace_id.eq.${workspaceId},and(workspace_id.is.null,is_platform_template.eq.true)`)
      .order("template_name")
      .then(({ data, error: queryError }) => {
        if (queryError) {
          setTemplatesError(queryError.message);
          setTemplates([]);
          return;
        }
        setTemplatesError(null);
        const list = (data as ServiceTemplate[]) ?? [];
        setTemplates(list);
        if (initialServiceType) {
          const match = list.find((t) => t.service_type === initialServiceType);
          if (match) setTemplateId(match.id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;

  useEffect(() => {
    setCounts({ tasks: 0, documents: 0, forms: 0 });
    if (!templateId) return;
    Promise.all([
      supabase.from("service_template_tasks").select("id", { count: "exact", head: true }).eq("service_template_id", templateId),
      supabase.from("service_template_documents").select("id", { count: "exact", head: true }).eq("service_template_id", templateId),
      supabase.from("service_template_forms").select("id", { count: "exact", head: true }).eq("service_template_id", templateId),
    ]).then(([t, d, f]) => {
      if (t.error || d.error || f.error) {
        setCounts({ tasks: 0, documents: 0, forms: 0 });
        return;
      }
      setCounts({ tasks: t.count ?? 0, documents: d.count ?? 0, forms: f.count ?? 0 });
    });
  }, [templateId]);

  function goToPreview() {
    if (dueDate && dueDate < startDate) {
      setDateError("Due date can't be earlier than the start date.");
      return;
    }
    if (serviceYear && !/^\d{4}$/.test(serviceYear)) {
      setDateError("Service year must be a 4-digit year (e.g. 2026), or left blank.");
      return;
    }
    setDateError(null);
    setStep(3);
  }

  // apply_service_template_to_client's approved signature (verified live)
  // is (p_client_id, p_service_template_id, p_start_date, p_due_date,
  // p_assigned_to, p_price, p_service_year, p_billing_frequency,
  // p_is_recurring). Owner, price, billing frequency and recurring status
  // are still not collected here — set them on the resulting service
  // afterward — but start date, due date and service year are real,
  // already-accepted parameters, so they're sent through directly.
  async function activate() {
    setSaving(true);
    setError(null);
    const { data: serviceId, error: rpcError } = await supabase.rpc("apply_service_template_to_client", {
      p_client_id: clientId,
      p_service_template_id: templateId,
      p_start_date: startDate,
      p_due_date: dueDate || null,
      p_service_year: serviceYear || null,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8">
      <div className="w-full max-w-lg max-h-full overflow-y-auto rounded-2xl border border-line bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-slab text-lg font-bold text-ink">Activate a service</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <div className="mb-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <span className={step >= 1 ? "text-[#108A64]" : ""}>1. Choose service</span>
          <ChevronRight size={12} />
          <span className={step >= 2 ? "text-[#108A64]" : ""}>2. Dates</span>
          <ChevronRight size={12} />
          <span className={step >= 3 ? "text-[#108A64]" : ""}>3. Activate</span>
        </div>

        {step === 1 && (
          <div className="space-y-2">
            {requestedServiceLabel && (
              <div className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink">
                Activating for requested service: <strong>{requestedServiceLabel}</strong>
              </div>
            )}
            {templatesError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Couldn't load service templates: {templatesError}
              </div>
            )}
            {!templatesError && templates.length === 0 && (
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
              <Field label="Start date">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm" />
              </Field>
              <Field label="Due date">
                <input type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); setDateError(null); }} className="w-full rounded-lg border border-line px-2.5 py-2 text-sm" />
              </Field>
            </div>
            <Field label="Service year (optional)">
              <input
                placeholder="e.g. 2026"
                inputMode="numeric"
                value={serviceYear}
                onChange={(e) => {
                  setServiceYear(e.target.value.replace(/\D/g, "").slice(0, 4));
                  setDateError(null);
                }}
                className="w-full rounded-lg border border-line px-2.5 py-2 text-sm"
              />
            </Field>
            {dateError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{dateError}</div>
            )}
            <div className="rounded-lg border border-dashed border-line bg-paper px-3 py-2 text-xs text-muted">
              Owner, price, billing frequency and recurring status aren't configurable during activation yet — that
              needs a separately approved backend change. Set them on the service afterward if you use them.
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(1)} className="flex items-center gap-1 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink">
                <ChevronLeft size={14} /> Back
              </button>
              <button onClick={goToPreview} className="rounded-xl bg-[#108A64] px-4 py-2 text-sm font-semibold text-white">
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
