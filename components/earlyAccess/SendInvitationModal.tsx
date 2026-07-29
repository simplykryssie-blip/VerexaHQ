"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Mail } from "lucide-react";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { supabase } from "@/lib/supabase";
import { sendEmail, getProviderStatus } from "@/lib/notify";
import { friendlyError } from "@/lib/friendlyError";
import { logAdminActivity } from "@/lib/earlyAccess/logActivity";
import { mergeTemplate } from "@/lib/earlyAccess/mergeTemplate";
import type { EarlyAccessMessageTemplate } from "@/lib/earlyAccess/types";

export default function SendInvitationModal({
  campaignId,
  campaignName,
  applicationId,
  defaultEmail,
  onClose,
  onCreated,
}: {
  campaignId: string;
  campaignName: string;
  applicationId?: string | null;
  defaultEmail?: string;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailSendError, setEmailSendError] = useState<string | null>(null);
  const [template, setTemplate] = useState<EarlyAccessMessageTemplate | null>(null);

  useEffect(() => {
    getProviderStatus().then((s) => setEmailConfigured(s.email));
    supabase
      .from("early_access_message_templates")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("template_key", "beta_invitation")
      .eq("channel", "email")
      .eq("status", "active")
      .maybeSingle()
      .then(({ data }) => setTemplate(data as EarlyAccessMessageTemplate | null));
  }, [campaignId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);

    const res = await authenticatedFetch("/api/early-access/invitations/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, applicationId: applicationId ?? null, email, expiresInDays }),
    });
    const result = (await res.json().catch(() => null)) as
      | { ok: true; invitation: { id: string; expires_at: string }; token: string }
      | { ok: false; error: string }
      | null;

    if (!result || !result.ok) {
      setSending(false);
      setError(friendlyError(null, result?.error ?? "Something went wrong. Please try again."));
      return;
    }

    const link = `${window.location.origin}/early-access/accept/${result.token}`;
    setInviteLink(link);
    void logAdminActivity({
      campaignId,
      action: "invitation_created",
      entityType: "early_access_invitation",
      entityId: result.invitation.id,
      details: { email },
    });

    if (emailConfigured) {
      let ownerName = "";
      if (applicationId) {
        const { data: application } = await supabase
          .from("early_access_applications")
          .select("owner_name")
          .eq("id", applicationId)
          .maybeSingle();
        ownerName = application?.owner_name ?? "";
      }
      const mergeVars = {
        owner_name: ownerName || "there",
        invitation_url: link,
        expires_at: new Date(result.invitation.expires_at).toLocaleDateString(),
      };
      const subject = template
        ? mergeTemplate(template.subject ?? `You're invited to the ${campaignName}`, mergeVars)
        : `You're invited to the ${campaignName}`;
      const body = template
        ? mergeTemplate(template.body, mergeVars).replace(/\n/g, "<br/>")
        : `<p>You've been invited to join the ${campaignName}. Click the link below to accept:</p><p><a href="${link}">${link}</a></p>`;

      const sendResult = await sendEmail(email, subject, body);
      if (sendResult.sent) {
        setEmailSent(true);
        await supabase
          .from("early_access_invitations")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", result.invitation.id);
      } else {
        setEmailSendError(sendResult.reason ?? sendResult.error ?? "Email failed to send.");
      }
    }

    setSending(false);
    onCreated?.();
  }

  async function copyLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-sm border border-line bg-white p-6">
        <h3 className="font-slab mb-4 text-lg font-bold text-ink">Send Early Access invitation</h3>

        {!inviteLink ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              required
              type="email"
              placeholder="Recipient's email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!!applicationId}
              className="w-full rounded-sm border border-line px-3 py-2 text-sm disabled:bg-paper"
            />
            <div>
              <label className="text-xs text-muted">Expires in</label>
              <select
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                className="mt-1 w-full rounded-sm border border-line px-3 py-2 text-sm"
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </div>
            <p className="text-xs text-muted">
              {emailConfigured
                ? "This creates a real invitation and emails the link automatically."
                : "This creates a real invitation. No email provider is connected yet, so you'll need to share the link yourself once it's generated."}
            </p>
            {emailConfigured && !template && (
              <p className="text-xs text-amber-700">
                No active &quot;beta_invitation&quot; email template found — a generic message will be sent instead.
                Manage templates on the Templates tab.
              </p>
            )}
            {error && (
              <div className="rounded-sm border border-brick/30 bg-brick/10 px-3 py-2 text-xs text-brick">
                {error}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-sm border border-line py-2 text-sm font-semibold text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending}
                className="flex-1 rounded-sm bg-ink py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {sending ? "Sending…" : "Create Invitation"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="rounded-sm border border-green/30 bg-green/10 px-3 py-2 text-sm text-green">
              Invitation created for {email}. Expires in {expiresInDays} days.
            </div>
            {emailConfigured ? (
              emailSent ? (
                <div className="flex items-center gap-1.5 text-sm text-green">
                  <Mail size={14} /> Email sent to {email}.
                </div>
              ) : (
                <div className="rounded-sm border border-brick/30 bg-brick/10 px-3 py-2 text-xs text-brick">
                  Invitation created, but the email didn&apos;t send
                  {emailSendError ? ` (${emailSendError})` : ""} — share the link below manually.
                </div>
              )
            ) : (
              <div className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Invitation created, but email delivery is not configured. Copy the link below and
                share it with the recipient directly.
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteLink}
                className="flex-1 rounded-sm border border-line px-3 py-2 font-mono text-xs text-ink"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 rounded-sm border border-line px-3 py-2 text-xs font-semibold text-ink"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-sm bg-ink py-2 text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
