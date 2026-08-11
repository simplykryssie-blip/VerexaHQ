"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { validatePasswordStrength, PASSWORD_REQUIREMENTS_HINT } from "@/lib/passwordStrength";

export const dynamic = "force-dynamic";

type Preview = { email: string; status: string; expires_at: string; workspace_name: string; role_name: string };

export default function AcceptInvitationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const supabase = createClient();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) {
      setPreviewError("This invitation link is missing its token.");
      return;
    }
    supabase.rpc("get_invitation_preview", { p_token: token }).then(({ data, error }) => {
      if (error || !data || data.length === 0) {
        setPreviewError("This invitation link is invalid.");
        return;
      }
      setPreview(data[0]);
    });
    supabase.auth.getUser().then(({ data }) => setCurrentUserEmail(data.user?.email ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function acceptNow() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.rpc("accept_workspace_invitation_by_token", { p_token: token });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setAccepted(true);
    router.push("/dashboard");
    router.refresh();
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!preview) return;

    if (mode === "sign-up") {
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
      const strengthError = validatePasswordStrength(password);
      if (strengthError) {
        setError(strengthError);
        return;
      }
      setLoading(true);
      const { error } = await supabase.auth.signUp({
        email: preview.email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(
            `/accept-invitation?token=${token}`
          )}`,
          data: { first_name: firstName, last_name: lastName },
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
    const { error } = await supabase.auth.signInWithPassword({ email: preview.email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    await acceptNow();
  }

  if (previewError) {
    return (
      <Centered center>
        <h1 className="text-xl font-semibold text-ink">Invitation not found</h1>
        <p className="mt-3 text-sm text-muted">{previewError}</p>
        <Link href="/login" className="mt-6 inline-block text-sm text-accent hover:underline">
          Back to sign in
        </Link>
      </Centered>
    );
  }

  if (!preview || currentUserEmail === undefined) {
    return (
      <Centered center>
        <p className="text-sm text-muted">Loading invitation...</p>
      </Centered>
    );
  }

  if (preview.status !== "pending") {
    return (
      <Centered center>
        <h1 className="text-xl font-semibold text-ink">
          {preview.status === "accepted" ? "Already accepted" : "Invitation no longer valid"}
        </h1>
        <p className="mt-3 text-sm text-muted">
          This invitation to join {preview.workspace_name} is {preview.status}.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm text-accent hover:underline">
          Back to sign in
        </Link>
      </Centered>
    );
  }

  if (new Date(preview.expires_at) < new Date()) {
    return (
      <Centered center>
        <h1 className="text-xl font-semibold text-ink">Invitation expired</h1>
        <p className="mt-3 text-sm text-muted">
          This invitation to join {preview.workspace_name} has expired. Ask an admin to send a new one.
        </p>
      </Centered>
    );
  }

  if (checkEmail) {
    return (
      <Centered center>
        <h1 className="text-xl font-semibold text-ink">Check your email</h1>
        <p className="mt-3 text-sm text-muted">
          Confirm your account via the link sent to <span className="font-medium text-slate">{preview.email}</span> to
          finish joining {preview.workspace_name}.
        </p>
      </Centered>
    );
  }

  if (currentUserEmail && currentUserEmail.toLowerCase() !== preview.email.toLowerCase()) {
    return (
      <Centered center>
        <h1 className="text-xl font-semibold text-ink">Wrong account</h1>
        <p className="mt-3 text-sm text-muted">
          This invitation was sent to <span className="font-medium text-slate">{preview.email}</span>, but you&apos;re
          signed in as {currentUserEmail}.
        </p>
        <form action="/api/auth/sign-out" method="post" className="mt-6">
          <button type="submit" className="text-sm text-accent hover:underline">
            Sign out and try again
          </button>
        </form>
      </Centered>
    );
  }

  if (currentUserEmail) {
    return (
      <Centered center>
        <h1 className="text-xl font-semibold text-ink">Join {preview.workspace_name}</h1>
        <p className="mt-3 text-sm text-muted">
          You&apos;ve been invited as {preview.role_name}. Accept to join this workspace.
        </p>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <button
          type="button"
          disabled={loading || accepted}
          onClick={acceptNow}
          className="mt-6 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
        >
          {loading ? "Joining..." : "Accept invitation"}
        </button>
      </Centered>
    );
  }

  return (
    <Centered>
      <h1 className="text-xl font-semibold text-ink">Join {preview.workspace_name}</h1>
      <p className="mt-1 text-sm text-muted">
        You&apos;ve been invited as {preview.role_name}. Create an account or sign in with{" "}
        <span className="font-medium text-slate">{preview.email}</span> to accept.
      </p>

      <form onSubmit={handleAuthSubmit} className="mt-6 space-y-4">
        {mode === "sign-up" && (
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
        )}

        <input
          type="email"
          value={preview.email}
          disabled
          className="w-full rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm text-muted"
        />

        <input
          type="password"
          required
          minLength={mode === "sign-up" ? 8 : undefined}
          placeholder={mode === "sign-up" ? "Choose a password" : "Password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {mode === "sign-up" && <p className="text-xs text-muted">{PASSWORD_REQUIREMENTS_HINT}</p>}

        {mode === "sign-up" && (
          <input
            type="password"
            required
            minLength={8}
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
        >
          {loading ? "Please wait..." : mode === "sign-up" ? "Create account & join" : "Sign in & join"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setError(null);
          setMode(mode === "sign-up" ? "sign-in" : "sign-up");
        }}
        className="mt-4 w-full text-center text-sm text-accent hover:underline"
      >
        {mode === "sign-up" ? "Already have an account? Sign in" : "Need to create an account?"}
      </button>
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
