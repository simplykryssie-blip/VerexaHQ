"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError)
      setError("The reset link may have expired. Request a new one.");
    else router.replace("/dashboard");
  }
  return (
    <main className="min-h-screen bg-paper px-4 grid place-items-center">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-sm"
      >
        <h1 className="text-2xl font-bold text-ink">Choose a new password</h1>
        <input
          className="mt-5 w-full rounded-xl border border-line px-3.5 py-3"
          type="password"
          required
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          className="mt-3 w-full rounded-xl border border-line px-3.5 py-3"
          type="password"
          required
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <button
          disabled={busy}
          className="brand-gradient mt-4 w-full rounded-xl py-3 font-semibold text-white"
        >
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </main>
  );
}
