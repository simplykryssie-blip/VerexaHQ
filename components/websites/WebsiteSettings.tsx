"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, ImagePlus, X, Globe, CheckCircle2, Copy, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";
const textareaClass =
  "mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

type Website = {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  favicon_url: string | null;
  head_tracking_code: string | null;
  body_tracking_code: string | null;
  custom_domain: string | null;
  domain_verified: boolean;
  domain_verified_at: string | null;
};

// Strips a pasted protocol/path/trailing slash down to a bare hostname, so
// "https://www.example.com/" and "www.example.com" both save the same way.
function normalizeDomain(raw: string): string {
  let value = raw.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.split("/")[0];
  return value;
}

type VerifyResult = {
  verified: boolean;
  isApex: boolean;
  recordType: "A" | "CNAME";
  expected: string;
  found: string[];
};

export function WebsiteSettings({ website, canManage }: { website: Website; canManage: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [name, setName] = useState(website.name);
  const [slug, setSlug] = useState(website.slug);
  const [faviconUrl, setFaviconUrl] = useState(website.favicon_url ?? "");
  const [headCode, setHeadCode] = useState(website.head_tracking_code ?? "");
  const [bodyCode, setBodyCode] = useState(website.body_tracking_code ?? "");
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [domainInput, setDomainInput] = useState(website.custom_domain ?? "");
  const [savedDomain, setSavedDomain] = useState(website.custom_domain);
  const [domainVerified, setDomainVerified] = useState(website.domain_verified);
  const [domainVerifiedAt, setDomainVerifiedAt] = useState(website.domain_verified_at);
  const [savingDomain, setSavingDomain] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  async function saveDomain() {
    const next = normalizeDomain(domainInput);
    if (!next) return;
    setSavingDomain(true);
    const { error } = await supabase
      .from("site_websites")
      .update({ custom_domain: next, domain_verified: false, domain_verified_at: null })
      .eq("id", website.id);
    setSavingDomain(false);
    if (error) {
      toast.show(error.message.includes("duplicate") ? "That domain is already connected to another website." : error.message, "error");
      return;
    }
    setSavedDomain(next);
    setDomainInput(next);
    setDomainVerified(false);
    setDomainVerifiedAt(null);
    setVerifyResult(null);
    toast.show("Domain saved -- add the DNS record below, then verify.", "success");
  }

  async function removeDomain() {
    if (!confirm(`Disconnect ${savedDomain}? Visitors on that domain will stop reaching this website.`)) return;
    const { error } = await supabase
      .from("site_websites")
      .update({ custom_domain: null, domain_verified: false, domain_verified_at: null })
      .eq("id", website.id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setSavedDomain(null);
    setDomainInput("");
    setDomainVerified(false);
    setDomainVerifiedAt(null);
    setVerifyResult(null);
    toast.show("Domain disconnected", "success");
  }

  async function verifyDomain() {
    setVerifying(true);
    const res = await fetch(`/api/websites/${website.id}/verify-domain`, { method: "POST" });
    const result = await res.json().catch(() => null);
    setVerifying(false);
    if (!res.ok || !result) {
      toast.show(result?.error ?? "Couldn't check DNS right now.", "error");
      return;
    }
    setVerifyResult(result as VerifyResult);
    setDomainVerified(result.verified);
    setDomainVerifiedAt(result.verified ? new Date().toISOString() : null);
    toast.show(result.verified ? "DNS is pointing correctly" : "DNS record not detected yet", result.verified ? "success" : "error");
  }

  function copyToClipboard(value: string) {
    navigator.clipboard.writeText(value);
    toast.show("Copied", "success");
  }

  async function uploadFavicon(file: File) {
    setUploadingFavicon(true);
    const path = `${website.workspace_id}/favicon-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
    setUploadingFavicon(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    const { data } = supabase.storage.from("branding").getPublicUrl(path);
    setFaviconUrl(data.publicUrl);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("site_websites")
      .update({
        name: name.trim() || website.name,
        slug: slug.trim() || website.slug,
        favicon_url: faviconUrl || null,
        head_tracking_code: headCode || null,
        body_tracking_code: bodyCode || null,
      })
      .eq("id", website.id);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setDirty(false);
    toast.show("Saved", "success");
    router.refresh();
  }

  async function deleteWebsite() {
    if (!confirm("Delete this website? All its pages and funnels will be deleted too. This can't be undone.")) return;
    const { error } = await supabase.from("site_websites").delete().eq("id", website.id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.push("/websites");
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <label className={labelClass}>
          Name
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            disabled={!canManage}
            className={inputClass}
          />
        </label>
        <label className={`${labelClass} mt-3`}>
          URL slug
          <input
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setDirty(true);
            }}
            disabled={!canManage}
            className={inputClass}
          />
        </label>

        <div className="mt-3">
          <p className={labelClass}>Favicon</p>
          {faviconUrl ? (
            <div className="mt-1.5 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={faviconUrl} alt="" className="h-6 w-6 rounded border border-border object-contain" />
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setFaviconUrl("");
                    setDirty(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-muted hover:border-danger hover:text-danger"
                >
                  <X size={12} /> Remove
                </button>
              )}
            </div>
          ) : (
            canManage && (
              <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-slate hover:border-accent hover:text-accent">
                <ImagePlus size={14} />
                {uploadingFavicon ? "Uploading..." : "Upload a favicon"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingFavicon}
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadFavicon(e.target.files[0])}
                />
              </label>
            )
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <div className="flex items-center gap-2">
          <Globe size={15} className="text-muted" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Custom domain</p>
        </div>
        <p className="mt-1 text-[11px] text-muted">Point your own domain (e.g. yourfirm.com) at this website instead of using the default address.</p>

        {!savedDomain ? (
          canManage && (
            <div className="mt-3 flex gap-2">
              <input
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="yourfirm.com"
                className={`${inputClass} mt-0`}
              />
              <button
                type="button"
                onClick={saveDomain}
                disabled={savingDomain || !domainInput.trim()}
                className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
              >
                {savingDomain ? "Connecting..." : "Connect domain"}
              </button>
            </div>
          )
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">{savedDomain}</span>
                {domainVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                    <CheckCircle2 size={11} /> DNS verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                    Not connected yet
                  </span>
                )}
              </div>
              {canManage && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={verifyDomain}
                    disabled={verifying}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-slate hover:border-accent hover:text-accent disabled:opacity-60"
                  >
                    <RefreshCw size={12} className={verifying ? "animate-spin" : ""} />
                    {verifying ? "Checking..." : "Verify DNS"}
                  </button>
                  <button
                    type="button"
                    onClick={removeDomain}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-muted hover:border-danger hover:text-danger"
                  >
                    <X size={12} /> Disconnect
                  </button>
                </div>
              )}
            </div>

            {domainVerified && domainVerifiedAt && (
              <p className="text-[11px] text-muted">Verified {new Date(domainVerifiedAt).toLocaleString()}.</p>
            )}

            {verifyResult && (
              <div className="rounded-lg border border-border bg-canvas p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  Add this DNS record at your domain registrar
                </p>
                <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 font-mono text-xs">
                  <span className="text-muted">Type</span>
                  <span className="text-ink">{verifyResult.recordType}</span>
                  <span />
                  <span className="text-muted">Host</span>
                  <span className="text-ink">{verifyResult.isApex ? "@ (root)" : savedDomain}</span>
                  <span />
                  <span className="text-muted">Value</span>
                  <span className="truncate text-ink">{verifyResult.expected}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(verifyResult.expected)}
                    className="justify-self-end text-muted hover:text-accent"
                    aria-label="Copy value"
                  >
                    <Copy size={12} />
                  </button>
                </div>
                {!verifyResult.verified && (
                  <p className="mt-2 text-[11px] text-muted">
                    {verifyResult.found.length > 0
                      ? `Currently pointing to ${verifyResult.found.join(", ")}. DNS changes can take up to 48 hours to propagate, though it's often much faster -- check back and verify again.`
                      : "No record found yet. Add it at your registrar, then verify again once DNS has had a few minutes to propagate."}
                  </p>
                )}
                {verifyResult.verified && (
                  <p className="mt-2 text-[11px] text-muted">
                    DNS is pointing correctly. One last step: this domain still needs to be added in the hosting
                    project (Vercel &rarr; Project Settings &rarr; Domains &rarr; Add &rarr; <span className="font-mono">{savedDomain}</span>)
                    so SSL can be issued -- ask whoever manages hosting to add it if you don&apos;t have access.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Tracking & scripts</p>
        <p className="mt-1 text-[11px] text-muted">Add third-party tracking/analytics code (Google Analytics, GTM, Facebook Pixel, custom scripts).</p>
        <label className={`${labelClass} mt-3`}>
          Head tracking code
          <textarea
            value={headCode}
            onChange={(e) => {
              setHeadCode(e.target.value);
              setDirty(true);
            }}
            disabled={!canManage}
            rows={4}
            spellCheck={false}
            className={textareaClass}
          />
        </label>
        <label className={`${labelClass} mt-3`}>
          Body tracking code
          <textarea
            value={bodyCode}
            onChange={(e) => {
              setBodyCode(e.target.value);
              setDirty(true);
            }}
            disabled={!canManage}
            rows={4}
            spellCheck={false}
            className={textareaClass}
          />
        </label>
      </div>

      {canManage && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={deleteWebsite}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-danger hover:border-danger"
          >
            <Trash2 size={13} /> Delete website
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
