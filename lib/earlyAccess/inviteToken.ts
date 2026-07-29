import { randomBytes, createHash } from "crypto";

// Server-only. Never import from a "use client" component — the whole point
// is that the raw token exists only transiently in a server response and is
// never persisted; only its hash goes in early_access_invitations.token_hash.

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
