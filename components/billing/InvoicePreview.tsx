"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { readableTextColor } from "@/lib/color";

function money(n: number) {
  return `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type PreviewLineItem = { description: string; quantity: number; unit_price: number };

type DocumentBranding = {
  displayName: string | null;
  logoUrl: string | null;
  /** Matches Brand Center's "public forms" fallback order: the accent color, else the fallback color. */
  bannerColor: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  footerText: string | null;
};

/** workspaces.mailing_address is stored as a JSON-encoded string (street/street2/city/state/zip) --
 * mirrors the format_mailing_address() SQL function used for engagement letter merge fields, so a
 * quote's address line reads the same way everywhere else in the app already formats this field. */
function formatAddress(raw: string | null): string | null {
  if (!raw) return null;
  let a: { street?: string; street2?: string; city?: string; state?: string; zip?: string };
  try {
    a = JSON.parse(raw);
  } catch {
    return raw;
  }
  const street = [a.street, a.street2].filter(Boolean).join(", ");
  const cityState = [a.city, a.state].filter(Boolean).join(", ");
  const cityStateZip = [cityState, a.zip].filter(Boolean).join(" ");
  return [street, cityStateZip].filter(Boolean).join(", ") || null;
}

/** Pulls the small slice of branding a rendered quote/invoice actually needs
 * (logo, banner color, firm contact info, footer text) directly from
 * Supabase by workspace id, rather than threading it through every tab
 * component between a client/engagement page and this preview -- branding
 * barely changes and a brief unbranded flash on first paint is a fine
 * trade-off for not touching a dozen intermediate prop lists. */
function useDocumentBranding(workspaceId: string): DocumentBranding | null {
  const [branding, setBranding] = useState<DocumentBranding | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const [{ data: b }, { data: w }] = await Promise.all([
        supabase
          .from("branding")
          .select("display_name, logo_url, primary_color, secondary_color, support_phone, support_email, document_footer_text")
          .eq("workspace_id", workspaceId)
          .maybeSingle(),
        supabase.from("workspaces").select("website, mailing_address").eq("id", workspaceId).maybeSingle(),
      ]);
      if (cancelled) return;
      setBranding({
        displayName: b?.display_name ?? null,
        logoUrl: b?.logo_url ?? null,
        bannerColor: b?.secondary_color ?? b?.primary_color ?? null,
        phone: b?.support_phone ?? null,
        email: b?.support_email ?? null,
        website: (w?.website as string | null) ?? null,
        address: (w?.mailing_address as string | null) ?? null,
        footerText: b?.document_footer_text ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return branding;
}

export function InvoicePreview({
  kind,
  workspaceId,
  firmName,
  clientName,
  number,
  issueDate,
  dueDate,
  lineItems,
  subtotal,
  discountAmount,
  taxAmount,
  totalAmount,
  notes,
  status,
}: {
  kind: "invoice" | "quote";
  /** Looks up this workspace's logo, banner color, contact info, and footer text. */
  workspaceId: string;
  firmName: string;
  clientName: string;
  number: string | null;
  issueDate: string | null;
  dueDate: string | null;
  lineItems: PreviewLineItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string | null;
  status?: string;
}) {
  const branding = useDocumentBranding(workspaceId);
  const bannerColor = branding?.bannerColor || "#0F172A";
  const bannerTextColor = readableTextColor(bannerColor);
  const bannerSubtleColor = bannerTextColor === "#FFFFFF" ? "rgba(255,255,255,0.72)" : "rgba(15,23,42,0.65)";
  const contactLine = [branding?.phone, branding?.email, branding?.website].filter(Boolean).join("  •  ");
  const addressLine = formatAddress(branding?.address ?? null);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft text-sm">
      <div className="flex items-start justify-between gap-4 px-8 py-6" style={{ backgroundColor: bannerColor, color: bannerTextColor }}>
        <div className="flex items-center gap-3">
          {branding?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-white/10 object-contain p-1" />
          )}
          <div>
            <p className="text-base font-semibold">{branding?.displayName || firmName}</p>
            {(addressLine || contactLine) && (
              <p className="mt-0.5 text-xs" style={{ color: bannerSubtleColor }}>
                {[addressLine, contactLine].filter(Boolean).join("  •  ")}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold uppercase tracking-wide">{kind === "invoice" ? "Invoice" : "Quote"}</p>
          {number && <p className="mt-1 text-xs" style={{ color: bannerSubtleColor }}>{number}</p>}
          {status && (
            <p className="mt-0.5 text-xs capitalize" style={{ color: bannerSubtleColor }}>
              {status}
            </p>
          )}
        </div>
      </div>

      <div className="p-8">
        <p className="text-muted">Bill to: <span className="text-slate">{clientName}</span></p>

        <div className="mt-4 flex gap-8 text-xs text-muted">
          {issueDate && (
            <div>
              <p className="uppercase tracking-wide">{kind === "invoice" ? "Issue date" : "Date"}</p>
              <p className="mt-0.5 text-sm text-slate">{new Date(issueDate).toLocaleDateString()}</p>
            </div>
          )}
          {dueDate && (
            <div>
              <p className="uppercase tracking-wide">{kind === "invoice" ? "Due date" : "Valid until"}</p>
              <p className="mt-0.5 text-sm text-slate">{new Date(dueDate).toLocaleDateString()}</p>
            </div>
          )}
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Unit price</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lineItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted">
                  No line items yet.
                </td>
              </tr>
            ) : (
              lineItems.map((li, i) => (
                <tr key={i}>
                  <td className="py-2 text-slate">{li.description || "--"}</td>
                  <td className="py-2 text-right text-slate">{li.quantity}</td>
                  <td className="py-2 text-right text-slate">{money(li.unit_price)}</td>
                  <td className="py-2 text-right text-slate">{money(li.quantity * li.unit_price)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate">
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-slate">
                <span>Discount</span>
                <span>-{money(discountAmount)}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between text-slate">
                <span>Tax</span>
                <span>{money(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold text-ink" style={{ borderTopColor: bannerColor }}>
              <span>Total</span>
              <span>{money(totalAmount)}</span>
            </div>
          </div>
        </div>

        {notes && (
          <div className="mt-6 border-t border-border pt-4 text-xs text-muted">
            <p className="whitespace-pre-wrap">{notes}</p>
          </div>
        )}

        {branding?.footerText && (
          <div className="mt-6 border-t border-border pt-4 text-center text-[11px] leading-relaxed text-muted">
            <p className="whitespace-pre-wrap">{branding.footerText}</p>
          </div>
        )}
      </div>
    </div>
  );
}
