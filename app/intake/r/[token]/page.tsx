"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import {
  supabaseIntake,
  isIntakeSupabaseConfigured,
  type IntakeRow,
  type IntakeDocumentRequest,
} from "@/lib/supabaseIntake";

const SECTIONS = [
  "Identity & Entry",
  "Household & Filing Basics",
  "Income Sources",
  "Adjustments, Deductions & Credits",
  "Life Changes & Special Situations",
  "Payment Preference & Readiness",
  "Documents",
  "Review & Submit",
] as const;

const INCOME_SOURCES = [
  { key: "w2", label: "W-2 wages" },
  { key: "self_employment", label: "Self-employment / 1099" },
  { key: "k1", label: "Partnership / S-corp / trust (K-1)" },
  { key: "rental", label: "Rental income" },
  { key: "retirement", label: "Retirement distributions" },
  { key: "social_security", label: "Social Security" },
  { key: "unemployment", label: "Unemployment" },
  { key: "investments", label: "Investment income" },
  { key: "stock_sales", label: "Stock / asset sales" },
  { key: "interest_dividends", label: "Interest & dividends" },
  { key: "crypto", label: "Cryptocurrency" },
  { key: "foreign_income", label: "Foreign income" },
];

const NOT_EDITABLE_STATUSES = new Set([
  "intake_submitted",
  "intake_review_needed",
  "additional_information_needed",
  "consultation_required",
  "consultation_scheduled",
  "quote_pending",
  "declined",
  "archived",
  "withdrawn",
]);

type Answers = Record<string, unknown>;

type FormState = {
  filingStatus: string;
  hasSpouse: boolean;
  dependentsCount: number;
  statesLivedWorked: string;
  returnVariant: string;
  incomeSources: string[];
  businessCount: number;
  rentalCount: number;
  hasCrypto: boolean;
  hasForeignIncome: boolean;
  hasPriorYearReturn: boolean;
  hasIrsNotice: boolean;
  hasUnfiledYears: boolean;
  bookkeepingCleanup: boolean;
  paymentPreference: string;
  answers: Answers;
};

function emptyForm(intake: IntakeRow | null): FormState {
  const a = (intake?.answers || {}) as Answers;
  return {
    filingStatus: (a.filing_status_expected as string) || "",
    hasSpouse: !!a.has_spouse,
    dependentsCount: Number(a.dependents_count || 0),
    statesLivedWorked: Array.isArray(a.states_lived_worked) ? (a.states_lived_worked as string[]).join(", ") : "",
    returnVariant: (a.return_variant as string) || "original",
    incomeSources: Array.isArray(a.income_sources) ? (a.income_sources as string[]) : [],
    businessCount: Number(a.business_count || 0),
    rentalCount: Number(a.rental_count || 0),
    hasCrypto: !!a.has_cryptocurrency,
    hasForeignIncome: !!a.has_foreign_income,
    hasPriorYearReturn: !!a.has_prior_year_return,
    hasIrsNotice: !!a.has_irs_state_notice,
    hasUnfiledYears: !!a.has_unfiled_years,
    bookkeepingCleanup: !!a.bookkeeping_cleanup_needed,
    paymentPreference: (a.payment_preference as string) || "",
    answers: a,
  };
}

function buildPatch(f: FormState) {
  return {
    filing_status_expected: f.filingStatus || null,
    has_spouse: f.hasSpouse,
    dependents_count: f.dependentsCount,
    states_lived_worked: f.statesLivedWorked
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    return_variant: f.returnVariant || null,
    income_sources: f.incomeSources,
    business_count: f.businessCount,
    rental_count: f.rentalCount,
    has_cryptocurrency: f.hasCrypto,
    has_foreign_income: f.hasForeignIncome,
    has_prior_year_return: f.hasPriorYearReturn,
    has_irs_state_notice: f.hasIrsNotice,
    has_unfiled_years: f.hasUnfiledYears,
    bookkeeping_cleanup_needed: f.bookkeepingCleanup,
    payment_preference: f.paymentPreference || null,
    deductions_notes: f.answers.deductions_notes || null,
    life_changes_notes: f.answers.life_changes_notes || null,
    engagement_notes: f.answers.engagement_notes || null,
    itemize_preference: f.answers.itemize_preference || null,
  };
}

