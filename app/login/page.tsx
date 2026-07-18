"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) router.replace("/setup");
  }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(
        "We could not sign you in. Check your email and password and try again.",
      );
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-10 grid place-items-center">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size={25} dark showTagline />
        </div>
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-ink">Welcome back</h1>
            <p className="mt-1 text-sm text-muted">
              Sign in to your firm command center.
            </p>
          </div>
          <div className="space-y-4">
            <label className="block text-sm font-semibold text-ink">
              Email
              <input
                className="mt-1.5 w-full rounded-xl border border-line px-3.5 py-3 font-normal focus:border-teal focus:outline-none"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Password
              <input
                className="mt-1.5 w-full rounded-xl border border-line px-3.5 py-3 font-normal focus:border-teal focus:outline-none"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </div>
          {error && (
            <div
              role="alert"
              className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <div className="mt-3 text-right">
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-[#108A64] hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <button
            disabled={loading}
            className="brand-gradient mt-5 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                Sign in
                <ArrowRight size={18} />
              </>
            )}
          </button>
          <p className="mt-6 text-center text-sm text-muted">
            Founding Beta member?{" "}
            <Link
              href="/signup"
              className="font-semibold text-[#108A64] hover:underline"
            >
              Create your account
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
