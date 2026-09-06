"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PlanRow = {
  slug: string;
  name: string;
  base_price_cents: number;
  included_seats: number;
  per_seat_price_cents: number;
  signup_free_emails: number;
  signup_free_sms: number;
  signup_free_storage_gb: number;
};

type PricingTableConfig = {
  eyebrow?: string;
  heading?: string;
  subheading?: string;
  noTopPadding?: boolean;
};

// Curated, rarely-changing copy keyed by plan slug -- everything that
// actually drifts (prices, seats, free amounts) comes from the database via
// get_public_platform_plans, not from here, so this section can never go
// stale the way a hand-typed price does.
const PLAN_BLURB: Record<string, string> = {
  solo: "For a single preparer running their own book of clients.",
  team: "For a growing office with a small team sharing the workload.",
  firm: "For multi-preparer firms and offices managing several teams.",
};
const FEATURED_SLUG = "team";
const ANNUAL_MONTHS = 10;

function money(cents: number) {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toLocaleString()}` : `$${dollars.toFixed(2)}`;
}

// Renders as a complete, self-contained <section> (wrapper, optional
// heading, toggle, cards, footnote) rather than just the card grid, so it
// slots into a page as its own section between two custom_html blocks
// without either of them needing to open/close a shared wrapper around it
// -- each section is parsed as its own independent HTML fragment, so
// nothing can span across section boundaries anyway.
export function PricingTableSection({ config }: { config?: PricingTableConfig }) {
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("get_public_platform_plans").then(({ data }) => {
      setPlans((data as PlanRow[] | null) ?? []);
    });
  }, []);

  if (plans === null) return null;
  if (plans.length === 0) return null;

  return (
    <section className="vx vx-section tight" style={config?.noTopPadding ? { paddingTop: 0 } : undefined}>
      <div className="vx-wrap">
        {config?.heading && (
          <div className="vx-center" style={{ maxWidth: 720 }}>
            {config.eyebrow && <span className="vx-kicker">{config.eyebrow}</span>}
            <h2 className="vx-h2">{config.heading}</h2>
            {config.subheading && <p className="vx-sub vx-center" style={{ marginLeft: "auto", marginRight: "auto" }}>{config.subheading}</p>}
          </div>
        )}

        <div className="vx-center">
          <div className="vx-toggle">
            <button type="button" className={cycle === "monthly" ? "active" : ""} onClick={() => setCycle("monthly")}>
              Billed Monthly
            </button>
            <button type="button" className={cycle === "annual" ? "active" : ""} onClick={() => setCycle("annual")}>
              Billed Annually <span className="save">2 months free</span>
            </button>
          </div>
        </div>

        <div className="vx-prices">
          {plans.map((p) => {
            const featured = p.slug === FEATURED_SLUG;
            const annualCents = p.base_price_cents * ANNUAL_MONTHS;
            const displayCents = cycle === "annual" ? annualCents : p.base_price_cents;
            return (
              <div key={p.slug} className={`vx-price${featured ? " featured" : ""}`}>
                <small>
                  {p.name.toUpperCase()}
                  {featured ? " · MOST POPULAR" : ""}
                </small>
                <div className="vx-cost">
                  {money(displayCents)} <span>{cycle === "annual" ? "/year" : "/month"}</span>
                </div>
                {cycle === "annual" && <p className="vx-cost-note">Equal to {money(Math.round(annualCents / 12))}/month, billed once a year</p>}
                <p className="desc">{PLAN_BLURB[p.slug] ?? ""}</p>
                <ul>
                  <li>
                    {p.included_seats} included seat{p.included_seats === 1 ? "" : "s"}
                  </li>
                  <li>{p.signup_free_storage_gb} GB storage after conversion</li>
                  <li>
                    {p.signup_free_emails.toLocaleString()} free emails + {p.signup_free_sms.toLocaleString()} free SMS after conversion
                  </li>
                  <li>+{money(p.per_seat_price_cents)}/month per additional seat</li>
                </ul>
                <a href="/site/verexa-hq-crm/www/get-started" className={`vx-btn ${featured ? "vx-white" : "vx-primary"}`} style={{ marginTop: 8 }}>
                  Start 14-Day Trial
                </a>
              </div>
            );
          })}
        </div>

        <p className="vx-center" style={{ marginTop: 20, fontSize: 13, color: "#94a3b8", maxWidth: 640, marginLeft: "auto", marginRight: "auto" }}>
          Every plan includes the same platform: client CRM, pipelines &amp; workflows, documents &amp; organizers, e-signatures, client portal,
          communications, and reporting.* Team and Firm add the extra seats a multi-person office needs.
        </p>
        <p className="vx-center" style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
          *Usage beyond your plan&apos;s included email, text, and storage amount is billed at standard additional-usage rates.
        </p>
      </div>
    </section>
  );
}
