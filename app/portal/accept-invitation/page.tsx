"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, AuthError, authStyles as styles } from "@/components/auth/AuthShell";
import { validatePasswordStrength, passwordRequirementsHint } from "@/lib/passwordStrength";
import { PasswordInput } from "@/components/PasswordInput";

export const dynamic = "force-dynamic";

type Preview = {
  invited_email: string;
  invited_name: string | null;
  status: string;
  token_expires_at: string;
  client_label: string;
  password_min_length: number;
};

const RAIL_FOOT = (
  <>
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 1L12 3v4c0 3.5-2.2 5.7-5 6.5C4.2 12.7 2 10.5 2 7V3l5-2Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
    <span>Encrypted &amp; audit-logged, firm-side</span>
  </>
);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AuthShell
      eyebrow="Client portal"
      railHeading="You've been invited to your portal."
      railSub="Accept below to view your documents, messages, and billing in one secure place."
      railFoot={RAIL_FOOT}
    >
      {children}
    </AuthShell>
  );
}

export default function PortalAcceptInvitationPage() {
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
      const invitedName = data[0].invited_name?.trim();
      if (invitedName) {
        const [first, ...rest] = invitedName.split(/\s+/);
        setFirstName(first ?? "");
        setLastName(rest.join(" "));
      }
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
    // A hard navigation, not router.push -- accept_portal_invitation just
    // flipped this session's portal access from nothing to active, and
    // /portal/dashboard's server-side getPortalIdentity() check needs to see
    // that fresh. A client-side push can land on a cached/stale render of
    // the destination route from before the accept; a full page load can't.
    window.location.href = "/portal/dashboard";
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
      const strengthError = validatePasswordStrength(password, preview.password_min_length);
      if (strengthError) {
        setError(strengthError);
        return;
      }
      setLoading(true);
      const { error } = await supabase.auth.signUp({
        email: preview.invited_email,
        password,
        options: {
          // Flat next path + a separate invite_token param, not a nested
          // "?token=..." inside next's value -- see app/join/page.tsx for why.
          // pending_invite_next/pending_invite_token duplicate the same info
          // into user_metadata as a fallback -- see app/join/page.tsx and
          // app/auth/confirm/route.ts for why the URL-based params alone
          // aren't reliable.
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/portal/accept-invitation&invite_token=${encodeURIComponent(token)}`,
          data: { first_name: firstName, last_name: lastName, pending_invite_next: "/portal/accept-invitation", pending_invite_token: token },
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
      <Shell>
        <h1 className={styles.cardTitle}>Invitation not found</h1>
        <p className={styles.lede}>{previewError}</p>
        <Link href="/portal/login" className={styles.link}>
          Back to sign in
        </Link>
      </Shell>
    );
  }

  if (!preview || currentUserEmail === undefined) {
    return (
      <Shell>
        <p className={styles.lede} style={{ marginBottom: 0 }}>
          Loading invitation...
        </p>
      </Shell>
    );
  }

  if (preview.status !== "invited") {
    // If they're already signed in as the exact person this invite was for
    // (the common case: they just finished the confirm-email redirect and
    // landed back here, or re-opened the same email link after it already
    // worked), send them straight into the portal instead of dead-ending on
    // a "Back to sign in" link that makes an already-successful invite look
    // broken.
    const alreadySignedInAsInvitee = Boolean(currentUserEmail) && currentUserEmail!.toLowerCase() === preview.invited_email.toLowerCase();
    return (
      <Shell>
        <h1 className={styles.cardTitle}>{preview.status === "active" ? "Already accepted" : "Invitation no longer valid"}</h1>
        <p className={styles.lede}>
          This invitation to access {preview.client_label}&apos;s portal is {preview.status === "active" ? "already active" : preview.status}.
        </p>
        {alreadySignedInAsInvitee ? (
          <Link href="/portal/dashboard" className={styles.submit} style={{ textDecoration: "none", textAlign: "center" }}>
            Go to your portal
          </Link>
        ) : (
          <Link href="/portal/login" className={styles.link}>
            Back to sign in
          </Link>
        )}
      </Shell>
    );
  }

  if (new Date(preview.token_expires_at) < new Date()) {
    return (
      <Shell>
        <h1 className={styles.cardTitle}>Invitation expired</h1>
        <p className={styles.lede} style={{ marginBottom: 0 }}>
          This invitation link has expired. Ask your firm to send a new one.
        </p>
      </Shell>
    );
  }

  if (checkEmail) {
    return (
      <Shell>
        <h1 className={styles.cardTitle}>Check your email</h1>
        <p className={styles.lede} style={{ marginBottom: 0 }}>
          Confirm your account via the link sent to <strong>{preview.invited_email}</strong> to finish setting up your portal
          access.
        </p>
      </Shell>
    );
  }

  if (currentUserEmail && currentUserEmail.toLowerCase() !== preview.invited_email.toLowerCase()) {
    return (
      <Shell>
        <h1 className={styles.cardTitle}>Wrong account</h1>
        <p className={styles.lede}>
          This invitation was sent to <strong>{preview.invited_email}</strong>, but you&apos;re signed in as{" "}
          {currentUserEmail}.
        </p>
        <form action="/api/auth/sign-out" method="post">
          <button type="submit" className={styles.link} style={{ background: "none", border: "none", cursor: "pointer", font: "inherit" }}>
            Sign out and try again
          </button>
        </form>
      </Shell>
    );
  }

  if (currentUserEmail) {
    return (
      <Shell>
        <h1 className={styles.cardTitle}>Access {preview.client_label}&apos;s portal</h1>
        <p className={styles.lede}>Accept to view your documents, messages, and billing.</p>
        {error && <AuthError>{error}</AuthError>}
        <button type="button" disabled={loading || accepted} onClick={acceptNow} className={styles.submit} style={{ marginTop: 8 }}>
          {loading && <span className={styles.spinner} />}
          {loading ? "Joining…" : "Accept invitation"}
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className={styles.cardTitle}>Access {preview.client_label}&apos;s portal</h1>
      <p className={styles.lede}>
        Create an account or sign in with <strong>{preview.invited_email}</strong> to accept.
      </p>

      <form onSubmit={handleAuthSubmit} className={styles.form}>
        {mode === "sign-up" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className={styles.field}>
              <label htmlFor="first_name">First name</label>
              <input
                id="first_name"
                required
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={styles.input}
                autoComplete="given-name"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="last_name">Last name</label>
              <input
                id="last_name"
                required
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={styles.input}
                autoComplete="family-name"
              />
            </div>
          </div>
        )}

        <div className={styles.field}>
          <label htmlFor="invited_email">Email</label>
          <input id="invited_email" type="email" value={preview.invited_email} disabled className={styles.input} style={{ opacity: 0.7 }} />
        </div>

        <div className={styles.field}>
          <label htmlFor="password">{mode === "sign-up" ? "Choose a password" : "Password"}</label>
          <PasswordInput
            id="password"
            required
            minLength={mode === "sign-up" ? preview.password_min_length : undefined}
            placeholder={mode === "sign-up" ? "Choose a password" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={styles.input}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          />
          {mode === "sign-up" && <p className={styles.hint}>{passwordRequirementsHint(preview.password_min_length)}</p>}
        </div>

        {mode === "sign-up" && (
          <div className={styles.field}>
            <label htmlFor="confirm_password">Confirm password</label>
            <PasswordInput
              id="confirm_password"
              required
              minLength={preview.password_min_length}
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={styles.input}
              autoComplete="new-password"
            />
          </div>
        )}

        {error && <AuthError>{error}</AuthError>}

        <button type="submit" disabled={loading} className={styles.submit}>
          {loading && <span className={styles.spinner} />}
          {loading ? "Please wait…" : mode === "sign-up" ? "Create account & continue" : "Sign in & continue"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setError(null);
          setMode(mode === "sign-up" ? "sign-in" : "sign-up");
        }}
        className={styles.link}
        style={{ marginTop: 16, display: "block", textAlign: "center", width: "100%", background: "none", border: "none", cursor: "pointer", font: "inherit" }}
      >
        {mode === "sign-up" ? "Already have an account? Sign in" : "Need to create an account?"}
      </button>
    </Shell>
  );
}
