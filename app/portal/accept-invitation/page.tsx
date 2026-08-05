"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

type Preview = { invited_email: string; invited_name: string | null; status: string; token_expires_at: string; client_label: string };

export default function PortalAcceptInvitationPage() {
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
    supabase.rpc("get_portal_invitation_preview", { p_token: token }).then(({ data, error }) => {
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
    const { error } = await supabase.rpc("accept_portal_invitation", { p_token: token });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setAccepted(true);
    router.push("/portal/dashboard");
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
      setLoading(true);
      const { error } = await supabase.auth.signUp({
        email: preview.invited_email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(
            `/portal/accept-invitation?token=${token}`
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
    const { error } = await supabase.auth.signInWithPassword({ email: preview.invited_email, password });
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
        <Link href="/portal/login" className="mt-6 inline-block text-sm text-accent hover:underline">
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

  if (preview.status !== "invited") {
    return (
      <Centered center>
        <h1 className="text-xl font-semibold text-ink">
          {preview.status === "active" ? "Already accepted" : "Invitation no longer valid"}
        </h1>
        <p className="mt-3 text-sm text-muted">
          This invitation to access {preview.client_label}&apos;s portal is {preview.status === "active" ? "already active" : preview.status}.
        </p>
        <Link href="/portal/login" className="mt-6 inline-block text-sm text-accent hover:underline">
          Back to sign in
        </Link>
      </Centered>
    );
  }

  if (new Date(preview.token_expires_at) < new Date()) {
    return (
      <Centered center>
        <h1 className="text-xl font-semibold text-ink">Invitation expired</h1>
        <p className="mt-3 text-sm text-muted">
          This invitation link has expired. Ask your firm to send a new one.
        </p>
      </Centered>
    );
  }

  if (checkEmail) {
    return (
      <Centered center>
        <h1 className="text-xl font-semibold text-ink">Check your email</h1>
        <p className="mt-3 text-sm text-muted">
          Confirm your account via the link sent to <span className="font-medium text-slate">{preview.invited_email}</span> to
          finish setting up your portal access.
        </p>
      </Centered>
    );
  }

  if (currentUserEmail && currentUserEmail.toLowerCase() !== preview.invited_email.toLowerCase()) {
    return (
      <Centered center>
        <h1 className="text-xl font-semibold text-ink">Wrong account</h1>
        <p className="mt-3 text-sm text-muted">
          This invitation was sent to <span className="font-medium text-slate">{preview.invited_email}</span>, but
          you&apos;re signed in as {currentUserEmail}.
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
        <h1 className="text-xl font-semibold text-ink">Access {preview.client_label}&apos;s portal</h1>
        <p className="mt-3 text-sm text-muted">Accept to view your documents, messages, and billing.</p>
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
      <h1 className="text-xl font-semibold text-ink">Access {preview.client_label}&apos;s portal</h1>
      <p className="mt-1 text-sm text-muted">
        Create an account or sign in with <span className="font-medium text-slate">{preview.invited_email}</span> to accept.
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
          value={preview.invited_email}
          disabled
          className="w-full rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm text-muted"
        />

        <input
          type="password"
          required
          minLength={6}
          placeholder={mode === "sign-up" ? "Choose a password" : "Password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />

        {mode === "sign-up" && (
          <input
            type="password"
            required
            minLength={6}
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
          {loading ? "Please wait..." : mode === "sign-up" ? "Create account & continue" : "Sign in & continue"}
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
