"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RichTextEditor } from "@/components/settings/RichTextEditor";
import { renderTemplate } from "@/lib/templates/render";
import { formatPhone } from "@/lib/phone";

type TemplateData = {
  template: { id: string; name: string; body_html: string; requires_signature: boolean };
  workspace_name: string;
  firm_name: string | null;
  firm_address: string | null;
  firm_phone: string | null;
};

// Client-side render here is a preview only -- what actually gets stored as
// the signed record is re-resolved server-side in sign_public_engagement_letter
// (same {{token}} rules, applied independently) so a tampered client payload
// can't change what was legally signed.
export function PublicEngagementLetterSign({ token, data }: { token: string; data: TemplateData }) {
  const supabase = createClient();
  const { template, workspace_name, firm_name, firm_address, firm_phone } = data;

  const [step, setStep] = useState<"contact" | "review" | "done">("contact");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [typedName, setTypedName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = `${firstName} ${lastName}`.trim();
  const preview = renderTemplate(template.body_html, {
    client_name: clientName,
    firm_name,
    firm_address,
    firm_phone,
  });

  function continueToReview() {
    if (!firstName.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setError(null);
    setTypedName(clientName);
    setStep("review");
  }

  async function sign() {
    if (!typedName.trim()) return;
    setSubmitting(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("sign_public_engagement_letter", {
      p_token: token,
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim() || null,
      p_email: email.trim(),
      p_phone: phone.trim() || null,
      p_typed_name: typedName.trim(),
    });
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const signatureId = (data as { signature_id?: string } | null)?.signature_id;
    if (signatureId) {
      fetch("/api/documents/file-signed-engagement-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureId }),
      }).catch(() => {
        // Best-effort -- the signature itself is already recorded and safe;
        // filing it into Documents can be retried later if this fails.
      });
    }
    setStep("done");
  }

  if (step === "done") {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">Signed -- thank you</h1>
        <p className="mt-2 text-sm text-muted">
          {template.name} was signed and sent to {workspace_name}. They&apos;ll be in touch soon.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{workspace_name}</p>
        <h1 className="text-lg font-semibold text-ink">{template.name}</h1>
      </div>

      {step === "contact" && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-ink">First name *</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Last name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => setEmail(e.target.value.trim().toLowerCase())}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <button
            type="button"
            onClick={continueToReview}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            Continue to letter
          </button>
        </div>
      )}

      {step === "review" && (
        <>
          <div className="min-h-[40vh] rounded-xl border border-border bg-surfaceMuted p-3">
            <RichTextEditor content={preview} editable={false} documentStyle />
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <label htmlFor="typed-name" className="block text-sm font-medium text-ink">
              Type your full name to sign this letter electronically
            </label>
            <input
              id="typed-name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Full name"
              className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            <div className="mt-3 flex items-center gap-3">
              <button type="button" onClick={() => setStep("contact")} className="text-sm text-muted hover:text-ink">
                Back
              </button>
              <button
                type="button"
                onClick={sign}
                disabled={submitting || !typedName.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {submitting ? "Signing..." : "Confirm signature"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