export default function IntakeWizardPage() {
  const params = useParams<{ token: string }>();
  const [token, setToken] = useState(params.token);
  const [intake, setIntake] = useState<IntakeRow | null>(null);
  const [docs, setDocs] = useState<IntakeDocumentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState(1);
  const [form, setForm] = useState<FormState>(emptyForm(null));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitted, setSubmitted] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstLoad = useRef(true);

  const loadDocs = useCallback(async (tok: string) => {
    const { data } = await supabaseIntake.rpc("public_intake_document_requests", { p_token: tok });
    setDocs((data as IntakeDocumentRequest[]) || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabaseIntake.rpc("resume_public_intake", { p_token: token });
      if (cancelled) return;
      if (error || !data) {
        setLoadError("This link is invalid or has expired. Please contact our office for a new one.");
        setLoading(false);
        return;
      }
      const row = data as IntakeRow;
      setIntake(row);
      setForm(emptyForm(row));
      setSection(Math.min(Math.max(row.current_section || 1, 1), 8));
      setSubmitted(!!row.submitted_at);
      await loadDocs(token);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(
    async (nextSection: number, currentForm: FormState) => {
      setSaveStatus("saving");
      const { data, error } = await supabaseIntake.rpc("save_intake_progress", {
        p_token: token,
        p_section: nextSection,
        p_patch: buildPatch(currentForm),
      });
      if (error || !data) {
        setSaveStatus("error");
        return;
      }
      setIntake(data as IntakeRow);
      setSaveStatus("saved");
      await loadDocs(token);
    },
    [token, loadDocs],
  );

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    if (!intake || submitted || NOT_EDITABLE_STATUSES.has(intake.status)) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void save(section, form);
    }, 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  function goTo(next: number) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    void save(next, form);
    setSection(next);
  }

  if (!isIntakeSupabaseConfigured) {
    return <Centered>This intake form isn&apos;t available right now.</Centered>;
  }
  if (loading) {
    return <Centered>Loading your intake…</Centered>;
  }
  if (loadError || !intake) {
    return <Centered error>{loadError}</Centered>;
  }
  if (submitted || NOT_EDITABLE_STATUSES.has(intake.status)) {
    return (
      <Centered>
        <div className="text-center">
          <div className="font-slab text-xl font-bold text-ink mb-2">You&apos;re all set</div>
          <p className="text-sm text-muted max-w-sm">
            Your intake has already been submitted and is being reviewed by our team. We&apos;ll be
            in touch using the contact information you provided.
          </p>
        </div>
      </Centered>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <LogoMark size={30} />
        <div>
          <div className="font-slab text-lg font-bold text-ink">Tax Intake</div>
          <SaveIndicator status={saveStatus} />
        </div>
      </div>

      <Stepper current={section} onJump={goTo} />

      <div className="bg-white border border-line rounded-sm p-6 mt-4">
        {section === 1 && <SectionIdentity intake={intake} />}
        {section === 2 && <SectionHousehold form={form} setForm={setForm} />}
        {section === 3 && <SectionIncome form={form} setForm={setForm} />}
        {section === 4 && <SectionAdjustments form={form} setForm={setForm} />}
        {section === 5 && <SectionLifeChanges form={form} setForm={setForm} />}
        {section === 6 && <SectionPayment form={form} setForm={setForm} intake={intake} />}
        {section === 7 && (
          <SectionDocuments token={token} docs={docs} onUploaded={() => loadDocs(token)} />
        )}
        {section === 8 && (
          <SectionReview
            token={token}
            intake={intake}
            onTokenRotated={(t) => setToken(t)}
            onIntakeUpdated={(i) => setIntake(i)}
            onSubmitted={() => setSubmitted(true)}
          />
        )}

        <div className="flex justify-between mt-6 pt-4 border-t border-line">
          <button
            type="button"
            disabled={section === 1}
            onClick={() => goTo(section - 1)}
            className="text-sm font-semibold text-ink disabled:opacity-30"
          >
            ← Back
          </button>
          {section < 8 && (
            <button
              type="button"
              onClick={() => goTo(section + 1)}
              className="bg-ink text-white text-sm font-semibold px-4 py-2 rounded-sm"
            >
              Save & Continue →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Centered({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <p className={`text-sm ${error ? "text-brick" : "text-muted"}`}>{children}</p>
    </div>
  );
}

function SaveIndicator({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "idle") return <div className="text-xs text-muted">Your progress saves automatically.</div>;
  if (status === "saving") return <div className="text-xs text-muted">Saving…</div>;
  if (status === "error") return <div className="text-xs text-brick">Couldn&apos;t save — check your connection.</div>;
  return <div className="text-xs text-green">Saved</div>;
}

function Stepper({ current, onJump }: { current: number; onJump: (n: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SECTIONS.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onJump(n)}
            className="text-[11px] font-semibold px-2 py-1 rounded-sm border whitespace-nowrap"
            style={{
              backgroundColor: active ? "#172622" : "white",
              color: active ? "white" : "#60716B",
              borderColor: "#DDEAE5",
            }}
          >
            {n}. {label}
          </button>
        );
      })}
    </div>
  );
}

function SectionIdentity({ intake }: { intake: IntakeRow }) {
  return (
    <div className="space-y-3">
      <h2 className="font-slab text-lg font-bold text-ink">Identity & Entry</h2>
      <p className="text-sm text-muted">
        Thanks, {intake.contact_first_name}. We have your contact details from when you started.
        You can verify and submit at the end. Use the sections below to tell us about your tax
        year.
      </p>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label="Name">
          {intake.contact_first_name} {intake.contact_last_name}
        </Field>
        <Field label="Tax year">{intake.tax_year}</Field>
        <Field label="Email">{intake.contact_email || "—"}</Field>
        <Field label="Phone">{intake.contact_phone || "—"}</Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-ink font-medium">{children}</div>
    </div>
  );
}

function SectionHousehold({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  const isMarried = form.filingStatus.startsWith("married");
  return (
    <div className="space-y-4">
      <h2 className="font-slab text-lg font-bold text-ink">Household & Filing Basics</h2>
      <Select
        label="Expected filing status"
        value={form.filingStatus}
        onChange={(v) => setForm({ ...form, filingStatus: v, hasSpouse: v.startsWith("married") })}
        options={[
          ["", "Select…"],
          ["single", "Single"],
          ["married_filing_jointly", "Married filing jointly"],
          ["married_filing_separately", "Married filing separately"],
          ["head_of_household", "Head of household"],
          ["qualifying_surviving_spouse", "Qualifying surviving spouse"],
        ]}
      />
      {isMarried && (
        <Checkbox
          label="My spouse will also need to sign / be included on this return"
          checked={form.hasSpouse}
          onChange={(v) => setForm({ ...form, hasSpouse: v })}
        />
      )}
      <NumberField
        label="Number of dependents"
        value={form.dependentsCount}
        onChange={(v) => setForm({ ...form, dependentsCount: v })}
      />
      <TextField
        label="State(s) you lived or worked in this year"
        placeholder="e.g. GA, FL"
        value={form.statesLivedWorked}
        onChange={(v) => setForm({ ...form, statesLivedWorked: v })}
      />
      <Select
        label="Return type"
        value={form.returnVariant}
        onChange={(v) => setForm({ ...form, returnVariant: v })}
        options={[
          ["original", "Original return"],
          ["amended", "Amended return"],
          ["prior_year", "Prior-year return"],
        ]}
      />
    </div>
  );
}

function SectionIncome({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  function toggleSource(key: string) {
    const has = form.incomeSources.includes(key);
    setForm({
      ...form,
      incomeSources: has ? form.incomeSources.filter((k) => k !== key) : [...form.incomeSources, key],
    });
  }
  return (
    <div className="space-y-4">
      <h2 className="font-slab text-lg font-bold text-ink">Income Sources</h2>
      <p className="text-sm text-muted">Select everything that applies to your tax year.</p>
      <div className="grid grid-cols-2 gap-2">
        {INCOME_SOURCES.map((s) => (
          <Checkbox
            key={s.key}
            label={s.label}
            checked={form.incomeSources.includes(s.key)}
            onChange={() => toggleSource(s.key)}
          />
        ))}
      </div>
      {form.incomeSources.includes("self_employment") && (
        <NumberField
          label="How many businesses?"
          value={form.businessCount}
          onChange={(v) => setForm({ ...form, businessCount: v })}
        />
      )}
      {form.incomeSources.includes("rental") && (
        <NumberField
          label="How many rental properties?"
          value={form.rentalCount}
          onChange={(v) => setForm({ ...form, rentalCount: v })}
        />
      )}
    </div>
  );
}

function SectionAdjustments({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="font-slab text-lg font-bold text-ink">Adjustments, Deductions & Credits</h2>
      <Select
        label="Do you expect to itemize deductions?"
        value={(form.answers.itemize_preference as string) || ""}
        onChange={(v) => setForm({ ...form, answers: { ...form.answers, itemize_preference: v } })}
        options={[
          ["", "Not sure — let's discuss"],
          ["standard", "Standard deduction"],
          ["itemize", "Itemize deductions"],
        ]}
      />
      <TextArea
        label="Anything else about deductions or credits we should know? (e.g. education, retirement contributions, childcare)"
        value={(form.answers.deductions_notes as string) || ""}
        onChange={(v) => setForm({ ...form, answers: { ...form.answers, deductions_notes: v } })}
      />
    </div>
  );
}

function SectionLifeChanges({ form, setForm }: { form: FormState; setForm: (f: FormState) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="font-slab text-lg font-bold text-ink">Life Changes & Special Situations</h2>
      <Checkbox
        label="I have a copy of my prior-year tax return"
        checked={form.hasPriorYearReturn}
        onChange={(v) => setForm({ ...form, hasPriorYearReturn: v })}
      />
      <Checkbox
        label="I've received an IRS or state notice"
        checked={form.hasIrsNotice}
        onChange={(v) => setForm({ ...form, hasIrsNotice: v })}
      />
      {form.hasIrsNotice && (
        <p className="text-xs text-amber bg-amber/10 border border-amber/30 rounded-sm px-3 py-2">
          We&apos;ll ask you to upload a copy of the notice in the Documents step, and this will be
          flagged for a closer staff review.
        </p>
      )}
      <Checkbox
        label="I have one or more years of unfiled returns"
        checked={form.hasUnfiledYears}
        onChange={(v) => setForm({ ...form, hasUnfiledYears: v })}
      />
      <Checkbox
        label="My bookkeeping needs cleanup before this return can be prepared"
        checked={form.bookkeepingCleanup}
        onChange={(v) => setForm({ ...form, bookkeepingCleanup: v })}
      />
      <TextArea
        label="Any other life changes this year? (marriage, new child, home purchase, job change, etc.)"
        value={(form.answers.life_changes_notes as string) || ""}
        onChange={(v) => setForm({ ...form, answers: { ...form.answers, life_changes_notes: v } })}
      />
    </div>
  );
}

function SectionPayment({
  form,
  setForm,
  intake,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  intake: IntakeRow;
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-slab text-lg font-bold text-ink">Payment Preference & Engagement Readiness</h2>
      <Select
        label="How would you prefer to pay for our services?"
        value={form.paymentPreference}
        onChange={(v) => setForm({ ...form, paymentPreference: v })}
        options={[
          ["", "Select…"],
          ["upfront", "Pay upfront"],
          ["refund", "Deduct from my refund"],
          ["unsure", "Not sure yet"],
          ["discuss", "I'd like to discuss this with staff"],
        ]}
      />
      <TextArea
        label="Anything else that would help us prepare a quote for you?"
        value={(form.answers.engagement_notes as string) || ""}
        onChange={(v) => setForm({ ...form, answers: { ...form.answers, engagement_notes: v } })}
      />
      {intake.complexity_classification && (
        <p className="text-xs text-muted">
          Based on your answers so far, this looks like a{" "}
          <strong className="text-ink">{intake.complexity_classification}</strong> return.
          {intake.consultation_recommended && " We'll likely recommend a short consultation."}
        </p>
      )}
    </div>
  );
}

function SectionDocuments({
  token,
  docs,
  onUploaded,
}: {
  token: string;
  docs: IntakeDocumentRequest[];
  onUploaded: () => void;
}) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const blockingMissing = docs.filter((d) => d.is_blocking && d.status === "requested").length;

  async function handleFile(doc: IntakeDocumentRequest, file: File) {
    setUploadingKey(doc.id);
    setError(null);
    const fd = new FormData();
    fd.append("token", token);
    fd.append("documentRequestId", doc.id);
    fd.append("file", file);
    const res = await fetch("/api/intake/upload", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({ ok: false }));
    setUploadingKey(null);
    if (!json.ok) {
      setError(json.error || "Upload failed. Please try again.");
      return;
    }
    onUploaded();
  }

  return (
    <div className="space-y-4">
      <h2 className="font-slab text-lg font-bold text-ink">Documents</h2>
      <p className="text-sm text-muted">
        Based on your answers, here&apos;s what we&apos;ll need. You can still submit if something
        is missing — we&apos;ll follow up.
      </p>
      {blockingMissing > 0 && (
        <p className="text-xs text-amber bg-amber/10 border border-amber/30 rounded-sm px-3 py-2">
          {blockingMissing} required document{blockingMissing === 1 ? "" : "s"} still needed.
        </p>
      )}
      {error && <p className="text-xs text-brick">{error}</p>}
      <div className="space-y-2">
        {docs.map((doc) => (
          <div key={doc.id} className="border border-line rounded-sm p-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-ink">
                {doc.item_title}
                {doc.is_required && <span className="text-brick ml-1">*</span>}
              </div>
              <div className="text-xs text-muted">{doc.item_reason}</div>
              <div className="text-xs mt-0.5">
                Status: <span className="font-medium text-ink">{doc.status.replace(/_/g, " ")}</span>
              </div>
            </div>
            <label className="text-xs font-semibold text-ink border border-line rounded-sm px-3 py-1.5 cursor-pointer whitespace-nowrap">
              {uploadingKey === doc.id ? "Uploading…" : "Upload"}
              <input
                type="file"
                className="hidden"
                disabled={uploadingKey === doc.id}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(doc, f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionReview({
  token,
  intake,
  onTokenRotated,
  onIntakeUpdated,
  onSubmitted,
}: {
  token: string;
  intake: IntakeRow;
  onTokenRotated: (t: string) => void;
  onIntakeUpdated: (i: IntakeRow) => void;
  onSubmitted: () => void;
}) {
  const [channel, setChannel] = useState<"email" | "sms">(intake.contact_email ? "email" : "sms");
  const destination = channel === "email" ? intake.contact_email || "" : intake.contact_phone || "";
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [typedName, setTypedName] = useState("");
  const [accuracyAck, setAccuracyAck] = useState(false);
  const [commConsent, setCommConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [recordAck, setRecordAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const verified = intake.contact_email_verified || intake.contact_phone_verified;

  async function sendCode() {
    setSending(true);
    setNotice(null);
    setDevCode(null);
    const res = await fetch("/api/intake/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, channel, destination }),
    });
    const json = await res.json().catch(() => ({ ok: false }));
    setSending(false);
    if (!json.ok) {
      setNotice(json.reason || json.error || "Couldn't send a code right now.");
      if (json.devCode) setDevCode(json.devCode);
      return;
    }
    setCodeSent(true);
    if (json.devCode) setDevCode(json.devCode);
  }

  async function verifyCode() {
    setVerifying(true);
    setNotice(null);
    const { data, error } = await supabaseIntake.rpc("verify_intake_code", {
      p_token: token,
      p_channel: channel,
      p_code: code.trim(),
    });
    setVerifying(false);
    if (error || !data) {
      setNotice(error?.message || "That code didn't work.");
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    onIntakeUpdated(row.intake as IntakeRow);
    if (row.new_token) onTokenRotated(row.new_token as string);
    setNotice("Verified!");
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    let ip: string | null = null;
    try {
      const r = await fetch("/api/intake/client-info");
      ip = (await r.json())?.ip ?? null;
    } catch {
      ip = null;
    }
    const { data, error } = await supabaseIntake.rpc("submit_intake", {
      p_token: token,
      p_typed_name: typedName.trim(),
      p_accuracy_ack: accuracyAck,
      p_communication_consent: commConsent,
      p_marketing_consent: marketingConsent,
      p_electronic_record_ack: recordAck,
      p_ip_address: ip,
      p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
    setSubmitting(false);
    if (error || !data) {
      setSubmitError(error?.message || "We couldn't submit your intake. Please try again.");
      return;
    }
    onSubmitted();
  }

  return (
    <div className="space-y-5">
      <h2 className="font-slab text-lg font-bold text-ink">Review & Submit</h2>

      <div className="border border-line rounded-sm p-3 text-sm space-y-1">
        <div><span className="text-muted">Name:</span> {intake.contact_first_name} {intake.contact_last_name}</div>
        <div><span className="text-muted">Tax year:</span> {intake.tax_year}</div>
        <div><span className="text-muted">Complexity:</span> {intake.complexity_classification || "—"}</div>
      </div>

      <div className="border border-line rounded-sm p-4 space-y-3">
        <div className="text-sm font-semibold text-ink">Verify your contact information</div>
        <p className="text-xs text-muted">
          A valid return link alone doesn&apos;t confirm this is really you — we need to verify your
          email or mobile number before this intake can be submitted.
        </p>
        {verified ? (
          <p className="text-sm text-green font-semibold">Verified ✓</p>
        ) : (
          <>
            <div className="flex gap-2">
              {intake.contact_email && (
                <ChannelButton active={channel === "email"} onClick={() => setChannel("email")}>
                  Email
                </ChannelButton>
              )}
              {intake.contact_phone && (
                <ChannelButton active={channel === "sms"} onClick={() => setChannel("sms")}>
                  Text
                </ChannelButton>
              )}
            </div>
            {!codeSent ? (
              <button
                type="button"
                onClick={sendCode}
                disabled={sending || !destination}
                className="text-sm font-semibold bg-ink text-white px-3 py-2 rounded-sm disabled:opacity-60"
              >
                {sending ? "Sending…" : `Send code to ${destination || "—"}`}
              </button>
            ) : (
              <div className="flex gap-2 items-center">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6-digit code"
                  maxLength={6}
                  className="border border-line rounded-sm px-3 py-2 text-sm w-32"
                />
                <button
                  type="button"
                  onClick={verifyCode}
                  disabled={verifying || code.trim().length < 4}
                  className="text-sm font-semibold bg-ink text-white px-3 py-2 rounded-sm disabled:opacity-60"
                >
                  {verifying ? "Checking…" : "Verify"}
                </button>
                <button type="button" onClick={sendCode} disabled={sending} className="text-xs text-muted underline">
                  Resend
                </button>
              </div>
            )}
            {notice && <p className="text-xs text-brick">{notice}</p>}
            {devCode && (
              <p className="text-xs text-amber bg-amber/10 border border-amber/30 rounded-sm px-3 py-2">
                Dev/preview only — this code is never shown in production: <strong>{devCode}</strong>
              </p>
            )}
          </>
        )}
      </div>

      <div className="border border-line rounded-sm p-4 space-y-3">
        <div className="text-sm font-semibold text-ink">Acknowledgment</div>
        <p className="text-xs text-muted">
          This is an intake acknowledgment only — it is not an engagement letter or a tax-form
          signature. We&apos;ll follow up separately about engaging our services.
        </p>
        <TextField label="Type your full legal name" value={typedName} onChange={setTypedName} />
        <Checkbox
          label="I confirm the information I've provided is accurate to the best of my knowledge."
          checked={accuracyAck}
          onChange={setAccuracyAck}
        />
        <Checkbox
          label="I consent to being contacted by email, phone, or text about this intake."
          checked={commConsent}
          onChange={setCommConsent}
        />
        <Checkbox
          label="I'd like to receive occasional updates and offers (optional)."
          checked={marketingConsent}
          onChange={setMarketingConsent}
        />
        <Checkbox
          label="I acknowledge this submission will be kept as an electronic record."
          checked={recordAck}
          onChange={setRecordAck}
        />
      </div>

      {submitError && <p className="text-sm text-brick">{submitError}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !verified || !typedName.trim() || !accuracyAck || !recordAck}
        className="w-full bg-ink text-white text-sm font-semibold py-3 rounded-sm disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit Intake"}
      </button>
    </div>
  );
}

function ChannelButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-semibold px-3 py-1.5 rounded-sm border"
      style={{ backgroundColor: active ? "#172622" : "white", color: active ? "white" : "#172622", borderColor: "#DDEAE5" }}
    >
      {children}
    </button>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted mb-1">{label}</label>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-line rounded-sm px-3 py-2 text-sm"
      />
    </div>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full border border-line rounded-sm px-3 py-2 text-sm"
      />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted mb-1">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-full border border-line rounded-sm px-3 py-2 text-sm"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-white"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm text-ink cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>{label}</span>
    </label>
  );
}
