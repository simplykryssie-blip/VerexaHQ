"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";

type CodeResult = { ok?: boolean; message?: string; reason?: string };

export default function SignupPage() {
  const [form, setForm] = useState({
    fullName: "",
    businessName: "",
    email: "",
    password: "",
    confirm: "",
    code: "",
    agreed: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  function update(key: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (form.password.length < 8)
      return setError("Use a password with at least 8 characters.");
    if (form.password !== form.confirm)
      return setError("Your passwords do not match.");
    if (!form.agreed)
      return setError("You must agree to the Terms and Privacy Policy.");
    setLoading(true);
    try {
      const { data: validation, error: validationError } = await supabase.rpc(
        "validate_beta_access_code",
        { p_code: form.code.trim() },
      );
      const result = (validation ?? {}) as CodeResult;
      if (validationError || result.ok !== true) {
        setError(
          result.message ||
            "That beta access code is invalid, expired, or has reached its limit.",
        );
        return;
      }
      const redirectTo = `${window.location.origin}/login`;
      const { error: signupError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            full_name: form.fullName.trim(),
            business_name: form.businessName.trim(),
            beta_access_code: form.code.trim(),
          },
        },
      });
      if (signupError) {
        setError(
          signupError.message.toLowerCase().includes("registered")
            ? "An account already exists for this email. Sign in instead."
            : "We could not create your account. Please try again.",
        );
        return;
      }
      setComplete(true);
    } finally {
      setLoading(false);
    }
  }

  if (complete)
    return (
      <main className="min-h-screen bg-paper px-4 grid place-items-center">
        <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-[#108A64]">
            <Check size={28} />
          </div>
          <h1 className="text-2xl font-bold text-ink">Check your email</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Confirm your email address to activate your VerexaHQ Founding Beta
            account.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex rounded-xl bg-[#108A64] px-5 py-3 font-semibold text-white"
          >
            Return to sign in
          </Link>
        </div>
      </main>
    );

  return (
    <main className="min-h-screen bg-paper px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-7 flex justify-center">
          <Logo size={25} dark />
        </div>
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="mb-6 rounded-xl bg-gradient-to-r from-cyan-50 to-emerald-50 p-4">
            <div className="flex items-center gap-2 font-bold text-ink">
              <ShieldCheck size={20} className="text-[#108A64]" />
              Founding Beta
            </div>
            <p className="mt-1 text-sm text-muted">
              Free for 30 days. No credit card required. Continue for $97/month
              only if you choose.
            </p>
          </div>
          <h1 className="text-2xl font-bold text-ink">
            Create your firm account
          </h1>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <input
                required
                autoComplete="name"
                value={form.fullName}
                onChange={(e) => update("fullName", e.target.value)}
              />
            </Field>
            <Field label="Business name">
              <input
                required
                autoComplete="organization"
                value={form.businessName}
                onChange={(e) => update("businessName", e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Email">
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Password">
              <input
                required
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
              />
            </Field>
            <Field label="Confirm password">
              <input
                required
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={(e) => update("confirm", e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Beta access code">
                <input
                  required
                  value={form.code}
                  onChange={(e) => update("code", e.target.value)}
                />
              </Field>
            </div>
          </div>
          <label className="mt-5 flex items-start gap-3 text-sm text-muted">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[#108A64]"
              checked={form.agreed}
              onChange={(e) => update("agreed", e.target.checked)}
            />
            <span>I agree to the Terms of Service and Privacy Policy.</span>
          </label>
          {error && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              {error}
            </div>
          )}
          <button
            disabled={loading}
            className="brand-gradient mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold text-white disabled:opacity-60"
          >
            {loading && <Loader2 size={18} className="animate-spin" />}
            {loading ? "Creating account…" : "Start my 30-day beta"}
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      {
        <span className="mt-1.5 block [&>input]:w-full [&>input]:rounded-xl [&>input]:border [&>input]:border-line [&>input]:px-3.5 [&>input]:py-3 [&>input]:font-normal [&>input]:outline-none [&>input:focus]:border-teal">
          {children}
        </span>
      }
    </label>
  );
}
