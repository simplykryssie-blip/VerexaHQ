"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SiteFunnel } from "../types";

type LeadFormConfig = {
  heading?: string;
  subheading?: string;
  fields?: { first_name?: boolean; last_name?: boolean; phone?: boolean };
  services?: { id: string; name: string }[];
  button_label?: string;
  on_submit?: {
    action?: "next_page" | "custom_url" | "inline_thank_you";
    custom_url?: string;
    thank_you_heading?: string;
    thank_you_body?: string;
  };
};

export function LeadFormSection({
  config,
  pageId,
  sectionId,
  workspaceSlug,
  websiteSlug,
  funnel,
  accentColor,
}: {
  config: LeadFormConfig;
  pageId: string;
  sectionId: string;
  workspaceSlug: string;
  websiteSlug: string;
  funnel: SiteFunnel;
  accentColor?: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const showFirstName = config.fields?.first_name !== false;
  const showLastName = config.fields?.last_name !== false;
  const showPhone = config.fields?.phone !== false;
  const services = config.services ?? [];

  function toggleService(id: string) {
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.rpc("capture_public_lead_from_site_page", {
      p_page_id: pageId,
      p_section_id: sectionId,
      p_first_name: firstName,
      p_last_name: lastName,
      p_email: email,
      p_phone: phone,
      p_service_ids: selectedServiceIds,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }

    const action = config.on_submit?.action ?? "inline_thank_you";
    if (action === "next_page" && funnel) {
      const currentIndex = funnel.pages.findIndex((p) => p.id === pageId);
      const nextPage = currentIndex >= 0 ? funnel.pages[currentIndex + 1] : undefined;
      if (nextPage) {
        router.push(`/site/${workspaceSlug}/${websiteSlug}/${nextPage.slug}`);
        return;
      }
    }
    if (action === "custom_url" && config.on_submit?.custom_url) {
      window.location.href = config.on_submit.custom_url;
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <section className="mx-auto max-w-lg px-6 py-16 text-center">
        <h2 className="text-2xl font-semibold text-ink">{config.on_submit?.thank_you_heading || "Thanks!"}</h2>
        <p className="mt-2 text-muted">{config.on_submit?.thank_you_body || "We'll be in touch soon."}</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-lg px-6 py-12">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
        {config.heading && <h2 className="text-xl font-semibold text-ink">{config.heading}</h2>}
        {config.subheading && <p className="mt-1 text-sm text-muted">{config.subheading}</p>}
        <form onSubmit={submit} className="mt-4 space-y-3">
          {(showFirstName || showLastName) && (
            <div className="flex gap-3">
              {showFirstName && (
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              )}
              {showLastName && (
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              )}
            </div>
          )}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {showPhone && (
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          )}
          {services.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">What do you need help with?</p>
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm text-slate">
                  <input type="checkbox" checked={selectedServiceIds.includes(s.id)} onChange={() => toggleService(s.id)} />
                  {s.name}
                </label>
              ))}
            </div>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: accentColor || "#0f172a" }}
          >
            {submitting ? "Sending..." : config.button_label || "Submit"}
          </button>
        </form>
      </div>
    </section>
  );
}
