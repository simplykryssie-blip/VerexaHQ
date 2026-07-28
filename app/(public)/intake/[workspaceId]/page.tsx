"use client";

import { useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import { supabaseIntake, isIntakeSupabaseConfigured } from "@/lib/supabaseIntake";
import { publicIntakeErrorMessage } from "@/lib/publicIntakeError";
import { reportIntakeError } from "@/lib/reportIntakeError";

const CURRENT_TAX_YEAR = new Date().getFullYear() - 1;
const GENERIC_START_ERROR = "We couldn't start your intake right now. Please try again.";

type EntityClassification =
  | "sole_prop"
  | "smllc_individual"
  | "smllc_s_corp"
  | "smllc_c_corp"
  | "mmllc_partnership"
  | "mmllc_s_corp"
  | "mmllc_c_corp"
  | "s_corp"
  | "c_corp"
  | "partnership"
  | "unsure";

// Routes to the Individual Tax Intake instead of this one.
const INDIVIDUAL_ROUTED = new Set<EntityClassification>(["sole_prop", "smllc_individual"]);

// Full classification list -- only ever shown compactly, in the "I already
// know the classification" expert dropdown. The guided interview below
// derives the same values without ever displaying all 11 as cards.
const ENTITY_OPTIONS: [EntityClassification, string][] = [
  ["sole_prop", "Sole proprietorship"],
  ["smllc_individual", "Single-member LLC reported on the owner's individual return"],
  ["smllc_s_corp", "Single-member LLC taxed as an S corporation"],
  ["smllc_c_corp", "Single-member LLC taxed as a C corporation"],
  ["mmllc_partnership", "Multi-member LLC taxed as a partnership"],
  ["mmllc_s_corp", "Multi-member LLC taxed as an S corporation"],
  ["mmllc_c_corp", "Multi-member LLC taxed as a C corporation"],
  ["s_corp", "S Corporation"],
  ["c_corp", "C Corporation"],
  ["partnership", "Partnership"],
  ["unsure", "I'm not sure how the business is taxed"],
];

type OwnerCount = "one" | "multiple" | "unsure" | "";
type EntityFormed = "llc" | "corporation" | "partnership" | "none" | "unsure" | "";
type CorpElection = "s_corp" | "c_corp" | "none" | "unsure" | "";

// The only two-dimensional branch in the derived-routing table (owner
// count x corporate election) -- pulled out as a pure function so it can
// be tested in isolation from the UI.
function deriveLlcClassification(ownerCount: "one" | "multiple", corpElection: "s_corp" | "c_corp" | "none"): EntityClassification {
  if (corpElection === "s_corp") return ownerCount === "one" ? "smllc_s_corp" : "mmllc_s_corp";
  if (corpElection === "c_corp") return ownerCount === "one" ? "smllc_c_corp" : "mmllc_c_corp";
  return ownerCount === "one" ? "smllc_individual" : "mmllc_partnership";
}

type Step =
  | "choose"
  | "individual"
  | "business_classify_q1"
  | "business_classify_q2"
  | "business_classify_q3"
  | "business_classify_expert"
  | "business_sole_prop_notice"
  | "business_contact";

export default function IntakeStartPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();

  const [step, setStep] = useState<Step>("choose");
  const [taxYear] = useState(CURRENT_TAX_YEAR);
  const [isReturning, setIsReturning] = useState<"yes" | "no" | "">("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [legalBusinessName, setLegalBusinessName] = useState("");
  const [entityClassification, setEntityClassification] = useState<EntityClassification | "">("");
  const [ownerCount, setOwnerCount] = useState<OwnerCount>("");
  const [entityFormed, setEntityFormed] = useState<EntityFormed>("");
  const [expertSelection, setExpertSelection] = useState<EntityClassification | "">("");
  const [usedExpert, setUsedExpert] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Belt-and-suspenders against a double click racing ahead of the
  // `disabled={submitting}` re-render: this ref is checked synchronously,
  // before React has necessarily committed the state update.
  const submittingRef = useRef(false);

  // Applies a derived (or expert-picked) classification and routes to the
  // correct next step: sole-prop/disregarded-LLC to the individual-intake
  // notice, everything else (including "unsure") to the business contact
  // form.
  function applyClassification(value: EntityClassification) {
    setEntityClassification(value);
    setStep(INDIVIDUAL_ROUTED.has(value) ? "business_sole_prop_notice" : "business_contact");
  }

  function classifyBackStep(): Step {
    if (usedExpert) return "business_classify_expert";
    if (entityFormed === "llc" || entityFormed === "corporation") return "business_classify_q3";
    if (ownerCount) return "business_classify_q2";
    return "business_classify_q1";
  }

  async function handleIndividualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setError("Please provide an email address or mobile number so we can reach you.");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabaseIntake.rpc("start_public_intake", {
        p_workspace_id: workspaceId,
        p_tax_year: taxYear,
        p_return_type: "individual",
        p_is_returning: isReturning === "yes",
        p_first_name: firstName.trim(),
        p_last_name: lastName.trim(),
        p_email: email.trim() || null,
        p_phone: phone.trim() || null,
      });

      if (rpcError || !data) {
        if (rpcError) reportIntakeError("start_public_intake", rpcError);
        setError(rpcError ? publicIntakeErrorMessage(rpcError, GENERIC_START_ERROR) : GENERIC_START_ERROR);
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      const token = row?.raw_token as string | undefined;
      if (!token) {
        setError(GENERIC_START_ERROR);
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }
      // Leave submitting=true / the ref locked through navigation -- the
      // button should stay disabled until this screen unmounts, not flip
      // back to clickable while the redirect is in flight.
      router.replace(`/intake/r/${token}`);
    } catch (err) {
      reportIntakeError("start_public_intake", err);
      setError(GENERIC_START_ERROR);
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleBusinessSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    setError(null);

    if (!legalBusinessName.trim()) {
      setError("Please enter the business's legal name.");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter the primary contact's first and last name.");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setError("Please provide an email address or mobile number so we can reach you.");
      return;
    }
    if (!entityClassification || INDIVIDUAL_ROUTED.has(entityClassification)) {
      setError("Please select how the business is taxed.");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabaseIntake.rpc("start_public_business_intake", {
        p_workspace_id: workspaceId,
        p_tax_year: taxYear,
        p_entity_classification: entityClassification,
        p_legal_business_name: legalBusinessName.trim(),
        p_contact_first_name: firstName.trim(),
        p_contact_last_name: lastName.trim(),
        p_contact_email: email.trim() || null,
        p_contact_phone: phone.trim() || null,
      });

      if (rpcError || !data) {
        if (rpcError) reportIntakeError("start_public_business_intake", rpcError);
        setError(rpcError ? publicIntakeErrorMessage(rpcError, GENERIC_START_ERROR) : GENERIC_START_ERROR);
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      const token = row?.raw_token as string | undefined;
      if (!token) {
        setError(GENERIC_START_ERROR);
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }
      router.replace(`/intake/r/${token}`);
    } catch (err) {
      reportIntakeError("start_public_business_intake", err);
      setError(GENERIC_START_ERROR);
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (!isIntakeSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-sm text-muted">This intake form isn&apos;t available right now.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 flex flex-col items-center">
          <LogoMark size={40} />
          <div className="font-slab text-2xl font-bold text-ink mt-3">Start your tax intake</div>
          <div className="text-sm text-muted mt-1">
            This takes a few minutes. You can save your progress and come back anytime using a
            secure link we&apos;ll send you.
          </div>
        </div>

        {step === "choose" && (
          <div className="bg-white border border-line rounded-sm p-6 space-y-3">
            <div className="text-sm font-semibold text-ink mb-1">What are you here to do today?</div>
            <button
              type="button"
              onClick={() => setStep("individual")}
              className="w-full text-left border border-line rounded-sm px-4 py-3 hover:border-ink transition-colors"
            >
              <div className="text-sm font-semibold text-ink">Individual Tax Preparation</div>
              <div className="text-xs text-muted mt-0.5">
                Personal tax returns, including sole proprietorships and single-member LLCs that
                haven&apos;t elected corporate taxation.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setStep("business_classify_q1")}
              className="w-full text-left border border-line rounded-sm px-4 py-3 hover:border-ink transition-colors"
            >
              <div className="text-sm font-semibold text-ink">Business/Entity Tax Preparation</div>
              <div className="text-xs text-muted mt-0.5">
                C corporations, S corporations, partnerships, and LLCs taxed as one of those.
              </div>
            </button>
          </div>
        )}

        {step === "individual" && (
          <form onSubmit={handleIndividualSubmit} className="bg-white border border-line rounded-sm p-6 space-y-4">
            <BackLink onClick={() => setStep("choose")} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">First name</label>
                <input
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Last name</label>
                <input
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Mobile phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-5555"
                className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              />
            </div>
            <p className="text-xs text-muted">
              We&apos;ll ask you to verify one of these before you can submit your intake.
            </p>

            <div>
              <label className="block text-xs font-semibold text-muted mb-1">
                Have you worked with our firm before?
              </label>
              <div className="flex gap-2">
                {(["yes", "no"] as const).map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => setIsReturning(v)}
                    className="flex-1 text-sm font-semibold py-2 rounded-sm border"
                    style={{
                      backgroundColor: isReturning === v ? "#172622" : "white",
                      color: isReturning === v ? "white" : "#172622",
                      borderColor: "#DDEAE5",
                    }}
                  >
                    {v === "yes" ? "Yes, returning client" : "No, I'm new"}
                  </button>
                ))}
              </div>
            </div>

            {error && <ErrorNote>{error}</ErrorNote>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-ink text-white text-sm font-semibold py-2.5 rounded-sm disabled:opacity-60"
            >
              {submitting ? "Starting…" : "Start my intake"}
            </button>
          </form>
        )}

        {step === "business_classify_q1" && (
          <div className="bg-white border border-line rounded-sm p-6 space-y-3">
            <BackLink onClick={() => setStep("choose")} />
            <div className="text-sm font-semibold text-ink mb-1">How many owners does the business have?</div>
            <div className="space-y-2">
              <ClassifyOption
                label="One owner"
                onClick={() => {
                  setOwnerCount("one");
                  setStep("business_classify_q2");
                }}
              />
              <ClassifyOption
                label="More than one owner"
                onClick={() => {
                  setOwnerCount("multiple");
                  setStep("business_classify_q2");
                }}
              />
              <ClassifyOption
                label="Unsure"
                onClick={() => {
                  setOwnerCount("unsure");
                  applyClassification("unsure");
                }}
              />
            </div>
            <ExpertPathLink
              onClick={() => {
                setUsedExpert(true);
                setStep("business_classify_expert");
              }}
            />
          </div>
        )}

        {step === "business_classify_q2" && (
          <div className="bg-white border border-line rounded-sm p-6 space-y-3">
            <BackLink onClick={() => setStep("business_classify_q1")} />
            <div className="text-sm font-semibold text-ink mb-1">
              Was an LLC, corporation, or partnership legally formed?
            </div>
            <div className="space-y-2">
              <ClassifyOption
                label="LLC"
                onClick={() => {
                  setEntityFormed("llc");
                  setStep("business_classify_q3");
                }}
              />
              <ClassifyOption
                label="Corporation"
                onClick={() => {
                  setEntityFormed("corporation");
                  setStep("business_classify_q3");
                }}
              />
              <ClassifyOption
                label="Partnership"
                onClick={() => {
                  setEntityFormed("partnership");
                  applyClassification("partnership");
                }}
              />
              <ClassifyOption
                label="No separate business entity was formed"
                onClick={() => {
                  setEntityFormed("none");
                  // Only defined for one owner in the derived-routing spec;
                  // multiple owners with no formal entity are still taxed
                  // as a partnership by default (Treas. Reg. 301.7701-3),
                  // so that's routed to the Business Intake rather than
                  // treated as a sole proprietorship.
                  applyClassification(ownerCount === "one" ? "sole_prop" : "partnership");
                }}
              />
              <ClassifyOption
                label="Unsure"
                onClick={() => {
                  setEntityFormed("unsure");
                  applyClassification("unsure");
                }}
              />
            </div>
            <ExpertPathLink
              onClick={() => {
                setUsedExpert(true);
                setStep("business_classify_expert");
              }}
            />
          </div>
        )}

        {step === "business_classify_q3" && (
          <div className="bg-white border border-line rounded-sm p-6 space-y-3">
            <BackLink onClick={() => setStep("business_classify_q2")} />
            <div className="text-sm font-semibold text-ink mb-1">
              {entityFormed === "corporation"
                ? "Has the corporation elected S corporation tax treatment?"
                : "Has the business elected to be taxed as an S corporation or C corporation?"}
            </div>
            <div className="space-y-2">
              {entityFormed === "corporation" ? (
                <>
                  <ClassifyOption label="Yes" onClick={() => applyClassification("s_corp")} />
                  <ClassifyOption label="No" onClick={() => applyClassification("c_corp")} />
                  <ClassifyOption label="Unsure" onClick={() => applyClassification("unsure")} />
                </>
              ) : (
                <>
                  <ClassifyOption
                    label="S corporation"
                    onClick={() => applyClassification(deriveLlcClassification(ownerCount === "multiple" ? "multiple" : "one", "s_corp"))}
                  />
                  <ClassifyOption
                    label="C corporation"
                    onClick={() => applyClassification(deriveLlcClassification(ownerCount === "multiple" ? "multiple" : "one", "c_corp"))}
                  />
                  <ClassifyOption
                    label="No corporate election"
                    onClick={() => applyClassification(deriveLlcClassification(ownerCount === "multiple" ? "multiple" : "one", "none"))}
                  />
                  <ClassifyOption label="Unsure" onClick={() => applyClassification("unsure")} />
                </>
              )}
            </div>
          </div>
        )}

        {step === "business_classify_expert" && (
          <div className="bg-white border border-line rounded-sm p-6 space-y-3">
            <BackLink onClick={() => setStep("business_classify_q1")} />
            <div className="text-sm font-semibold text-ink mb-1">
              How is the business currently taxed for federal purposes?
            </div>
            <select
              value={expertSelection}
              onChange={(e) => setExpertSelection(e.target.value as EntityClassification)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-white"
            >
              <option value="">Select…</option>
              {ENTITY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!expertSelection}
              onClick={() => expertSelection && applyClassification(expertSelection)}
              className="w-full bg-ink text-white text-sm font-semibold py-2.5 rounded-sm disabled:opacity-50"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={() => {
                setUsedExpert(false);
                setStep("business_classify_q1");
              }}
              className="w-full text-xs font-semibold text-muted underline"
            >
              Use the guided questions instead
            </button>
          </div>
        )}

        {step === "business_sole_prop_notice" && (
          <div className="bg-white border border-line rounded-sm p-6 space-y-4">
            <div className="text-sm font-semibold text-ink">
              This sounds like it belongs on your personal tax return
            </div>
            <p className="text-sm text-muted">
              A sole proprietorship — and a single-member LLC that hasn&apos;t elected corporate
              taxation — is reported on your individual tax return (Schedule C), not a separate
              business return. Let&apos;s continue in the Individual Tax Intake so you&apos;re not
              asked to re-enter anything.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setStep("individual")}
                className="w-full bg-ink text-white text-sm font-semibold py-2.5 rounded-sm"
              >
                Continue to Individual Tax Intake
              </button>
              <button
                type="button"
                onClick={() => setStep(classifyBackStep())}
                className="w-full border border-line text-ink text-sm font-semibold py-2.5 rounded-sm"
              >
                Return to entity selection
              </button>
            </div>
          </div>
        )}

        {step === "business_contact" && (
          <form onSubmit={handleBusinessSubmit} className="bg-white border border-line rounded-sm p-6 space-y-4">
            <BackLink onClick={() => setStep(classifyBackStep())} />

            {entityClassification === "unsure" && (
              <div className="text-xs text-muted bg-paperDim border border-line rounded-sm px-3 py-2">
                No problem — we&apos;ll flag this for our team to confirm the correct classification
                with you before we prepare anything.
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Legal business name</label>
              <input
                required
                value={legalBusinessName}
                onChange={(e) => setLegalBusinessName(e.target.value)}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Your first name</label>
                <input
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Your last name</label>
                <input
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Mobile phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-5555"
                className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              />
            </div>
            <p className="text-xs text-muted">
              We&apos;ll ask you to verify one of these before you can submit your intake. If this
              business already works with us, we&apos;ll match it to the existing client record.
            </p>

            {error && <ErrorNote>{error}</ErrorNote>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-ink text-white text-sm font-semibold py-2.5 rounded-sm disabled:opacity-60"
            >
              {submitting ? "Starting…" : "Start my business intake"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function ClassifyOption({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left border border-line rounded-sm px-3 py-2.5 hover:border-ink transition-colors text-sm font-semibold text-ink"
    >
      {label}
    </button>
  );
}

function ExpertPathLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-xs font-semibold text-blue underline">
      I already know the federal tax classification
    </button>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-xs font-semibold text-muted underline">
      ← Back
    </button>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">{children}</div>
  );
}
