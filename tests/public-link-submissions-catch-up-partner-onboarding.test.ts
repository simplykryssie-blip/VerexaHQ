// The welcome letter links partners to the generic public organizer (/o) and
// engagement-letter (/e) pages, which never touched partner_onboardings -- the
// record the "Software & Banking Application is Complete" wait step reads.
// This pins the catch-up migration's contract.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20261109000000_public_link_submissions_catch_up_partner_onboarding.sql"),
  "utf8"
);

describe("public-link submissions catch up partner onboarding", () => {
  it("fires on public organizer responses and public agreement signatures", () => {
    expect(sql).toMatch(/after insert on public\.organizer_responses/);
    expect(sql).toMatch(/after insert on public\.engagement_letter_public_signatures/);
  });

  it("matches only open onboardings in the same workspace by submitter email", () => {
    expect(sql).toMatch(/po\.workspace_id = p_workspace_id/);
    expect(sql).toMatch(/po\.status in \('pending', 'in_progress'\)/);
    expect(sql).toMatch(/lower\(btrim\(coalesce\(w\.primary_contact_email, fc\.manual_email, ''\)\)\) = lower\(btrim\(p_email\)\)/);
  });

  it("prefers the onboarding whose package points at the signed template", () => {
    expect(sql).toMatch(/pk\.agreement_template_id is not distinct from p_agreement_template_id/);
  });

  it("only fills in outstanding steps and never overwrites a completed one", () => {
    expect(sql).toMatch(/and application_submitted_at is null/);
    expect(sql).toMatch(/and po\.agreement_signed_at is null/);
  });

  it("mirrors the connection-scoped public path (status, review task, review entry)", () => {
    expect(sql).toMatch(/status = case when status = 'pending' then 'in_progress' else status end/);
    expect(sql).toMatch(/'Review new partner application'/);
    expect(sql).toMatch(/_maybe_enter_review/);
  });

  it("can never block the visitor's own submission", () => {
    expect(sql.match(/exception when others then\s+raise warning/g)?.length).toBe(2);
  });

  it("keeps internal functions off the public API", () => {
    expect(sql).toMatch(/revoke all on function public\._match_open_partner_onboarding\(uuid, text, uuid\) from public, anon, authenticated/);
    expect(sql).toMatch(/revoke all on function public\._apply_public_application_to_onboarding\(uuid\) from public, anon, authenticated/);
    expect(sql).toMatch(/revoke all on function public\._apply_public_agreement_to_onboarding\(uuid, text, uuid, text, text\) from public, anon, authenticated/);
  });

  it("uses no drop/delete statements", () => {
    expect(sql).not.toMatch(/\bdrop\b|\bdelete\b/i);
  });
});
