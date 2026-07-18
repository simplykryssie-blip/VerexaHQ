"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabasePortal } from "@/lib/supabasePortal";
import { LogoMark } from "@/components/Logo";

export default function PortalLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    if (mode === "login") {
      const { error } = await supabasePortal.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/portal");
      return;
    }

    const { error, data } = await supabasePortal.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (!data.session) {
      setNotice(
        "Account created. If email confirmation is required, check your inbox, then come back and sign in."
      );
      setMode("login");
      return;
    }
    router.push("/portal");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8 flex flex-col items-center">
          <LogoMark size={44} />
          <div className="font-slab text-2xl font-bold text-ink mt-3">Client Portal</div>
          <div className="text-[11px] uppercase tracking-widest text-muted mt-1">
            Powered by VerexaHQ
          </div>
        </div>

        <div className="flex mb-4 border border-line rounded-sm overflow-hidden">
          <button
            onClick={() => setMode("login")}
            className="flex-1 text-sm font-semibold py-2"
            style={{
              backgroundColor: mode === "login" ? "#0D1B2A" : "white",
              color: mode === "login" ? "white" : "#0D1B2A",
            }}
          >
            Sign in
          </button>
          <button
            onClick={() => setMode("signup")}
            className="flex-1 text-sm font-semibold py-2"
            style={{
              backgroundColor: mode === "signup" ? "#0D1B2A" : "white",
              color: mode === "signup" ? "white" : "#0D1B2A",
            }}
          >
            Create account
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-line rounded-sm p-6 space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ink"
              placeholder="you@email.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ink"
              placeholder="••••••••"
            />
          </div>

          {notice && (
            <div className="text-xs text-green bg-green/10 border border-green/30 rounded-sm px-3 py-2">
              {notice}
            </div>
          )}
          {error && (
            <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ink text-white text-sm font-semibold py-2.5 rounded-sm hover:bg-[#14273A] transition-colors disabled:opacity-60"
          >
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="text-center text-xs text-muted mt-4">
          If your accountant sent you a portal invitation link, use that link
          directly — it will connect your new account to your records automatically.
        </p>
      </div>
    </div>
  );
}
