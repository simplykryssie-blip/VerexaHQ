"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, MinusCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/Badge";
import {
  PARTNER_ONBOARDING_ENTITY_TYPES,
  PARTNER_ONBOARDING_ENTITY_TYPE_LABELS,
  PARTNER_ONBOARDING_SERVICES_OFFERED,
  PARTNER_ONBOARDING_SERVICE_LABELS,
  validatePartnerOnboardingApplication,
  partnerOnboardingApplicationDataToFormState,
  partnerOnboardingFormStateToApplicationData,
  type PartnerOnboardingApplicationFormState,
  type PartnerOnboardingEntityType,
  type PartnerOnboardingServiceOffered,
} from "@/lib/partnerOnboardingApplication";
import { ONBOARDING_STATUS_LABEL, ONBOARDING_STATUS_TONE } from "@/lib/partnerOnboarding";

const inputClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const inputErrorClass = "border-danger focus:border-danger focus:ring-danger";
const labelClass = "text-xs font-medium text-muted";

type FormState = PartnerOnboardingApplicationFormState;

function YesNoSelect({
  value,
  onChange,
  required,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  hasError?: boolean;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} ${hasError ? inputErrorClass : ""}`}>
      <option value="">{required ? "Select..." : "Not specified"}</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}

function summaryValue(f: FormState, key: keyof FormState): string {
  if (key === "services_offered") {
    return f.services_offered.length > 0 ? f.services_offered.map((s) => PARTNER_ONBOARDING_SERVICE_LABELS[s]).join(", ") : "--";
  }
  if (key === "entity_type") {
    return f.entity_type ? PARTNER_ONBOARDING_ENTITY_TYPE_LABELS[f.entity_type as PartnerOnboardingEntityType] : "--";
  }
  if (["has_active_ptin", "has_active_efin", "prior_ero_sb_relationship", "irs_suspension_or_sanction", "schedule_c_experience"].includes(key)) {
    const v = f[key] as string;
    return v === "yes" ? "Yes" : v === "no" ? "No" : "--";
  }
  const v = f[key];
  return typeof v === "string" && v.trim() !== "" ? v : "--";
}

export function PartnerOnboardingApplication({
  workspaceId,
  onboardingId,
  status,
  applicationData,
  reviewNote,
  rejectedReason,
  trainingRequired,
  trainingCompletedAt,
  bankSoftwareSetupRequired,
  bankSoftwareSetupCompletedAt,
}: {
  workspaceId: string;
  onboardingId: string;
  status: string;
  applicationData: Record<string, unknown> | null;
  reviewNote: string | null;
  rejectedReason: string | null;
  trainingRequired: boolean;
  trainingCompletedAt: string | null;
  bankSoftwareSetupRequired: boolean;
  bankSoftwareSetupCompletedAt: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => partnerOnboardingApplicationDataToFormState(applicationData));
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const isEditable = status === "pending" || status === "in_progress";
  const isInfoRequested = status === "in_progress" && Boolean(reviewNote);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleService(service: PartnerOnboardingServiceOffered) {
    setForm((f) => ({
      ...f,
      services_offered: f.services_offered.includes(service) ? f.services_offered.filter((s) => s !== service) : [...f.services_offered, service],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const candidate = partnerOnboardingFormStateToApplicationData(form);
    const result = validatePartnerOnboardingApplication(candidate);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSubmitting(true);
    const { error } = await supabase.rpc("submit_partner_onboarding_application", {
      p_workspace_id: workspaceId,
      p_onboarding_id: onboardingId,
      p_application_data: result.data as unknown as never,
    });
    setSubmitting(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Application submitted and is now under review.", "success");
    router.refresh();
  }

  // Non-editable terminal/waiting states each get their own minimal,
  // literal treatment rather than one generic "read-only application"
  // view -- setup shows only the two setup-specific items it's meant to,
  // ready/rejected/withdrawn show only their own completion/closure
  // message. None of this touches agreement or document status --
  // that's Phase 6J-3.
  if (status === "ready") {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center shadow-soft">
        <CheckCircle2 className="mx-auto text-success" size={28} aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold text-ink">Your onboarding is complete.</p>
        <p className="mt-1 text-sm text-muted">There is nothing further to do here.</p>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
        <Badge tone="danger">Rejected</Badge>
        <p className="mt-3 text-sm text-ink">Your onboarding application was not approved.</p>
        {rejectedReason && <p className="mt-2 rounded-lg border border-danger/30 bg-dangerSoft px-3 py-2 text-sm text-danger">{rejectedReason}</p>}
        <p className="mt-3 text-sm text-muted">Please contact your ERO or Service Bureau if you have questions about this decision.</p>
      </div>
    );
  }

  if (status === "withdrawn") {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
        <Badge tone="neutral">Withdrawn</Badge>
        <p className="mt-3 text-sm text-ink">This onboarding application was withdrawn and is now closed.</p>
        <p className="mt-1 text-sm text-muted">Please contact your ERO or Service Bureau for next steps.</p>
      </div>
    );
  }

  if (status === "setup") {
    const items = [
      { label: "Training", required: trainingRequired, completedAt: trainingCompletedAt },
      { label: "Bank / Software Setup", required: bankSoftwareSetupRequired, completedAt: bankSoftwareSetupCompletedAt },
    ];
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
        <Badge tone={ONBOARDING_STATUS_TONE[status] ?? "neutral"}>{ONBOARDING_STATUS_LABEL[status] ?? status}</Badge>
        <p className="mt-3 text-sm text-ink">Your application has been approved. Your onboarding is being finalized.</p>
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-sm">
              {!item.required ? (
                <MinusCircle size={16} className="text-muted" aria-hidden="true" />
              ) : item.completedAt ? (
                <CheckCircle2 size={16} className="text-success" aria-hidden="true" />
              ) : (
                <Circle size={16} className="text-accent" aria-hidden="true" />
              )}
              <span className={!item.required ? "text-muted line-through" : "text-slate"}>
                {item.label} {!item.required && "(not required)"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">This checklist is managed by your ERO or Service Bureau.</p>
      </div>
    );
  }

  if (status === "under_review") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
          <Badge tone={ONBOARDING_STATUS_TONE[status] ?? "neutral"}>{ONBOARDING_STATUS_LABEL[status] ?? status}</Badge>
          <p className="mt-3 text-sm text-ink">Your application has been submitted and is currently under review.</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your Submitted Application</p>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            {(Object.keys(form) as (keyof FormState)[])
              .filter((k) => summaryValue(form, k) !== "--")
              .map((k) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-wide text-muted">{k.replace(/_/g, " ")}</dt>
                  <dd className="mt-0.5 text-slate">{summaryValue(form, k)}</dd>
                </div>
              ))}
          </dl>
        </div>
      </div>
    );
  }

  if (!isEditable) {
    // Defensive fallback -- every known status is handled above.
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
        <Badge tone={ONBOARDING_STATUS_TONE[status] ?? "neutral"}>{ONBOARDING_STATUS_LABEL[status] ?? status}</Badge>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {isInfoRequested && (
        <div className="rounded-2xl border border-warning/30 bg-warningSoft p-4">
          <p className="text-sm font-semibold text-warning">Additional Information Requested</p>
          <p className="mt-1 text-sm text-warning">{reviewNote}</p>
          <p className="mt-2 text-xs text-warning">Please update your application below and resubmit it for review.</p>
        </div>
      )}

      {errors.length > 0 && (
        <div className="rounded-2xl border border-danger/30 bg-dangerSoft p-4">
          <p className="text-sm font-semibold text-danger">Please fix the following before submitting:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-danger">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-ink">Business Information</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            <span className={labelClass}>Legal business name *</span>
            <input className={inputClass} value={form.legal_business_name} onChange={(e) => set("legal_business_name", e.target.value)} />
          </label>
          <label>
            <span className={labelClass}>DBA (if different)</span>
            <input className={inputClass} value={form.dba} onChange={(e) => set("dba", e.target.value)} />
          </label>
          <label>
            <span className={labelClass}>Entity type *</span>
            <select className={inputClass} value={form.entity_type} onChange={(e) => set("entity_type", e.target.value)}>
              <option value="">Select...</option>
              {PARTNER_ONBOARDING_ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PARTNER_ONBOARDING_ENTITY_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Website</span>
            <input className={inputClass} placeholder="www.example.com" value={form.website} onChange={(e) => set("website", e.target.value)} />
          </label>
          <label className="sm:col-span-2">
            <span className={labelClass}>Business address *</span>
            <input className={inputClass} value={form.business_address} onChange={(e) => set("business_address", e.target.value)} />
          </label>
          <label>
            <span className={labelClass}>Business phone *</span>
            <input className={inputClass} value={form.business_phone} onChange={(e) => set("business_phone", e.target.value)} />
          </label>
          <label>
            <span className={labelClass}>Business email *</span>
            <input type="email" className={inputClass} value={form.business_email} onChange={(e) => set("business_email", e.target.value)} />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-ink">Tax Professional Information</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            <span className={labelClass}>Applicant full name *</span>
            <input className={inputClass} value={form.applicant_full_name} onChange={(e) => set("applicant_full_name", e.target.value)} />
          </label>
          <label>
            <span className={labelClass}>Years preparing taxes *</span>
            <input type="number" min={0} max={80} className={inputClass} value={form.years_preparing_taxes} onChange={(e) => set("years_preparing_taxes", e.target.value)} />
          </label>
          <label>
            <span className={labelClass}>Do you hold an active PTIN? *</span>
            <YesNoSelect required value={form.has_active_ptin} onChange={(v) => set("has_active_ptin", v)} />
          </label>
          <label>
            <span className={labelClass}>Do you hold an active EFIN?</span>
            <YesNoSelect value={form.has_active_efin} onChange={(v) => set("has_active_efin", v)} />
          </label>
          <label>
            <span className={labelClass}>Years in business</span>
            <input type="number" min={0} max={100} className={inputClass} value={form.years_in_business} onChange={(e) => set("years_in_business", e.target.value)} />
          </label>
          <label>
            <span className={labelClass}>Prior tax software used</span>
            <input className={inputClass} value={form.prior_tax_software} onChange={(e) => set("prior_tax_software", e.target.value)} />
          </label>
        </div>
        <p className="mt-3 text-xs text-muted">
          Your actual PTIN/EFIN, EIN, and SSN are never collected here -- those are kept securely on your firm&apos;s Tax Profile.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-ink">Compliance</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            <span className={labelClass}>Any current or past IRS suspension or sanction? *</span>
            <YesNoSelect required value={form.irs_suspension_or_sanction} onChange={(v) => set("irs_suspension_or_sanction", v)} />
          </label>
          <label>
            <span className={labelClass}>Prior relationship with an ERO/Service Bureau?</span>
            <YesNoSelect value={form.prior_ero_sb_relationship} onChange={(v) => set("prior_ero_sb_relationship", v)} />
          </label>
          {form.prior_ero_sb_relationship === "yes" && (
            <label className="sm:col-span-2">
              <span className={labelClass}>Details</span>
              <input
                className={inputClass}
                value={form.prior_ero_sb_relationship_details}
                onChange={(e) => set("prior_ero_sb_relationship_details", e.target.value)}
              />
            </label>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-ink">Services &amp; Production</h2>
        <div className="mt-3">
          <span className={labelClass}>Services offered *</span>
          <div className="mt-2 flex flex-wrap gap-3">
            {PARTNER_ONBOARDING_SERVICES_OFFERED.map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-sm text-slate">
                <input type="checkbox" checked={form.services_offered.includes(s)} onChange={() => toggleService(s)} />
                {PARTNER_ONBOARDING_SERVICE_LABELS[s]}
              </label>
            ))}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            <span className={labelClass}>Expected annual return volume *</span>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.expected_annual_return_volume}
              onChange={(e) => set("expected_annual_return_volume", e.target.value)}
            />
          </label>
          <label>
            <span className={labelClass}>Individual / business return mix</span>
            <input
              placeholder="e.g. 70/30"
              className={inputClass}
              value={form.individual_business_return_mix}
              onChange={(e) => set("individual_business_return_mix", e.target.value)}
            />
          </label>
          <label>
            <span className={labelClass}>Schedule C experience?</span>
            <YesNoSelect value={form.schedule_c_experience} onChange={(v) => set("schedule_c_experience", v)} />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-ink">Staff</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            <span className={labelClass}>Number of preparers *</span>
            <input type="number" min={0} className={inputClass} value={form.number_of_preparers} onChange={(e) => set("number_of_preparers", e.target.value)} />
          </label>
          <label className="sm:col-span-2">
            <span className={labelClass}>Preparer names (one per line)</span>
            <textarea rows={3} className={inputClass} value={form.preparer_names} onChange={(e) => set("preparer_names", e.target.value)} />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-ink">Additional Information</h2>
        <div className="mt-3 grid grid-cols-1 gap-4">
          <label>
            <span className={labelClass}>Goals for this partnership</span>
            <textarea rows={2} className={inputClass} value={form.partnership_goals} onChange={(e) => set("partnership_goals", e.target.value)} />
          </label>
          <label>
            <span className={labelClass}>Anything else we should know?</span>
            <textarea rows={2} className={inputClass} value={form.additional_information} onChange={(e) => set("additional_information", e.target.value)} />
          </label>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
        >
          {submitting ? "Submitting..." : "Submit Application"}
        </button>
      </div>
    </form>
  );
}
