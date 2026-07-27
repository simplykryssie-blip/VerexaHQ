"use client";

import { useRef, useState } from "react";
import { Card, SubHeading, TextField, Checkbox } from "./fields";
import { supabaseIntake, type IntakeRow, type IntakeDocumentRequest } from "@/lib/supabaseIntake";
import { publicIntakeErrorMessage } from "@/lib/publicIntakeError";
import { reportIntakeError } from "@/lib/reportIntakeError";
import { getStr, getArray, getBool, type AnyRecord } from "@/lib/intakeAnswers";
import { stateLabel } from "@/lib/intakeStates";

function SummaryRow({ label, value, section, onJump }: { label: string; value: string; section: number; onJump: (n: number) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm py-1.5 border-t border-line first:border-t-0">
      <div className="min-w-0">
        <div className="text-xs text-muted">{label}</div>
        <div className="text-ink break-words">{value || "—"}</div>
      </div>
      <button type="button" onClick={() => onJump(section)} className="text-xs font-semibold text-blue underline shrink-0">
        Edit
      </button>
    </div>
  );
}

export function Section8Review({
  token,
  intake,
  answers,
  docs,
  onTokenRotated,
  onIntakeUpdated,
  onSubmitted,
  onJump,
}: {
  token: string;
  intake: IntakeRow;
  answers: AnyRecord;
  docs: IntakeDocumentRequest[];
  onTokenRotated: (t: string) => void;
  onIntakeUpdated: (i: IntakeRow) => void;
  onSubmitted: () => void;
  onJump: (n: number) => void;
}) {
  const [channel, setChannel] = useState<"email" | "sms">(intake.contact_email ? "email" : "sms");
  const destination = channel === "email" ? intake.contact_email || "" : intake.contact_phone || "";
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [previewBanner, setPreviewBanner] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [typedName, setTypedName] = useState("");
  const [accuracyAck, setAccuracyAck] = useState(false);
  const [commConsent, setCommConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [recordAck, setRecordAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const verified = intake.contact_email_verified || intake.contact_phone_verified;

  const missingRequired: string[] = [];
  if (!getStr(answers, ["filing_status_expected"])) missingRequired.push("Filing status (Section 2)");
  if (!getStr((answers.taxpayer_detail as AnyRecord) || {}, ["dob"])) missingRequired.push("Date of birth (Section 2)");
  if (getBool(answers, ["has_spouse"]) && !getStr((answers.spouse as AnyRecord) || {}, ["dob"])) missingRequired.push("Spouse date of birth (Section 2)");
  {
    const missingDependentDob = getArray<AnyRecord>(answers, ["dependents"]).some((d) => !getStr(d, ["dob"]));
    if (missingDependentDob) missingRequired.push("Dependent date of birth (Section 2)");
  }
  if (getArray(answers, ["income_sources"]).length === 0) missingRequired.push("At least one income source (Section 3)");
  {
    const w2Detail = (answers.w2_detail as AnyRecord) || {};
    const employerCount = w2Detail.employer_count;
    if (getArray<string>(answers, ["income_sources"]).includes("w2") && (typeof employerCount !== "number" || employerCount < 1)) {
      missingRequired.push("Number of W-2 employers (Section 3)");
    }
  }
  if (!getStr(answers, ["payment_preference"])) missingRequired.push("Payment preference (Section 6)");

  const blockingMissing = docs.filter((d) => d.is_blocking && d.status === "requested");
  const nonblockingMissing = docs.filter((d) => !d.is_blocking && d.status === "requested");

  async function sendCode() {
    setSending(true);
    setNotice(null);
    setDevCode(null);
    setPreviewBanner(false);
    const res = await fetch("/api/intake/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, channel, destination }),
    });
    const json = await res.json().catch(() => ({ ok: false }));
    setSending(false);
    if (!json.ok) {
      setNotice(json.reason || json.error || "Couldn't send a code right now.");
      if (json.devCode) {
        setDevCode(json.devCode);
        setPreviewBanner(true);
        setCodeSent(true);
      }
      return;
    }
    setCodeSent(true);
    if (json.devCode) {
      setDevCode(json.devCode);
      setPreviewBanner(true);
    }
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
      if (error) reportIntakeError("verify_intake_code", error);
      setNotice(publicIntakeErrorMessage(error, "That code didn't work. Please try again."));
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    onIntakeUpdated(row.intake as IntakeRow);
    if (row.new_token) onTokenRotated(row.new_token as string);
    setNotice("Verified!");
  }

  async function handleSubmit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
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
      if (error || !data) {
        if (error) reportIntakeError("submit_intake", error);
        setSubmitError(publicIntakeErrorMessage(error, "We couldn't submit your intake. Please try again."));
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }
      onSubmitted();
    } catch (err) {
      reportIntakeError("submit_intake", err);
      setSubmitError("We couldn't submit your intake. Please try again.");
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const states = getArray<string>(answers, ["states_lived_worked"]).map(stateLabel).join(", ");
  const dependentsCount = getArray(answers, ["dependents"]).length;
  const incomeSources = getArray<string>(answers, ["income_sources"]).join(", ");

  return (
    <div className="space-y-4">
      <SubHeading title="Review your answers" />
      <Card>
        <SummaryRow label="Filing status" value={getStr(answers, ["filing_status_expected"])} section={2} onJump={onJump} />
        <SummaryRow label="Spouse" value={getBool(answers, ["has_spouse"]) ? getStr((answers.spouse as AnyRecord) || {}, ["first_name"]) || "Added" : "Not applicable"} section={2} onJump={onJump} />
        <SummaryRow label="Dependents" value={String(dependentsCount)} section={2} onJump={onJump} />
        <SummaryRow label="States lived/worked in" value={states} section={2} onJump={onJump} />
        <SummaryRow label="Income sources" value={incomeSources} section={3} onJump={onJump} />
        <SummaryRow label="Payment preference" value={getStr(answers, ["payment_preference"])} section={6} onJump={onJump} />
      </Card>

      {missingRequired.length > 0 && (
        <Card>
          <SubHeading title="Missing required answers" />
          <ul className="text-sm text-brick list-disc pl-4">
            {missingRequired.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <SubHeading title="Documents" />
        {blockingMissing.length === 0 && nonblockingMissing.length === 0 ? (
          <p className="text-sm text-green">All requested documents are accounted for.</p>
        ) : (
          <>
            {blockingMissing.length > 0 && (
              <p className="text-sm text-brick">{blockingMissing.length} required document(s) still missing.</p>
            )}
            {nonblockingMissing.length > 0 && (
              <p className="text-sm text-muted">{nonblockingMissing.length} optional document(s) not yet provided.</p>
            )}
          </>
        )}
        <button type="button" onClick={() => onJump(7)} className="text-xs font-semibold text-blue underline mt-1">
          Review documents
        </button>
      </Card>

      <div className="border border-line rounded-sm p-4 space-y-3">
        <div className="text-sm font-semibold text-ink">Verify your contact information</div>
        <p className="text-xs text-muted">
          A valid return link alone doesn&apos;t confirm this is really you -- we need to verify your
          email or mobile number before this intake can be submitted.
        </p>
        {verified ? (
          <p className="text-sm text-green font-semibold">Verified ✓</p>
        ) : (
          <>
            <div className="flex gap-2">
              {intake.contact_email && (
                <button
                  type="button"
                  onClick={() => setChannel("email")}
                  className="text-xs font-semibold px-3 py-1.5 rounded-sm border"
                  style={{ backgroundColor: channel === "email" ? "#172622" : "white", color: channel === "email" ? "white" : "#172622", borderColor: "#DDEAE5" }}
                >
                  Email
                </button>
              )}
              {intake.contact_phone && (
                <button
                  type="button"
                  onClick={() => setChannel("sms")}
                  className="text-xs font-semibold px-3 py-1.5 rounded-sm border"
                  style={{ backgroundColor: channel === "sms" ? "#172622" : "white", color: channel === "sms" ? "white" : "#172622", borderColor: "#DDEAE5" }}
                >
                  Text
                </button>
              )}
            </div>
            {previewBanner && (
              <div className="text-xs text-ink bg-amber/10 border border-amber/30 rounded-sm px-3 py-2">
                <strong>Preview testing mode:</strong> verification messages are not being delivered.
              </div>
            )}
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
              <div className="flex flex-wrap gap-2 items-center">
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
                  {verifying ? "Checking…" : devCode ? "Verify in preview" : "Verify"}
                </button>
                <button type="button" onClick={sendCode} disabled={sending} className="text-xs text-muted underline">
                  Resend
                </button>
              </div>
            )}
            {notice && <p className="text-xs text-brick">{notice}</p>}
            {devCode && (
              <p className="text-xs text-amber bg-amber/10 border border-amber/30 rounded-sm px-3 py-2">
                Preview-only test code (never shown in production): <strong>{devCode}</strong>
              </p>
            )}
          </>
        )}
      </div>

      <div className="border border-line rounded-sm p-4 space-y-3">
        <div className="text-sm font-semibold text-ink">Acknowledgment</div>
        <p className="text-xs text-muted">
          This is an intake acknowledgment only -- it is not an engagement letter or a tax-form
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
        <Checkbox label="I'd like to receive occasional updates and offers (optional)." checked={marketingConsent} onChange={setMarketingConsent} />
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
