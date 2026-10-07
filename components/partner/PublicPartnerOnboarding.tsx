"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PaginatedDocument } from "@/components/documents/PaginatedDocument";
import { SignaturePad } from "@/components/SignaturePad";
import { formatPhone } from "@/lib/phone";
import { ONBOARDING_STATUS_LABEL } from "@/lib/partnerOnboarding";

type AgreementTemplate = { name: string; body_html: string; banner_image_url: string | null; custom_css: string | null };

export type PublicPartnerOnboardingData = {
  id: string;
  status: string;
  connection_name: string | null;
  workspace_name: string | null;
  branding: { logo_url: string | null; primary_color: string | null; secondary_color: string | null };
  agreement_required: boolean;
  agreement_signed: boolean;
  agreement_template: AgreementTemplate | null;
  documents_required: boolean;
  application_submitted_at: string | null;
  application_data: Record<string, string | null> | null;
  rejected_reason: string | null;
  review_note: string | null;
};

// The connection-scoped counterpart to the authenticated partner-dashboard
// onboarding page (app/(app)/partner-dashboard/onboarding) -- for a Firm
// Connection with no child workspace yet (the normal case for a direct
// Stripe/payment-link purchase), there is no login to gate that page
// behind, so this is reached by token instead. Submitting here updates the
// same partner_onboardings row the authenticated page reads, never a
// client or lead record.
export function PublicPartnerOnboarding({ token, data }: { token: string; data: PublicPartnerOnboardingData }) {
  const supabase = createClient();
  const [onboarding, setOnboarding] = useState(data);

  const [businessName, setBusinessName] = useState(onboarding.application_data?.business_name ?? "");
  const [contactName, setContactName] = useState(onboarding.application_data?.contact_name ?? onboarding.connection_name ?? "");
  const [contactEmail, setContactEmail] = useState(onboarding.application_data?.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(onboarding.application_data?.contact_phone ?? "");
  const [notes, setNotes] = useState(onboarding.application_data?.notes ?? "");
  const [submittingApplication, setSubmittingApplication] = useState(false);
  const [applicationError, setApplicationError] = useState<string | null>(null);

  const [typedName, setTypedName] = useState("");
  const [drawnDataUrl, setDrawnDataUrl] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  const applicationSubmitted = Boolean(onboarding.application_submitted_at);
  const needsAgreement = onboarding.agreement_required && !onboarding.agreement_signed;
  const accentColor = onboarding.branding.primary_color || onboarding.branding.secondary_color || undefined;

  async function submitApplication() {
    if (!contactEmail.trim()) {
      setApplicationError("Contact email is required.");
      return;
    }
    setSubmittingApplication(true);
    setApplicationError(null);
    const { error } = await supabase.rpc("submit_public_partner_onboarding_application", {
      p_token: token,
      p_business_name: businessName.trim() || null,
      p_contact_name: contactName.trim() || null,
      p_contact_email: contactEmail.trim(),
      p_contact_phone: contactPhone.trim() || null,
      p_notes: notes.trim() || null,
    });
    setSubmittingApplication(false);
    if (error) {
      setApplicationError(error.message);
      return;
    }
    setOnboarding((prev) => ({
      ...prev,
      application_submitted_at: prev.application_submitted_at ?? new Date().toISOString(),
      status: prev.status === "pending" ? "in_progress" : prev.status,
      application_data: { business_name: businessName, contact_name: contactName, contact_email: contactEmail, contact_phone: contactPhone, notes },
    }));
  }

  async function signAgreement() {
    if (!typedName.trim() || !drawnDataUrl) return;
    setSigning(true);
    setSignError(null);

    const res = await fetch(`/api/partner-apply/${token}/signature-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl: drawnDataUrl }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSigning(false);
      setSignError(result.error ?? "Could not save your signature.");
      return;
    }

    const { error } = await supabase.rpc("sign_public_partner_onboarding_agreement", {
      p_token: token,
      p_typed_name: typedName.trim(),
      p_signature_image_path: result.path as string,
    });
    setSigning(false);
    if (error) {
      setSignError(error.message);
      return;
    }
    setOnboarding((prev) => ({ ...prev, agreement_signed: true }));
  }

  if (onboarding.status === "rejected" || onboarding.status === "withdrawn") {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">This onboarding is closed</h1>
        <p className="mt-2 text-sm text-muted">
          {onboarding.rejected_reason || "Please contact " + (onboarding.workspace_name ?? "the firm") + " for more information."}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center justify-between">
        <div>
          {onboarding.branding.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={onboarding.branding.logo_url} alt={onboarding.workspace_name ?? ""} className="mb-2 h-8 w-auto" />
          )}
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{onboarding.workspace_name}</p>
          <h1 className="text-lg font-semibold text-ink">Partner onboarding{onboarding.connection_name ? ` -- ${onboarding.connection_name}` : ""}</h1>
        </div>
        <span className="shrink-0 rounded-full bg-surfaceMuted px-3 py-1 text-xs font-medium text-ink">
          {ONBOARDING_STATUS_LABEL[onboarding.status] ?? onboarding.status}
        </span>
      </div>

      {!applicationSubmitted ? (
        <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
          <h2 className="text-sm font-semibold text-ink">Partner application</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-ink">Business name</label>
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Contact name</label>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Contact email *</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                onBlur={(e) => setContactEmail(e.target.value.trim().toLowerCase())}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Contact phone</label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(formatPhone(e.target.value))}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-ink">Anything else we should know?</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>
          {applicationError && <p className="mt-2 text-sm text-danger">{applicationError}</p>}
          <button
            type="button"
            onClick={submitApplication}
            disabled={submittingApplication}
            style={accentColor ? { background: accentColor } : undefined}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {submittingApplication ? "Submitting..." : "Submit application"}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-success/30 bg-success/5 p-4">
          <p className="text-sm font-medium text-ink">Application received -- thank you.</p>
        </div>
      )}

      {applicationSubmitted && needsAgreement && onboarding.agreement_template && (
        <div id="agreement">
          <h2 className="mb-2 text-sm font-semibold text-ink">{onboarding.agreement_template.name}</h2>
          <PaginatedDocument
            html={onboarding.agreement_template.body_html}
            bannerImageUrl={onboarding.agreement_template.banner_image_url}
            customCss={onboarding.agreement_template.custom_css}
            footer={
              <div className="mt-4 rounded-2xl border border-border bg-surface shadow-soft p-4">
                <p className="mb-3 text-xs text-muted">You&apos;ve reached the end of the agreement -- sign below to confirm.</p>
                <SignaturePad typedName={typedName} onTypedNameChange={setTypedName} onDrawnChange={setDrawnDataUrl} />
                {signError && <p className="mt-2 text-sm text-danger">{signError}</p>}
                <button
                  type="button"
                  onClick={signAgreement}
                  disabled={signing || !typedName.trim() || !drawnDataUrl}
                  className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
                >
                  {signing ? "Signing..." : "Confirm signature"}
                </button>
              </div>
            }
          />
        </div>
      )}

      {applicationSubmitted && onboarding.agreement_required && onboarding.agreement_signed && (
        <div className="rounded-2xl border border-success/30 bg-success/5 p-4">
          <p className="text-sm font-medium text-ink">Agreement signed -- thank you.</p>
        </div>
      )}

      {applicationSubmitted && (!onboarding.agreement_required || onboarding.agreement_signed) && (
        <p className="text-sm text-muted">
          {onboarding.workspace_name ?? "Your firm"} will review your submission and follow up with next steps.
        </p>
      )}

      {onboarding.review_note && (
        <div className="rounded-2xl border border-border bg-surfaceMuted p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Note from {onboarding.workspace_name}</p>
          <p className="mt-1 text-sm text-ink">{onboarding.review_note}</p>
        </div>
      )}
    </div>
  );
}
