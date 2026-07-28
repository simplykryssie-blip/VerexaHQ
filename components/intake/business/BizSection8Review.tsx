"use client";

import { useEffect, useRef, useState } from "react";
import { Card, SubHeading, TextField, Checkbox } from "../fields";
import { supabaseIntake, type IntakeRow, type IntakeDocumentRequest } from "@/lib/supabaseIntake";
import { publicIntakeErrorMessage } from "@/lib/publicIntakeError";
import { reportIntakeError } from "@/lib/reportIntakeError";
import { getStr, getArray, getBool, type AnyRecord } from "@/lib/intakeAnswers";
import { stateLabel } from "@/lib/intakeStates";
import { ENTITY_CLASSIFICATION_LABELS } from "@/lib/businessIntakeOptions";

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

type OpenInquiry = { id: string; category: string; client_question: string; status: "open" | "answered"; client_response: string | null };

function FollowUpQuestions({ token }: { token: string }) {
  const [inquiries, setInquiries] = useState<OpenInquiry[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabaseIntake.rpc("public_intake_open_inquiries", { p_token: token });
      if (error) reportIntakeError("public_intake_open_inquiries", error);
      setInquiries((data as OpenInquiry[]) || []);
      setLoaded(true);
    })();
  }, [token]);

  async function respond(id: string) {
    const text = (drafts[id] || "").trim();
    if (!text) return;
    setSavingId(id);
    const { error } = await supabaseIntake.rpc("public_respond_intake_inquiry", { p_token: token, p_inquiry_id: id, p_response: text });
    setSavingId(null);
    if (error) {
      reportIntakeError("public_respond_intake_inquiry", error);
      return;
    }
    setInquiries((prev) => prev.map((q) => (q.id === id ? { ...q, status: "answered", client_response: text } : q)));
  }

  if (!loaded || inquiries.length === 0) return null;

  return (
    <Card>
      <SubHeading title="A few follow-up questions" />
      <p className="text-xs text-muted mb-2">
        Reviewing your answers raised these questions. Answering them now can help us avoid
        contacting you again later, but it&apos;s not required to submit.
      </p>
      <div className="space-y-3">
        {inquiries.map((q) => (
          <div key={q.id} className="border border-line rounded-sm p-3">
            <div className="text-sm text-ink mb-2">{q.client_question}</div>
            {q.status === "answered" ? (
              <p className="text-xs text-green">Thanks — you told us: &quot;{q.client_response}&quot;</p>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={drafts[q.id] || ""}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="Your answer"
                  className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={savingId === q.id || !(drafts[q.id] || "").trim()}
                  onClick={() => respond(q.id)}
                  className="text-sm font-semibold bg-ink text-white px-3 py-2 rounded-sm disabled:opacity-50 shrink-0"
                >
                  {savingId === q.id ? "Saving…" : "Send"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function BizSection8Review({
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

  const owners = getArray<AnyRecord>(answers, ["owners"]);
  const returnStatus = (answers.return_status as AnyRecord) || {};
  const principalAddress = ((answers.address as AnyRecord)?.principal as AnyRecord) || {};
  const missingRequired: string[] = [];
  if (owners.length === 0) missingRequired.push("At least one owner (Section 2)");
  if (!getStr(returnStatus, ["already_filed"])) missingRequired.push("Whether a return has already been filed (Section 1)");
  if (!getStr(returnStatus, ["is_initial"])) missingRequired.push("Whether this is the first return (Section 1)");
  if (!getStr(returnStatus, ["is_final"])) missingRequired.push("Whether this is the final return (Section 1)");
  if (!getStr(returnStatus, ["is_short_period"])) missingRequired.push("Whether this return covers fewer than 12 months (Section 1)");
  if (!getStr(principalAddress, ["street"]) || !getStr(principalAddress, ["city"]) || !getStr(principalAddress, ["state"]))
    missingRequired.push("Principal business address (Section 1)");
  if (!getStr((answers.bookkeeping as AnyRecord) || {}, ["status"])) missingRequired.push("Bookkeeping status (Section 4)");

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
  const returnTypeSummary =
    [
      getStr(returnStatus, ["is_initial"]) === "yes" && "Initial return",
      getStr(returnStatus, ["is_final"]) === "yes" && "Final return",
      getStr(returnStatus, ["needs_amendment"]) === "yes" && "Amended return",
      getStr(returnStatus, ["is_short_period"]) === "yes" && "Short-period return",
    ]
      .filter(Boolean)
      .join(", ") || "Original return";

  return (
    <div className="space-y-4">
      <SubHeading title="Review your answers" />
      <Card>
        <SummaryRow label="Tax year" value={String(intake.tax_year)} section={1} onJump={onJump} />
        <SummaryRow label="Legal business name" value={intake.legal_business_name || ""} section={1} onJump={onJump} />
        <SummaryRow
          label="Tax classification"
          value={ENTITY_CLASSIFICATION_LABELS[intake.entity_classification || ""] || ""}
          section={1}
          onJump={onJump}
        />
        <SummaryRow label="Return type" value={returnTypeSummary} section={1} onJump={onJump} />
        <SummaryRow label="Owners added" value={String(owners.length)} section={2} onJump={onJump} />
        <SummaryRow label="States of operation" value={states} section={3} onJump={onJump} />
        <SummaryRow
          label="Bookkeeping status"
          value={getStr((answers.bookkeeping as AnyRecord) || {}, ["status"])}
          section={4}
          onJump={onJump}
        />
      </Card>

      {intake.ownership_percentage_total != null && Math.abs(Number(intake.ownership_percentage_total) - 100) > 0.5 && (
        <Card>
          <p className="text-sm text-brick">
            Ownership percentages currently total {intake.ownership_percentage_total}%, not 100%. Our
            team will follow up to confirm — this won&apos;t block your submission.
          </p>
        </Card>
      )}

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

      <FollowUpQuestions token={token} />

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
        <button type="button" onClick={() => onJump(8)} className="text-xs font-semibold text-blue underline mt-1">
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
