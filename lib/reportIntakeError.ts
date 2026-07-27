"use client";

// Fire-and-forget: sends a short, truncated error label to the server so
// it lands in Vercel function logs, never in the browser UI. Deliberately
// strips everything down to {context, code, message} -- callers only ever
// pass a Postgres/Supabase error object here, never a raw token,
// verification code, or full taxpayer payload, so there is nothing more
// sensitive than an error string to truncate and forward.
export function reportIntakeError(context: string, err: unknown) {
  const e = err as { message?: string; code?: string } | null;
  const message = typeof e?.message === "string" ? e.message.slice(0, 500) : String(err).slice(0, 500);
  try {
    void fetch("/api/intake/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context, code: e?.code, message }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Best-effort only -- never let logging itself break the intake flow.
  }
}
