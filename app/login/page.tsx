"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "sign-up") {
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      setLoading(true);
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
          data: {
            first_name: firstName,
            last_name: lastName,
            company_name: companyName,
          },
        },
      });
      setLoading(false);

      if (error) {
        setError(error.message);
        return;
      }

      setCheckEmail(true);
      return;
    }

    setLoading(true);

    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_key: `login:${email.toLowerCase()}`,
      p_max_hits: 10,
      p_window_seconds: 300,
    });
    if (allowed === false) {
      setLoading(false);
      setError("Too many sign-in attempts. Please wait a few minutes and try again.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    await fetch("/api/auth/set-remember", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remember: rememberMe }),
    });

    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }

  if (checkEmail) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surfaceMuted px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-ink">Check your email</h1>
          <p className="mt-3 text-sm text-muted">
            Account created successfully. Please verify your email -- a confirmation link has
            been sent to <span className="font-medium text-slate">{email}</span>.
          </p>
          <button
            type="button"
            onClick={() => {
              setCheckEmail(false);
              setMode("sign-in");
            }}
            className="mt-6 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent/90"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surfaceMuted px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">VerexaHQ</h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "sign-in" ? "Sign in to your workspace" : "Create your account"}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "sign-up" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate" htmlFor="first_name">
                    First name
                  </label>
                  <input
                    id="first_name"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    autoComplete="given-name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate" htmlFor="last_name">
                    Last name
                  </label>
                  <input
                    id="last_name"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate" htmlFor="company_name">
                  Company / Firm name
                </label>
                <input
                  id="company_name"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Tax Advisors"
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  autoComplete="organization"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-slate" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            />
          </div>

          {mode === "sign-up" && (
            <div>
              <label className="block text-sm font-medium text-slate" htmlFor="confirm_password">
                Confirm password
              </label>
              <input
                id="confirm_password"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                autoComplete="new-password"
              />
            </div>
          )}

          {mode === "sign-in" && (
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                />
                Remember me
              </label>
              <Link href="/forgot-password" className="text-sm text-accent hover:underline">
                Forgot password?
              </Link>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
          >
            {loading ? "Please wait..." : mode === "sign-in" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setError(null);
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          }}
          className="mt-4 w-full text-center text-sm text-accent hover:underline"
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
