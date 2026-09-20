// Regression coverage for VEREXAHQ -- CONTACTS COMPLETION PASS, Phase 5b
// (signature audit trail). signed_at/declined_at/decline_reason already
// existed; user_agent existed but was never populated; there was no IP
// capture and no "viewed" event. This adds a token-authorized /track route
// (server-captured IP, browser-reported user agent) called from
// PublicSignView.tsx on page load, plus a parallel set_signature_user_agent
// call from the staff/portal-authenticated SignaturesPanel.tsx path --
// mirroring the existing /api/sign/finalize wiring pattern in both places.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("app/api/sign/[token]/track/route.ts", () => {
  const source = readFileSync(join(repoRoot, "app/api/sign/[token]/track/route.ts"), "utf8");

  it("is rate limited using the shared clientIp helper, matching the other public sign routes", () => {
    expect(source).toMatch(/checkRateLimit\(`sign-track:\$\{clientIp\(request\)\}`/);
  });

  it("captures IP server-side via track_signature_view_by_token, never trusting a client-supplied IP", () => {
    expect(source).toMatch(/track_signature_view_by_token/);
    expect(source).toMatch(/p_ip_address:\s*clientIp\(request\)/);
    expect(source).not.toMatch(/p_ip_address:\s*body/);
  });

  it("only sets the user agent when the client actually provided one", () => {
    const guardIndex = source.indexOf("if (userAgent)");
    const rpcIndex = source.indexOf("set_signature_user_agent_by_token");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(rpcIndex).toBeGreaterThan(guardIndex);
  });

  it("uses the service client -- the token itself is the authorization, same trust model as the file/signature-image routes", () => {
    expect(source).toMatch(/createServiceClient/);
  });
});

describe("PublicSignView.tsx -- view/user-agent tracking wiring", () => {
  const source = readFileSync(join(repoRoot, "components/sign/PublicSignView.tsx"), "utf8");

  it("fires the track call on mount, fire-and-forget, with the real navigator.userAgent", () => {
    expect(source).toMatch(/fetch\(`\/api\/sign\/\$\{token\}\/track`/);
    expect(source).toMatch(/userAgent:\s*navigator\.userAgent/);
    expect(source).toMatch(/\.catch\(\(\) => \{\}\)/);
  });
});

describe("SignaturesPanel.tsx -- set_signature_user_agent wiring", () => {
  const source = readFileSync(join(repoRoot, "components/documents/SignaturesPanel.tsx"), "utf8");

  it("submitSignature records the user agent for the signer right after a successful record_signature", () => {
    const body = source.match(/async function submitSignature\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
    const recordIndex = body.indexOf('supabase.rpc("record_signature"');
    const userAgentIndex = body.indexOf('supabase.rpc("set_signature_user_agent"');
    expect(recordIndex).toBeGreaterThan(-1);
    expect(userAgentIndex).toBeGreaterThan(recordIndex);
    expect(body).toMatch(/p_signer_id: signingId, p_user_agent: navigator\.userAgent/);
  });
});

describe("signature_audit_trail migration -- shape invariants", () => {
  const source = readFileSync(
    join(repoRoot, "supabase/migrations/20261031030000_signature_audit_trail.sql"),
    "utf8"
  );

  it("adds ip_address/viewed_at as purely additive columns, never dropping or altering existing ones", () => {
    expect(source).toMatch(/add column if not exists ip_address text/);
    expect(source).toMatch(/add column if not exists viewed_at timestamptz/);
    expect(source).not.toMatch(/drop column/i);
  });

  it("uses three new, separately-named functions rather than changing any existing RPC's signature", () => {
    expect(source).not.toMatch(/drop function/i);
    expect(source).toMatch(/create or replace function public\.track_signature_view_by_token/);
    expect(source).toMatch(/create or replace function public\.set_signature_user_agent_by_token/);
    expect(source).toMatch(/create or replace function public\.set_signature_user_agent\(/);
  });

  it("set_signature_user_agent mirrors record_signature's own permission check (staff OR the matching portal signer)", () => {
    expect(source).toMatch(/has_permission\(v_workspace_id, 'signatures\.request'\)/);
    expect(source).toMatch(/is_portal_user_for_entity\(v_entity_type, v_entity_id\)/);
  });
});
