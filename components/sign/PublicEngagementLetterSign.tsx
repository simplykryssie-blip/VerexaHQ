"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PaginatedDocument } from "@/components/documents/PaginatedDocument";
import { SignaturePad } from "@/components/SignaturePad";
import { renderTemplate } from "@/lib/templates/render";
import { formatPhone } from "@/lib/phone";
import { validatePasswordStrength, passwordRequirementsHint } from "@/lib/passwordStrength";
import { PasswordInput } from "@/components/PasswordInput";

type TemplateData = {
  template: { id: string; name: string; body_html: string; requires_signature: boolean; banner_image_url: string | null };
  workspace_name: string;
  firm_name: string | null;
  firm_address: string | null;
  firm_phone: string | null;
  requires_portal_signup: boolean;
  password_min_length?: number;
};

// Client-side render here is a preview only -- what actually gets stored as
// the signed record is re-resolved server-side in sign_public_engagement_letter
// (same {{token}} rules, applied independently) so a tampered client payload
// can't change what was legally signed.
export function PublicEngagementLetterSign({ token, data }: { token: string; data: TemplateData }) {
  const supabase = createClient();
  const { template, workspace_name, firm_name, firm_address, firm_phone, requires_portal_signup, password_min_length } = data;
  const minPasswordLength = password_min_length ?? 8;

  const [step, setStep] = useState<"contact" | "review" | "done">("contact");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [typedName, setTypedName] = useState("");
  const [drawnDataUrl, setDrawnDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountCreated, setAccountCreated] = useState(false);

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
    if (requires_portal_signup) {
      const strengthError = validatePasswordStrength(password, minPasswordLength);
      if (strengthError) {
        setError(strengthError);
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }
    setError(null);
    setTypedName(clientName);
    setStep("review");
  }

  async function sign() {
    if (!typedName.trim() || !drawnDataUrl) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/e/${token}/signature-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl: drawnDataUrl }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSubmitting(false);
      setError(result.error ?? "Could not save your signature.");
      return;
    }
    const signatureType = "drawn" as const;
    const signatureImagePath = result.path as string;

    if (requires_portal_signup) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/portal/dashboard")}`,
          data: { first_name: firstName.trim(), last_name: lastName.trim() || null },
        },
      });
      if (signUpError || !signUpData.user) {
        setSubmitting(false);
        setError(signUpError?.message ?? "Could not create your account.");
        return;
      }

      const { data, error: rpcError } = await supabase.rpc("sign_public_engagement_letter_with_signup", {
        p_token: token,
        p_first_name: firstName.trim(),
        p_last_name: lastName.trim(),
        p_email: email.trim(),
        p_phone: phone.trim(),
        p_typed_name: typedName.trim(),
        p_auth_user_id: signUpData.user.id,
        p_signature_type: signatureType,
        p_signature_image_path: signatureImagePath,
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
        }).catch(() => {});
      }
      setAccountCreated(true);
      setStep("done");
      return;
    }

    const { data, error: rpcError } = await supabase.rpc("sign_public_engagement_letter", {
      p_token: token,
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim(),
      p_email: email.trim(),
      p_phone: phone.trim(),
      p_typed_name: typedName.trim(),
      p_signature_type: signatureType,
      p_signature_image_path: signatureImagePath,
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
        {accountCreated ? (
          <p className="mt-2 text-sm text-muted">
            {template.name} was signed and sent to {workspace_name}. Check your email at {email} to confirm your new client portal account, then
            log in to see your progress.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {template.name} was signed and sent to {workspace_name}. They&apos;ll be in touch soon.
          </p>
        )}
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
        <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
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
            {requires_portal_signup && (
              <>
                <div>
                  <label className="block text-sm font-medium text-ink">Create a password *</label>
                  <PasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    wrapperClassName="mt-1"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <p className="mt-1 text-xs text-muted">{passwordRequirementsHint(minPasswordLength)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink">Confirm password *</label>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    wrapperClassName="mt-1"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </>
            )}
          </div>
          {requires_portal_signup && (
            <p className="mt-2 text-xs text-muted">
              This letter requires a free client portal account so you can track your progress -- it&apos;s created automatically when you
              continue.
            </p>
          )}
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
        <PaginatedDocument
          html={preview}
          bannerImageUrl={template.banner_image_url}
          footer={
            <div className="mt-4 rounded-2xl border border-border bg-surface shadow-soft p-4">
              <p className="mb-3 text-xs text-muted">You&apos;ve reached the end of the letter -- sign below to confirm.</p>
              <SignaturePad
                typedName={typedName}
                onTypedNameChange={setTypedName}
                onDrawnChange={setDrawnDataUrl}
                typedLabel="Type your full name to sign this letter electronically"
              />
              {error && <p className="mt-2 text-sm text-danger">{error}</p>}
              <div className="mt-3 flex items-center gap-3">
                <button type="button" onClick={() => setStep("contact")} className="text-sm text-muted hover:text-ink">
                  Back
                </button>
                <button
                  type="button"
                  onClick={sign}
                  disabled={submitting || !typedName.trim() || !drawnDataUrl}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
                >
                  {submitting ? "Signing..." : "Confirm signature"}
                </button>
              </div>
            </div>
          }
        />
      )}
    </div>
  );
}
