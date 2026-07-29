"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Check, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Logo } from "@/components/Logo";

type Preview = { email: string; planName: string | null; monthlyPrice: number | null };

export default function EarlyAccessInvitePage() {
  const { token } = useParams<{ token: string }>();
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const [form, setForm] = useState({
    fullName: "",
    businessName: "",
    businessEmail: "",
    businessPhone: "",
    password: "",
    confirm: "",
    agreeToEarlyAccessAgreement: false,
    agreeToTerms: false,
    agreeToBilling: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/early-access/invitations/preview?token=${encodeURIComponent(token)}`);
      const result = (await res.json().catch(() => null)) as (Preview & { ok: boolean; error?: string }) | null;
      if (!result?.ok) {
        setPreviewError(result?.error ?? "This invitation link is invalid.");
        setLoadingPreview(false);
        return;
      }
      setPreview(result);
      setLoadingPreview(false);
    })();
  }, [token]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const trialEndDisplay = trialEnd.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const priceDisplay = preview?.monthlyPrice != null ? `$${Number(preview.monthlyPrice).toFixed(2)}/month` : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password.length < 8) return setError("Use a password with at least 8 characters.");
    if (form.password !== form.confirm) return setError("Your passwords do not match.");
    if (!form.fullName.trim() || !form.businessName.trim()) return setError("Full name and business name are required.");
    if (!form.agreeToEarlyAccessAgreement || !form.agreeToTerms || !form.agreeToBilling) {
      return setError("You must accept the Early Access agreement, Terms of Service, and billing authorization to continue.");
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/early-access/invitations/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email: preview?.email,
          password: form.password,
          fullName: form.fullName.trim(),
          businessName: form.businessName.trim(),
          businessEmail: form.businessEmail.trim() || undefined,
          businessPhone: form.businessPhone.trim() || undefined,
          agreeToEarlyAccessAgreement: form.agreeToEarlyAccessAgreement,
          agreeToTerms: form.agreeToTerms,
          agreeToBilling: form.agreeToBilling,
        }),
      });
      const result = (await res.json().catch(() => null)) as { ok: boolean; checkoutUrl?: string; error?: string } | null;
      if (!result?.ok || !result.checkoutUrl) {
        setSubmitting(false);
        setError(result?.error ?? "We could not create your account. Please try again.");
        return;
      }
      window.location.href = result.checkoutUrl;
    } catch {
      setSubmitting(false);
      setError("We could not create your account. Please try again.");
    }
  }

  if (loadingPreview) {
    return (
      <main className="min-h-screen bg-paper px-4 py-16 text-center">
        <p className="text-muted">Loading your invitation…</p>
      </main>
    );
  }

  if (previewError || !preview) {
    return (
      <main className="min-h-screen bg-paper px-4 py-16">
        <div className="mx-auto max-w-md rounded-2xl border border-line bg-white p-8 text-center shadow-sm">
          <XCircle size={40} className="mx-auto text-brick" />
          <p className="mt-4 text-sm text-brick">{previewError}</p>
          <Link href="/login" className="mt-6 inline-flex rounded-xl bg-ink px-5 py-3 font-semibold text-white">
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-7 flex justify-center">
          <Logo size={25} dark />
        </div>
        <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 rounded-xl bg-gradient-to-r from-cyan-50 to-emerald-50 p-4">
            <div className="flex items-center gap-2 font-bold text-ink">
              <ShieldCheck size={20} className="text-[#108A64]" />
              You&apos;re invited to VerexaHQ Early Access
            </div>
            <p className="mt-1 text-sm text-muted">
              {preview.planName ? `${preview.planName} plan. ` : ""}
              Free for 30 days, then {priceDisplay ?? "the plan price"} unless you cancel first.
            </p>
          </div>

          <h1 className="text-2xl font-bold text-ink">Create your firm account</h1>
          <p className="mt-1 text-sm text-muted">Invitation sent to {preview.email}</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <input required autoComplete="name" value={form.fullName} onChange={(e) => update("fullName", e.target.value)} />
            </Field>
            <Field label="Business name">
              <input required autoComplete="organization" value={form.businessName} onChange={(e) => update("businessName", e.target.value)} />
            </Field>
            <Field label="Business email (optional)">
              <input type="email" value={form.businessEmail} onChange={(e) => update("businessEmail", e.target.value)} />
            </Field>
            <Field label="Business phone (optional)">
              <input value={form.businessPhone} onChange={(e) => update("businessPhone", e.target.value)} />
            </Field>
            <Field label="Password">
              <input required type="password" autoComplete="new-password" value={form.password} onChange={(e) => update("password", e.target.value)} />
            </Field>
            <Field label="Confirm password">
              <input required type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => update("confirm", e.target.value)} />
            </Field>
          </div>

          <div className="mt-6 space-y-3 rounded-xl border border-line p-4">
            <label className="flex items-start gap-3 text-sm text-muted">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[#108A64]" checked={form.agreeToEarlyAccessAgreement} onChange={(e) => update("agreeToEarlyAccessAgreement", e.target.checked)} />
              <span>I have read and accept the VerexaHQ Early Access agreement.</span>
            </label>
            <label className="flex items-start gap-3 text-sm text-muted">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[#108A64]" checked={form.agreeToTerms} onChange={(e) => update("agreeToTerms", e.target.checked)} />
              <span>
                I agree to the{" "}
                <Link href="/help" className="font-semibold text-[#108A64] underline">
                  Terms of Service
                </Link>{" "}
                and acknowledge the Privacy Policy.
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm text-muted">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[#108A64]" checked={form.agreeToBilling} onChange={(e) => update("agreeToBilling", e.target.checked)} />
              <span>
                I authorize VerexaHQ to securely save my payment method and automatically charge {priceDisplay ?? "the applicable subscription price"} when my
                30-day trial ends on <strong>{trialEndDisplay}</strong>, unless I cancel before the trial expiration date. I can cancel any time before then
                from Settings.
              </span>
            </label>
          </div>

          <p className="mt-4 text-xs text-muted">
            On the next step, you&apos;ll securely enter your card details on Stripe&apos;s own payment page. VerexaHQ never sees or stores your full card
            number.
          </p>

          {error && (
            <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            disabled={submitting}
            className="brand-gradient mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold text-white disabled:opacity-60"
          >
            {submitting && <Loader2 size={18} className="animate-spin" />}
            {submitting ? "Setting up your account…" : "Continue to secure payment setup"}
          </button>
          <p className="mt-5 text-center text-sm text-muted">
            Already have an account?{" "}
            <Link className="font-semibold text-[#108A64]" href="/login">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      <span className="mt-1.5 block [&>input]:w-full [&>input]:rounded-xl [&>input]:border [&>input]:border-line [&>input]:px-3.5 [&>input]:py-3 [&>input]:font-normal [&>input]:outline-none [&>input:focus]:border-teal">
        {children}
      </span>
    </label>
  );
}
