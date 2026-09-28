// HANDOFF Item 1 -- external Stripe Payment Link -> Verexa Package mapping.
// A Payment Link pasted directly into a workspace's public marketing site
// completes on the same Stripe-Connected account as Verexa's own checkout,
// but carries no Verexa metadata (no purchase_id/invoice_id/payment_plan_id),
// so it silently fell through both handleFirmPackagePurchaseCheckoutCompleted
// and handleCheckoutSessionCompleted with {skipped: "..."} and was never
// recorded anywhere. handleExternalPartnerPurchaseCheckoutCompleted already
// implements the correct session.payment_link -> firm_packages match (used
// today only by the standalone, non-Connect partner-purchase webhook); this
// wires it in as a fallback on the Connect webhook instead of duplicating
// that matching logic.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("app/api/stripe/webhook/connect/route.ts -- external Payment Link fallback", () => {
  const source = readFileSync(join(repoRoot, "app/api/stripe/webhook/connect/route.ts"), "utf8");

  it("imports the existing external-partner-purchase handler rather than reimplementing the match", () => {
    expect(source).toMatch(/import \{ handleExternalPartnerPurchaseCheckoutCompleted \} from "@\/lib\/stripe\/handleExternalPartnerPurchase";/);
  });

  it("only invokes the fallback when the primary handlers skipped, a workspace was resolved, and the session carries a payment_link", () => {
    const guardMatch = source.match(/if \(result\.skipped && workspaceId && session\.payment_link\) \{/);
    expect(guardMatch).not.toBeNull();
  });

  it("calls the fallback with the resolved workspaceId and the raw session, not session.metadata alone", () => {
    expect(source).toMatch(/handleExternalPartnerPurchaseCheckoutCompleted\(supabase, workspaceId, session\)/);
  });

  it("the fallback call sits after the primary metadata-driven result is computed and before markWebhookProcessed, so a successful fallback still reaches the same completion path", () => {
    const primaryResultIndex = source.indexOf("let result =");
    const fallbackIndex = source.indexOf("handleExternalPartnerPurchaseCheckoutCompleted(supabase, workspaceId, session)");
    const markProcessedIndex = source.indexOf("await markWebhookProcessed(supabase, logRow?.id, session.metadata?.workspace_id ?? workspaceId);");

    expect(primaryResultIndex).toBeGreaterThan(-1);
    expect(fallbackIndex).toBeGreaterThan(primaryResultIndex);
    expect(markProcessedIndex).toBeGreaterThan(fallbackIndex);
  });

  it("a successful fallback clears the skip so the response no longer reports {skipped: ...}", () => {
    const guardStart = source.indexOf("if (result.skipped && workspaceId && session.payment_link) {");
    const guardEnd = source.indexOf("}\n", source.indexOf("}", guardStart) + 1);
    const guardBody = source.slice(guardStart, guardEnd);

    expect(guardBody).toMatch(/if \(!\("skipped" in externalResult\)\) \{/);
    expect(guardBody).toMatch(/result = \{ skipped: undefined \};/);
  });

  it("declares payment_link and customer_details on the inline session type so this fallback compiles against the real Stripe payload shape", () => {
    expect(source).toMatch(/payment_link\?: string \| null;/);
    expect(source).toMatch(/customer_details\?: \{ name\?: string \| null; email\?: string \| null; phone\?: string \| null \} \| null;/);
  });
});
