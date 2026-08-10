"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ChangePasswordForm() {
  const supabase = createClient();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setSuccess(true);
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className="block text-sm font-semibold text-ink" htmlFor="new_password">
          New password
        </label>
        <input
          id="new_password"
          type="password"
          required
          minLength={6}
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            setSuccess(false);
          }}
          placeholder="Create a password"
          autoComplete="new-password"
          className="mt-1.5 w-full rounded-lg border border-border px-3 py-2.5 text-sm transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-ink" htmlFor="confirm_new_password">
          Confirm new password
        </label>
        <input
          id="confirm_new_password"
          type="password"
          required
          minLength={6}
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setSuccess(false);
          }}
          placeholder="Confirm your password"
          autoComplete="new-password"
          className="mt-1.5 w-full rounded-lg border border-border px-3 py-2.5 text-sm transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
        />
      </div>

      {error && (
        <div className="col-span-full flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger" role="alert">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="mt-0.5 shrink-0">
            <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M7.5 4.5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx="7.5" cy="10.6" r="0.9" fill="currentColor" />
          </svg>
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="col-span-full flex items-center gap-2 rounded-lg border border-green-700/25 bg-green-700/5 px-3 py-2.5 text-sm text-green-700">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="shrink-0">
            <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M4.8 7.7l1.8 1.8 3.6-4.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Password updated.</span>
        </div>
      )}

      <div className="col-span-full">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-60"
        >
          {loading && (
            <span
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40"
              style={{ borderTopColor: "#fff" }}
            />
          )}
          {loading ? "Saving..." : "Change password"}
        </button>
      </div>
    </form>
  );
}
