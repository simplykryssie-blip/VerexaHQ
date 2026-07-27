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
import { reportIntakeError } from "@/lib/reportIntakeError";
import { setDeep, getStr, type AnyRecord } from "@/lib/intakeAnswers";
import { SectionProgress } from "@/components/intake/SectionProgress";
import { Select } from "@/components/intake/fields";
import { Section2Household } from "@/components/intake/Section2Household";
import { Section3Income } from "@/components/intake/Section3Income";
import { Section4Adjustments } from "@/components/intake/Section4Adjustments";
import { Section5LifeChanges } from "@/components/intake/Section5LifeChanges";
import { Section6Payment } from "@/components/intake/Section6Payment";
import { Section7Documents, type UploadedDoc } from "@/components/intake/Section7Documents";
import { Section8Review } from "@/components/intake/Section8Review";

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

export default function IntakeWizardPage() {
  const params = useParams<{ token: string }>();
  const [token, setToken] = useState(params.token);
  const [intake, setIntake] = useState<IntakeRow | null>(null);
  const [docs, setDocs] = useState<IntakeDocumentRequest[]>([]);
  const [uploaded, setUploaded] = useState<UploadedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState(1);
  const [answers, setAnswers] = useState<AnyRecord>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitted, setSubmitted] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstLoad = useRef(true);

  const loadDocs = useCallback(async (tok: string) => {
    const [{ data: reqs }, { data: files }] = await Promise.all([
      supabaseIntake.rpc("public_intake_document_requests", { p_token: tok }),
      supabaseIntake.rpc("public_intake_documents", { p_token: tok }),
    ]);
    setDocs((reqs as IntakeDocumentRequest[]) || []);
    setUploaded((files as UploadedDoc[]) || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabaseIntake.rpc("resume_public_intake", { p_token: token });
      if (cancelled) return;
      if (error || !data) {
        if (error) reportIntakeError("resume_public_intake", error);
        setLoadError("This link is invalid or has expired. Please contact our office for a new one.");
        setLoading(false);
        return;
      }
      const row = data as IntakeRow;
      setIntake(row);
      setAnswers((row.answers as AnyRecord) || {});
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
    async (nextSection: number, currentAnswers: AnyRecord) => {
      setSaveStatus("saving");
      const { data, error } = await supabaseIntake.rpc("save_intake_progress", {
        p_token: token,
        p_section: nextSection,
        p_patch: currentAnswers,
      });
      if (error || !data) {
        if (error) reportIntakeError("save_intake_progress", error);
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
      void save(section, answers);
    }, 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  function setAnswer(path: string[], value: unknown) {
    setAnswers((prev) => setDeep(prev, path, value));
  }

  function goTo(next: number) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    void save(next, answers);
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
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-6 sm:py-8 overflow-x-hidden">
      <div className="flex items-center gap-3 mb-4">
        <LogoMark size={28} />
        <div className="min-w-0">
          <div className="font-slab text-lg font-bold text-ink">Tax Intake</div>
          <SaveIndicator status={saveStatus} />
        </div>
      </div>

      <SectionProgress sections={SECTIONS} current={section} onJump={goTo} />

      <div className="bg-white border border-line rounded-sm p-3.5 sm:p-6 mt-4 min-w-0">
        {section === 1 && <SectionIdentity intake={intake} answers={answers} setAnswer={setAnswer} />}
        {section === 2 && <Section2Household answers={answers} setAnswer={setAnswer} />}
        {section === 3 && <Section3Income answers={answers} setAnswer={setAnswer} />}
        {section === 4 && <Section4Adjustments answers={answers} setAnswer={setAnswer} />}
        {section === 5 && <Section5LifeChanges answers={answers} setAnswer={setAnswer} />}
        {section === 6 && <Section6Payment answers={answers} setAnswer={setAnswer} />}
        {section === 7 && (
          <Section7Documents token={token} docs={docs} uploaded={uploaded} onRefresh={() => loadDocs(token)} />
        )}
        {section === 8 && (
          <Section8Review
            token={token}
            intake={intake}
            answers={answers}
            docs={docs}
            onTokenRotated={(t) => setToken(t)}
            onIntakeUpdated={(i) => setIntake(i)}
            onSubmitted={() => setSubmitted(true)}
            onJump={goTo}
          />
        )}

        <div className="flex flex-wrap gap-3 justify-between items-center mt-6 pt-4 border-t border-line">
          <button
            type="button"
            disabled={section === 1}
            onClick={() => goTo(section - 1)}
            className="text-sm font-semibold text-ink disabled:opacity-30 py-2 px-1"
          >
            ← Back
          </button>
          {section < 8 && (
            <button
              type="button"
              onClick={() => goTo(section + 1)}
              className="flex-1 sm:flex-none bg-ink text-white text-sm font-semibold px-4 py-2.5 rounded-sm"
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
      <p className={`text-sm text-center ${error ? "text-brick" : "text-muted"}`}>{children}</p>
    </div>
  );
}

function SaveIndicator({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "idle") return <div className="text-xs text-muted">Your progress saves automatically.</div>;
  if (status === "saving") return <div className="text-xs text-muted">Saving…</div>;
  if (status === "error") return <div className="text-xs text-brick">Couldn&apos;t save — check your connection.</div>;
  return <div className="text-xs text-green">Saved</div>;
}

function SectionIdentity({
  intake,
  answers,
  setAnswer,
}: {
  intake: IntakeRow;
  answers: AnyRecord;
  setAnswer: (path: string[], value: unknown) => void;
}) {
  const readiness = (answers.readiness as AnyRecord) || {};
  return (
    <div className="space-y-3">
      <h2 className="font-slab text-lg font-bold text-ink">Identity & Entry</h2>
      <p className="text-sm text-muted">
        Thanks, {intake.contact_first_name}. We have your contact details from when you started.
        You can verify and submit at the end. Use the sections below to tell us about your tax
        year.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <Field label="Name">
          {intake.contact_first_name} {intake.contact_last_name}
        </Field>
        <Field label="Tax year">{intake.tax_year}</Field>
        <Field label="Email">{intake.contact_email || "—"}</Field>
        <Field label="Phone">{intake.contact_phone || "—"}</Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-line">
        <Select
          label="Best contact method"
          value={getStr(readiness, ["best_contact_method"])}
          onChange={(v) => setAnswer(["readiness", "best_contact_method"], v)}
          options={[["", "Select…"], ["email", "Email"], ["phone", "Phone"], ["text", "Text"], ["portal", "Portal message"]]}
        />
        <Select
          label="Best contact time"
          value={getStr(readiness, ["best_contact_time"])}
          onChange={(v) => setAnswer(["readiness", "best_contact_time"], v)}
          options={[["", "Select…"], ["morning", "Morning"], ["afternoon", "Afternoon"], ["evening", "Evening"], ["anytime", "Anytime"]]}
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-ink font-medium break-words">{children}</div>
    </div>
  );
}
