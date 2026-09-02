"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type Factor = { id: string; friendly_name: string | null; factor_type: string; status: string };

export function MfaSetup() {
  const supabase = createClient();
  const toast = useToast();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadFactors() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
    setLoading(false);
  }

  useEffect(() => {
    loadFactors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startEnroll() {
    setError(null);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error || !data) {
      setError(error?.message ?? "Could not start enrollment.");
      return;
    }
    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setEnrolling(true);
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError || !challenge) {
      setError(challengeError?.message ?? "Could not create challenge.");
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    toast.show("Authenticator app connected", "success");
    setEnrolling(false);
    setQrCode(null);
    setSecret(null);
    setFactorId(null);
    setCode("");
    loadFactors();
  }

  async function removeFactor(id: string) {
    if (!confirm("Remove this authenticator? You'll need to set up MFA again to re-enable it.")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Authenticator removed", "success");
    loadFactors();
  }

  if (loading) return <p className="text-sm text-muted">Loading...</p>;

  const verifiedFactor = factors.find((f) => f.status === "verified");

  return (
    <div>
      {verifiedFactor ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-surfaceMuted px-3 py-2">
          <div>
            <p className="text-sm font-medium text-ink">Authenticator app connected</p>
            <p className="text-xs text-muted">{verifiedFactor.friendly_name ?? "TOTP"}</p>
          </div>
          <button
            type="button"
            onClick={() => removeFactor(verifiedFactor.id)}
            className="text-sm text-danger hover:underline"
          >
            Remove
          </button>
        </div>
      ) : enrolling ? (
        <form onSubmit={confirmEnroll} className="space-y-3">
          <p className="text-sm text-slate">
            Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password).
          </p>
          {qrCode && (
            // eslint-disable-next-line @next/next/no-img-element -- data: SVG URI from Supabase's MFA enroll response, not an optimizable remote asset
            <img
              src={qrCode}
              alt="Scan with your authenticator app"
              className="h-40 w-40 rounded-lg border border-border"
            />
          )}
          {secret && (
            <p className="text-xs text-muted">
              Can&apos;t scan? Enter this key manually: <span className="font-mono">{secret}</span>
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-slate">6-digit code</label>
            <p className="text-xs text-muted">
              After scanning, your authenticator app will display a new 6-digit code every 30 seconds. Enter the
              current code from the app here -- it&apos;s not something you make up yourself.
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              required
              className="mt-1 w-full max-w-[10rem] rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEnrolling(false);
                setQrCode(null);
                setSecret(null);
                setFactorId(null);
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate hover:bg-surfaceMuted"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              Verify and enable
            </button>
          </div>
        </form>
      ) : (
        <div>
          <p className="text-sm text-muted">
            Add an authenticator app (Google Authenticator, Authy, 1Password) for a second sign-in step.
          </p>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <button
            type="button"
            onClick={startEnroll}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            Set up authenticator app
          </button>
        </div>
      )}
    </div>
  );
}
