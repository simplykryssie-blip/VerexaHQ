"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { validatePasswordStrength, passwordRequirementsHint } from "@/lib/passwordStrength";
import { PasswordInput } from "@/components/PasswordInput";

export const dynamic = "force-dynamic";

type PlanRow = {
  slug: string;
  name: string;
  base_price_cents: number;
  included_seats: number;
};

const DEFAULT_PLAN = "solo";

function money(cents: number) {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toLocaleString()}` : `$${dollars.toFixed(2)}`;
}

export default function TrialSignupPage() {
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [firmName, setFirmName] = useState("");
  const [planSlug, setPlanSlug] = useState(() => searchParams.get("plan") ?? DEFAULT_PLAN);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  // undefined = still checking; null = signed out; object = signed in
  const [session, setSession] = useState<
    "checking" | "signed-out" | { alreadyHasWorkspace: boolean; pendingFirmName: string | null; pendingPlanSlug: string | null }
  >("checking");
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("get_public_platform_plans").then(({ data }) => setPlans((data as PlanRow[] | null) ?? []));
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setSession("signed-out");
        return;
      }
      const { data: membership } = await supabase.from("workspace_users").select("id").eq("user_id", user.id).limit(1).maybeSingle();
      setSession({
        alreadyHasWorkspace: Boolean(membership),
        pendingFirmName: (user.user_metadata?.pending_trial_firm_name as string | undefined) ?? null,
        pendingPlanSlug: (user.user_metadata?.pending_trial_plan_slug as string | undefined) ?? null,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Returned here from the confirmation email with a real session -- finish
  // the job by actually creating the trial workspace, then land in it.
  useEffect(() => {
    if (session === "checking" || session === "signed-out") return;
    if (session.alreadyHasWorkspace || !session.pendingFirmName) return;

    setProvisioning(true);
    supabase
      .rpc("start_trial_workspace", { p_name: session.pendingFirmName, p_plan_slug: session.pendingPlanSlug ?? DEFAULT_PLAN })
      .then(({ error }) => {
        if (error) {
          setProvisioning(false);
          setProvisionError(error.message);
          return;
        }
        // Hard navigation -- the dashboard's server-side workspace lookup
        // needs to see the brand-new membership fresh, not a stale
        // client-side router cache from before it existed.
        window.location.href = "/dashboard";
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firmName.trim()) {
      setError("Tell us your firm's name.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    const strengthError = validatePasswordStrength(password, 8);
    if (strengthError) {
      setError(strengthError);
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/trial-signup`,
        data: {
          first_name: firstName,
          last_name: lastName,
          pending_trial_firm_name: firmName.trim(),
          pending_trial_plan_slug: planSlug,
        },
      },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    // Supabase signals "this email already has an account" via an empty
    // identities array instead of an error -- no confirmation email goes
    // out in that case, which otherwise looks exactly like broken delivery.
    if (data.user && data.user.identities?.length === 0) {
      setError("An account with this email already exists. Sign in instead.");
      return;
    }
    setCheckEmail(true);
  }

  if (session === "checking" || plans === null) {
    return (
      <Centered center>
        <p className="text-sm text-muted">Loading...</p>
      </Centered>
    );
  }

  if (typeof session === "object") {
    if (session.alreadyHasWorkspace) {
      return (
        <Centered center>
          <h1 className="text-xl font-semibold text-ink">You&apos;re all set</h1>
          <p className="mt-3 text-sm text-muted">You already have a Verexa workspace.</p>
          <Link href="/dashboard" className="mt-6 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90">
            Go to your workspace
          </Link>
        </Centered>
      );
    }
    if (session.pendingFirmName) {
      return (
        <Centered center>
          <h1 className="text-xl font-semibold text-ink">Setting up your workspace...</h1>
          <p className="mt-3 text-sm text-muted">This only takes a second.</p>
          {provisionError && (
            <>
              <p className="mt-4 text-sm text-danger">{provisionError}</p>
              <button
                type="button"
                onClick={() => {
                  setProvisionError(null);
                  setProvisioning(false);
                  setSession({ ...session });
                }}
                disabled={provisioning}
                className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-surfaceMuted"
              >
                Try again
              </button>
            </>
          )}
        </Centered>
      );
    }
    // Signed in, but nothing pending -- landed here directly, not via the
    // trial flow. Nothing to provision; don't guess at creating a workspace.
    return (
      <Centered center>
        <h1 className="text-xl font-semibold text-ink">You&apos;re signed in</h1>
        <p className="mt-3 text-sm text-muted">Head to your dashboard, or sign out to start a new trial with a different email.</p>
        <Link href="/dashboard" className="mt-6 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90">
          Go to dashboard
        </Link>
      </Centered>
    );
  }

  if (checkEmail) {
    return (
      <Centered center>
        <h1 className="text-xl font-semibold text-ink">Check your email</h1>
        <p className="mt-3 text-sm text-muted">
          Confirm your account via the link sent to <span className="font-medium text-slate">{email}</span> to finish setting up your
          14-day trial.
        </p>
      </Centered>
    );
  }

  return (
    <Centered>
      <span className="text-xs font-semibold uppercase tracking-wide text-accent">Free 14-Day Trial</span>
      <h1 className="mt-1 text-xl font-semibold text-ink">Start your Verexa trial</h1>
      <p className="mt-1 text-sm text-muted">No credit card required. Full platform access for 14 days.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <input
            required
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <input
            required
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <input
          required
          placeholder="Firm name"
          value={firmName}
          onChange={(e) => setFirmName(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />

        <input
          required
          type="email"
          placeholder="Work email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />

        {plans.length > 0 && (
          <div>
            <span className="mb-1.5 block text-xs font-medium text-slate">Plan</span>
            <div className="grid grid-cols-3 gap-2">
              {plans.map((p) => (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => setPlanSlug(p.slug)}
                  className={`rounded-lg border px-2 py-2 text-left text-xs transition ${
                    planSlug === p.slug ? "border-accent bg-accentSoft" : "border-border hover:border-accent/50"
                  }`}
                >
                  <span className="block font-semibold text-ink">{p.name}</span>
                  <span className="block text-muted">{money(p.base_price_cents)}/mo</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <PasswordInput
          required
          minLength={8}
          placeholder="Choose a password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <p className="text-xs text-muted">{passwordRequirementsHint(8)}</p>

        <PasswordInput
          required
          minLength={8}
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
        >
          {loading ? "Please wait..." : "Start my free trial"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </Centered>
  );
}

function Centered({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surfaceMuted px-4">
      <div className={`w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-sm ${center ? "text-center" : ""}`}>
        {children}
      </div>
    </div>
  );
}
