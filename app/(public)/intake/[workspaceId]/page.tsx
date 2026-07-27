"use client";

import { useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import { supabaseIntake, isIntakeSupabaseConfigured } from "@/lib/supabaseIntake";
import { publicIntakeErrorMessage } from "@/lib/publicIntakeError";
import { reportIntakeError } from "@/lib/reportIntakeError";

const CURRENT_TAX_YEAR = new Date().getFullYear() - 1;
const GENERIC_START_ERROR = "We couldn't start your intake right now. Please try again.";

export default function IntakeStartPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();

  const [taxYear] = useState(CURRENT_TAX_YEAR);
  const [isReturning, setIsReturning] = useState<"yes" | "no" | "">("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Belt-and-suspenders against a double click racing ahead of the
  // `disabled={submitting}` re-render: this ref is checked synchronously,
  // before React has necessarily committed the state update.
  const submittingRef = useRef(false);

  async function handleSubmit(e: React.FormEvent) {
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
            This takes about 10 minutes. You can save your progress and come back anytime using a
            secure link we&apos;ll send you.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-line rounded-sm p-6 space-y-4">
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

          {error && (
            <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-ink text-white text-sm font-semibold py-2.5 rounded-sm disabled:opacity-60"
          >
            {submitting ? "Starting…" : "Start my intake"}
          </button>
        </form>
      </div>
    </div>
  );
}
