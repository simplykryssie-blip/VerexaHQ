// taxFieldsFromInvoice normalizes the tax-specific slice of a Stripe Invoice
// into what workspace_subscription_invoices actually stores -- derived
// tax_amount, total_excluding_tax, and a compact tax_details breakdown --
// rather than persisting the whole Stripe object. See
// lib/stripe/subscriptionWebhooks.ts and 20261019000000_payment_first_signup
// (the migration that added these columns).
import { describe, it, expect } from "vitest";
import { taxFieldsFromInvoice } from "@/lib/stripe/subscriptionWebhooks";

type PartialInvoice = Partial<Parameters<typeof taxFieldsFromInvoice>[0]>;
function fakeInvoice(partial: PartialInvoice): Parameters<typeof taxFieldsFromInvoice>[0] {
  return partial as unknown as Parameters<typeof taxFieldsFromInvoice>[0];
}

describe("taxFieldsFromInvoice", () => {
  it("returns all nulls when the invoice has no tax information (automatic_tax not enabled, or no registration yet)", () => {
    expect(taxFieldsFromInvoice(fakeInvoice({ total: 9999, total_excluding_tax: null }))).toEqual({
      tax_amount: null,
      total_excluding_tax: null,
      tax_details: null,
    });
  });

  it("returns all nulls when total_excluding_tax is present but total is missing", () => {
    expect(taxFieldsFromInvoice(fakeInvoice({ total_excluding_tax: 9999 }))).toEqual({
      tax_amount: null,
      total_excluding_tax: null,
      tax_details: null,
    });
  });

  it("derives tax_amount as total minus total_excluding_tax once Stripe Tax actually calculates something", () => {
    const result = taxFieldsFromInvoice(
      fakeInvoice({
        total: 10850,
        total_excluding_tax: 9999,
        total_taxes: [{ amount: 851, tax_rate_details: { percentage_decimal: "8.51" } }],
      })
    );
    expect(result).toEqual({
      tax_amount: 851,
      total_excluding_tax: 9999,
      tax_details: [{ amount: 851, tax_rate_details: { percentage_decimal: "8.51" } }],
    });
  });

  it("treats an empty total_taxes array as no breakdown to store", () => {
    const result = taxFieldsFromInvoice(fakeInvoice({ total: 9999, total_excluding_tax: 9999, total_taxes: [] }));
    expect(result).toEqual({ tax_amount: 0, total_excluding_tax: 9999, tax_details: null });
  });
});
