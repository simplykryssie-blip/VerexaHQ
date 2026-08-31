"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/authErrors";
import { AuthShell, AuthError, authStyles as styles } from "@/components/auth/AuthShell";
import { validatePasswordStrength, PASSWORD_REQUIREMENTS_HINT } from "@/lib/passwordStrength";
import { PasswordInput } from "@/components/PasswordInput";

export const dynamic = "force-dynamic";

type Preview = { ero_name: string; status: string; expires_at: string | null; relationship_type: string };

const RAIL_FOOT = (
  <>
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 4v3.2l2 1.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
    <span>One invite, one workspace, no extra setup.</span>
  </>
);

// A single flow for accepting an ERO/Service Bureau's connection invite --
// whether the recipient already has a Verexa account or has never signed up
// at all. Deliberately skips the generic /onboarding "how do you operate?"
// picker: accepting an ero_ptin/service_bureau_ptin invite already implies
// the answer (an independent PTIN connecting to that firm), so a brand new
// signer just needs their firm name, not a menu of workspace types.
export default function JoinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const supabase = createClient();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [authState, setAuthState] = useState<"loading" | "signed-out" | "needs-workspace" | "has-workspace">("loading");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      setPreviewError("This invite link is missing its token.");
      return;
    }
    supabase.rpc("get_firm_connection_invite_preview", { p_token: token }).then(({ data, error: rpcError }) => {
      if (rpcError || !data || data.length === 0) {
        setPreviewError("This invite link is invalid.");
        return;
      }
      setPreview(data[0]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAuthState("signed-out");
        return;
      }
      const { data: membership } = await supabase
        .from("workspace_users")
        .select("workspace_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (membership) {
        setWorkspaceId(membership.workspace_id);
        setAuthState("has-workspace");
        return;
      }
      // Brand new user, just confirmed their email -- auto-create their
      // workspace from the name they gave at signup, no separate step.
      const meta = user.user_metadata as { first_name?: string; last_name?: string; company_name?: string } | undefined;
      if (meta?.company_name) {
        await autoCreateAndConnect(meta.company_name);
      } else {
        setAuthState("needs-workspace");
      }
    }
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function autoCreateAndConnect(name: string) {
    setConnecting(true);
    setError(null);
    // Creates the workspace and redeems this invite atomically, server-side
    // -- accept_firm_connection_invite validates the token is still a real,
    // pending, unexpired invite before creating anything, so this can't be
    // used to spin up an unconnected workspace the way calling
    // create_workspace directly could. The new workspace's type must match
    // the tier the invite is actually for -- a service_bureau_ero invite is
    // onboarding a brand-new ERO office, not a PTIN, even though the RPC's
    // own default (independent_ptin) covers the far more common ero_ptin/
    // service_bureau_ptin cases correctly on its own.
    const { data: newWorkspaceId, error: acceptError } = await supabase.rpc("accept_firm_connection_invite", {
      p_token: token,
      p_name: name,
      p_workspace_type: preview?.relationship_type === "service_bureau_ero" ? "ero_office" : "independent_ptin",
    });
    if (acceptError || !newWorkspaceId) {
      setConnecting(false);
      setError(acceptError?.message ?? "Could not create your workspace.");
      setAuthState("needs-workspace");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const meta = user?.user_metadata as { first_name?: string; last_name?: string } | undefined;
    if (user && (meta?.first_name || meta?.last_name)) {
      const displayName = [meta?.first_name, meta?.last_name].filter(Boolean).join(" ");
      await supabase
        .from("user_profiles")
        .update({ first_name: meta?.first_name ?? null, last_name: meta?.last_name ?? null, display_name: displayName || null })
        .eq("id", user.id);
    }
    setConnecting(false);
    setConnected(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1200);
  }

  async function redeem(targetWorkspaceId: string) {
    setConnecting(true);
    setError(null);
    const { error: redeemError } = await supabase.rpc("redeem_firm_connection_invite", {
      p_token: token,
      p_workspace_id: targetWorkspaceId,
    });
    setConnecting(false);
    if (redeemError) {
      setError(redeemError.message);
      return;
    }
    setConnected(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1200);
  }

  const [manualFirmName, setManualFirmName] = useState("");
  async function submitManualFirmName(e: React.FormEvent) {
    e.preventDefault();
    if (!manualFirmName.trim()) return;
    await autoCreateAndConnect(manualFirmName.trim());
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
      // next stays a bare path (no embedded "?token=...") -- invite_token
      // rides as its own flat query param instead, since a query string
      // nested inside another query string's value is exactly the shape
      // that got mangled somewhere between Supabase's confirmation email
      // and app/auth/confirm/route.ts, silently dropping the whole thing
      // and landing the user on the generic dashboard instead of back here.
      // pending_invite_next/pending_invite_token are a second, independent
      // copy of the same info written straight into user_metadata rather
      // than the redirect URL -- confirmed live that Supabase's own
      // /auth/v1/verify redirect can still drop the URL-based params even
      // when they're sent correctly, so app/auth/confirm/route.ts falls
      // back to these when that happens.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/join&invite_token=${encodeURIComponent(token)}`,
          data: {
            first_name: firstName,
            last_name: lastName,
            company_name: companyName,
            pending_invite_next: "/join",
            pending_invite_token: token,
          },
        },
      });
      setLoading(false);

      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (data.user && data.user.identities?.length === 0) {
        setError('An account with this email already exists. Try signing in, or use "Forgot password?" if you need to reset it.');
        return;
      }
      setCheckEmail(true);
      return;
    }

    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(friendlyAuthError(signInError.message));
      return;
    }
    router.refresh();
    window.location.reload();
  }

  const eroName = preview?.ero_name ?? "your ERO";

  if (previewError) {
    return (
      <AuthShell eyebrow="Firm workspace" railHeading="Run your practice, not paperwork." railSub="One invite, one workspace." railFoot={RAIL_FOOT}>
        <h1 className={styles.cardTitle}>Invite not found</h1>
        <p className={styles.lede}>{previewError}</p>
      </AuthShell>
    );
  }

  if (!preview || authState === "loading") {
    return (
      <AuthShell eyebrow="Firm workspace" railHeading="Run your practice, not paperwork." railSub="One invite, one workspace." railFoot={RAIL_FOOT}>
        <p className={styles.lede}>Loading your invite...</p>
      </AuthShell>
    );
  }

  if (preview.status !== "pending") {
    return (
      <AuthShell eyebrow="Firm workspace" railHeading="Run your practice, not paperwork." railSub="One invite, one workspace." railFoot={RAIL_FOOT}>
        <h1 className={styles.cardTitle}>Invite already used</h1>
        <p className={styles.lede}>This invite has already been accepted or was revoked. Ask {eroName} to send you a new one.</p>
      </AuthShell>
    );
  }
  if (preview.expires_at && new Date(preview.expires_at) < new Date()) {
    return (
      <AuthShell eyebrow="Firm workspace" railHeading="Run your practice, not paperwork." railSub="One invite, one workspace." railFoot={RAIL_FOOT}>
        <h1 className={styles.cardTitle}>Invite expired</h1>
        <p className={styles.lede}>This invite link has expired. Ask {eroName} to send you a new one.</p>
      </AuthShell>
    );
  }

  if (connected) {
    return (
      <AuthShell eyebrow="Firm workspace" railHeading="Run your practice, not paperwork." railSub="One invite, one workspace." railFoot={RAIL_FOOT}>
        <h1 className={styles.cardTitle}>Connected</h1>
        <p className={styles.lede}>You&apos;re connected to {eroName}. Taking you to your dashboard...</p>
      </AuthShell>
    );
  }

  if (checkEmail) {
    return (
      <AuthShell eyebrow="Firm workspace" railHeading="Run your practice, not paperwork." railSub="One invite, one workspace." railFoot={RAIL_FOOT}>
        <h1 className={styles.cardTitle}>Check your email</h1>
        <p className={styles.lede}>
          Account created. Confirm your email -- a link has been sent to <strong>{email}</strong> -- and you&apos;ll land right back here,
          already connected to {eroName}.
        </p>
      </AuthShell>
    );
  }

  if (authState === "has-workspace" && workspaceId) {
    return (
      <AuthShell eyebrow="Firm workspace" railHeading="Run your practice, not paperwork." railSub="One invite, one workspace." railFoot={RAIL_FOOT}>
        <h1 className={styles.cardTitle}>Connect to {eroName}?</h1>
        <p className={styles.lede}>
          You&apos;ll keep your own workspace and login. You can share client files with them once ready for filing, and only they can
          disconnect you.
        </p>
        {error && <AuthError>{error}</AuthError>}
        <button type="button" onClick={() => redeem(workspaceId)} disabled={connecting} className={styles.submit}>
          {connecting ? "Connecting..." : `Connect to ${eroName}`}
        </button>
      </AuthShell>
    );
  }

  if (authState === "needs-workspace") {
    return (
      <AuthShell eyebrow="Firm workspace" railHeading="Run your practice, not paperwork." railSub="One invite, one workspace." railFoot={RAIL_FOOT}>
        <h1 className={styles.cardTitle}>You&apos;re invited to connect with {eroName}</h1>
        <p className={styles.lede}>Just your firm name to finish setting up your workspace and connect.</p>
        <form onSubmit={submitManualFirmName} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="manual_firm_name">Firm name</label>
            <input
              id="manual_firm_name"
              required
              value={manualFirmName}
              onChange={(e) => setManualFirmName(e.target.value)}
              placeholder="Acme Tax Advisors"
              className={styles.input}
            />
          </div>
          {error && <AuthError>{error}</AuthError>}
          <button type="submit" disabled={connecting} className={styles.submit}>
            {connecting ? "Setting up..." : "Create workspace & connect"}
          </button>
        </form>
      </AuthShell>
    );
  }

  // signed-out: combined sign-up/sign-in, invite-aware.
  return (
    <AuthShell eyebrow="Firm workspace" railHeading="Run your practice, not paperwork." railSub="One invite, one workspace." railFoot={RAIL_FOOT}>
      <h1 className={styles.cardTitle}>You&apos;re invited to connect with {eroName}</h1>
      <p className={styles.lede}>
        {mode === "sign-up" ? "Create your Verexa account to accept." : "Sign in to your existing account to accept."}
      </p>

      <form onSubmit={handleAuthSubmit} className={styles.form}>
        {mode === "sign-up" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className={styles.field}>
                <label htmlFor="first_name">First name</label>
                <input id="first_name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={styles.input} autoComplete="given-name" />
              </div>
              <div className={styles.field}>
                <label htmlFor="last_name">Last name</label>
                <input id="last_name" required value={lastName} onChange={(e) => setLastName(e.target.value)} className={styles.input} autoComplete="family-name" />
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="company_name">Firm name</label>
              <input
                id="company_name"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Tax Advisors"
                className={styles.input}
                autoComplete="organization"
              />
            </div>
          </>
        )}

        <div className={styles.field}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={styles.input} autoComplete="email" />
        </div>
        <div className={styles.field}>
          <label htmlFor="password">Password</label>
          <PasswordInput
            id="password"
            required
            minLength={mode === "sign-up" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={styles.input}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          />
          {mode === "sign-up" && <p className={styles.hint}>{PASSWORD_REQUIREMENTS_HINT}</p>}
        </div>
        {mode === "sign-up" && (
          <div className={styles.field}>
            <label htmlFor="confirm_password">Confirm password</label>
            <PasswordInput
              id="confirm_password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={styles.input}
              autoComplete="new-password"
            />
          </div>
        )}

        {error && <AuthError>{error}</AuthError>}

        <button type="submit" disabled={loading} className={styles.submit}>
          {loading ? (mode === "sign-in" ? "Signing in..." : "Creating account...") : mode === "sign-in" ? "Sign in & connect" : "Create account & connect"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setError(null);
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
        }}
        className={styles.link}
        style={{ marginTop: 16, display: "block", textAlign: "center", width: "100%", background: "none", border: "none", cursor: "pointer", font: "inherit" }}
      >
        {mode === "sign-in" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </AuthShell>
  );
}
