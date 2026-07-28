"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabasePortal } from "@/lib/supabasePortal";
import { LogoMark } from "@/components/Logo";

import { friendlyError } from "@/lib/friendlyError";
export default function AcceptInvitationPage() {
  const { invitationId } = useParams<{ invitationId: string }>();
  const router = useRouter();

  const [mode, setMode] = useState<"checking" | "auth" | "activating" | "done" | "error">(
    "checking"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabasePortal.auth.getSession().then(({ data }) => {
      if (data.session) {
        activate();
      } else {
        setMode("auth");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function activate() {
    setMode("activating");
    setError(null);
    const { data, error } = await supabasePortal.rpc("activate_my_portal_invitation", {
      p_invitation_id: invitationId,
    });
    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      setMode("error");
      return;
    }
    setMode("done");
    setTimeout(() => router.push("/portal"), 1200);
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    if (authMode === "signup") {
      const { error, data } = await supabasePortal.auth.signUp({ email, password });
      setSubmitting(false);
      if (error) {
        setError(friendlyError(error, "Something went wrong. Please try again."));
        return;
      }
      if (!data.session) {
        setError(
          "Account created but not yet confirmed. Check your email, confirm, then reopen this invitation link."
        );
        return;
      }
      activate();
      return;
    }

    const { error } = await supabasePortal.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      return;
    }
    activate();
  }

  if (mode === "checking" || mode === "activating") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper text-sm text-muted">
        {mode === "activating" ? "Activating your portal access…" : "Loading…"}
      </div>
    );
  }

  if (mode === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper text-sm text-green">
        You&apos;re in! Redirecting to your portal…
      </div>
    );
  }

  if (mode === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-4">
        <div className="w-full max-w-sm text-center">
          <p className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3">
            {error}
          </p>
          <p className="text-xs text-muted mt-4">
            This can happen if the invitation expired, was already used, or the
            email on your account doesn&apos;t match the one it was sent to.
            Contact your accountant for a new invitation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6 flex flex-col items-center">
          <LogoMark size={40} />
          <div className="font-slab text-2xl font-bold text-ink mt-3">You&apos;re invited</div>
          <div className="text-sm text-muted mt-1">
            Sign in or create an account with the same email your invitation was
            sent to, and we&apos;ll connect it automatically.
          </div>
        </div>

        <div className="flex mb-4 border border-line rounded-sm overflow-hidden">
          <button
            onClick={() => setAuthMode("signup")}
            className="flex-1 text-sm font-semibold py-2"
            style={{
              backgroundColor: authMode === "signup" ? "#0D1B2A" : "white",
              color: authMode === "signup" ? "white" : "#0D1B2A",
            }}
          >
            Create account
          </button>
          <button
            onClick={() => setAuthMode("login")}
            className="flex-1 text-sm font-semibold py-2"
            style={{
              backgroundColor: authMode === "login" ? "#0D1B2A" : "white",
              color: authMode === "login" ? "white" : "#0D1B2A",
            }}
          >
            I already have one
          </button>
        </div>

        <form
          onSubmit={handleAuthSubmit}
          className="bg-white border border-line rounded-sm p-6 space-y-4"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />

          {error && (
            <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-ink text-white text-sm font-semibold py-2.5 rounded-sm disabled:opacity-60"
          >
            {submitting ? "Please wait…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
