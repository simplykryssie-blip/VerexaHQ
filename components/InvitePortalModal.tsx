"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { sendEmail, getProviderStatus } from "@/lib/notify";

import { friendlyError } from "@/lib/friendlyError";
export default function InvitePortalModal({
  workspaceId,
  clientId,
  defaultEmail,
  onClose,
}: {
  workspaceId: string;
  clientId: string;
  defaultEmail?: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailSendError, setEmailSendError] = useState<string | null>(null);

  useEffect(() => {
    getProviderStatus().then((s) => setEmailConfigured(s.email));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);

    const { data, error } = await supabase.rpc("prepare_client_portal_invitation", {
      p_workspace_id: workspaceId,
      p_client_id: clientId,
      p_invite_email: email,
    });

    if (error) {
      setSending(false);
      setError(friendlyError(error, "Something went wrong. Please try again."));
      return;
    }

    const invitationId = (data as { portal_invitation_id: string }).portal_invitation_id;
    const link = `${window.location.origin}/portal/accept/${invitationId}`;
    setInviteLink(link);

    if (emailConfigured) {
      const result = await sendEmail(
        email,
        "You're invited to your client portal",
        `<p>Hi,</p>
         <p>You've been invited to access your secure client portal. Click the link below to get started:</p>
         <p><a href="${link}">${link}</a></p>
         <p>If you weren't expecting this, you can ignore this email.</p>`
      );
      if (result.sent) setEmailSent(true);
      else setEmailSendError(result.reason ?? result.error ?? "Email failed to send.");
    }

    setSending(false);
  }

  async function copyLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-md p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">Invite to Client Portal</h3>

        {!inviteLink ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              required
              type="email"
              placeholder="Client's email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted">
              {emailConfigured ? (
                <>
                  This creates a real invitation and emails the link to your
                  client automatically.
                </>
              ) : (
                <>
                  This creates a real invitation. No email provider is
                  connected yet, so you&apos;ll need to share the link
                  yourself once it&apos;s generated — add{" "}
                  <code>RESEND_API_KEY</code> to enable automatic sending.
                </>
              )}
            </p>

            {error && (
              <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 text-sm font-semibold py-2 rounded-sm border border-line text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending}
                className="flex-1 text-sm font-semibold py-2 rounded-sm bg-ink text-white disabled:opacity-60"
              >
                {sending ? "Sending…" : "Create Invitation"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-green bg-green/10 border border-green/30 rounded-sm px-3 py-2">
              Invitation created for {email}. Expires in 7 days.
            </div>
            {emailSent && (
              <div className="flex items-center gap-1.5 text-sm text-green">
                <Mail size={14} /> Email sent to {email}.
              </div>
            )}
            {emailSendError && (
              <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">
                Email didn&apos;t send ({emailSendError}) — share the link
                below manually instead.
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteLink}
                className="flex-1 border border-line rounded-sm px-3 py-2 text-xs font-mono text-ink"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={copyLink}
                className="text-xs font-semibold px-3 py-2 rounded-sm border border-line text-ink flex items-center gap-1.5"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-full text-sm font-semibold py-2 rounded-sm bg-ink text-white"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
