"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/Logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/update-password` },
    );
    setBusy(false);
    if (resetError)
      setError("We could not send the reset email. Please try again.");
    else setSent(true);
  }
  return (
    <main className="min-h-screen bg-paper px-4 grid place-items-center">
      <div className="w-full max-w-md">
        <div className="mb-7 flex justify-center">
          <Logo size={24} dark />
        </div>
        <form
          onSubmit={submit}
          className="rounded-2xl border border-line bg-white p-8 shadow-sm"
        >
          <h1 className="text-2xl font-bold text-ink">Reset your password</h1>
          <p className="mt-2 text-sm text-muted">
            Enter your email and we’ll send a secure reset link.
          </p>
          {sent ? (
            <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
              If that address has an account, a reset email is on its way.
            </div>
          ) : (
            <>
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-5 w-full rounded-xl border border-line px-3.5 py-3 outline-none focus:border-teal"
                placeholder="you@yourfirm.com"
              />
              {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
              <button
                disabled={busy}
                className="brand-gradient mt-4 w-full rounded-xl py-3 font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </>
          )}
          <Link
            href="/login"
            className="mt-5 block text-center text-sm font-semibold text-[#108A64]"
          >
            Back to sign in
          </Link>
        </form>
      </div>
    </main>
  );
}
