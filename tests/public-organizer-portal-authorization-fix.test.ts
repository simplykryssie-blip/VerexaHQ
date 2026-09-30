// Public Organizer portal-account authorization fix.
//
// Prior to this migration, link_public_portal_account() only checked that
// the caller-supplied p_email matched p_auth_user_id's own auth.users row --
// it never checked p_auth_user_id = auth.uid(). Its anon-reachable caller
// submit_public_organizer_response_with_signup also let a caller supply an
// arbitrary p_client_id, checked only for workspace membership, with no
// relationship to the submitter's own email/phone. Together this let an
// attacker bind their own real, self-verified account to any existing
// client's portal access within a workspace that had a public organizer
// template with requires_portal_signup=true.
//
// Confirmed via a full staging test matrix (legitimate new-lead signup,
// legitimate existing-client signup, idempotent re-activation, and four
// attack variants -- forged client id, cross-workspace client id, invalid
// token, missing/mismatched identity -- all correctly denied) before this
// migration was written up; this file locks the fix's static shape in
// place the same way tests/ero-capability-client-book-gate.test.ts does for
// its own migration.
//
// A second review found that a confirmed session + a matching/creatable
// client alone was still not proof of engagement with a SPECIFIC organizer
// -- the public token is meant to be shared, so any authenticated platform
// user who found it could call activate_public_portal_signup directly and
// self-grant portal access to their own pre-existing client record (entered
// by staff through an unrelated channel) despite never submitting anything.
// Confirmed via an 8-case staging matrix (A-H: legitimate signup, direct
// activation with no submission, existing staff-entered client with no
// submission, an existing NON-public organizer_response, cross-workspace
// token, a second user reusing the first user's token, replay/idempotency,
// invalid token -- all correctly denied except the two legitimate cases)
// before the organizer-engagement gate below was added.
//
// A third review found sign_public_engagement_letter_with_signup shared the
// exact same pre-confirmation link_public_portal_account() call (broken by
// the auth.uid() hardening above, then fixed the same way as organizer: a
// narrowly-scoped activate_public_engagement_letter_signup, not folded into
// activate_public_portal_signup, since it resolves engagement_letter_
// templates instead and gates on engagement_letter_public_signatures
// (which needs no is_public_submission-style flag -- only the two public
// signing functions ever write to it). Confirmed via the same A-H staging
// matrix shape, plus a direct call to link_public_portal_account() itself
// (now denied at the grant layer, not just by application logic) and a
// re-run of the full organizer matrix to confirm no regression.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  join(repoRoot, "supabase/migrations/20260929234503_fix_public_organizer_portal_authorization.sql"),
  "utf8"
);

function functionBody(name: string): string {
  const start = source.indexOf(`function public.${name}(`);
  expect(start, `function public.${name} should be defined in this migration`).toBeGreaterThan(-1);
  const end = source.indexOf("$function$;", start);
  return source.slice(start, end);
}

describe("link_public_portal_account (identity binding)", () => {
  const body = functionBody("link_public_portal_account");

  it("requires the caller's own session identity to match p_auth_user_id", () => {
    expect(body).toMatch(/p_auth_user_id\s+is\s+distinct\s+from\s+auth\.uid\(\)/);
  });

  it("still requires the auth user's own email to match p_email", () => {
    expect(body).toMatch(/lower\(v_auth_email\)\s*<>\s*lower\(btrim\(p_email\)\)/);
  });

  it("requires the auth user's email to be confirmed before granting access", () => {
    expect(body).toMatch(/email_confirmed_at is not null/);
    expect(body).toMatch(/email must be confirmed before portal access can be granted/);
  });

  it("(defense in depth) requires p_client_id to actually belong to p_workspace_id", () => {
    expect(body).toMatch(/client does not belong to this workspace/);
  });

  it("remains idempotent for an already-linked (client, user) pair", () => {
    expect(body).toMatch(/client_id = p_client_id and user_id = p_auth_user_id/);
  });
});

describe("submit_public_organizer_response_with_signup (client binding)", () => {
  const body = functionBody("submit_public_organizer_response_with_signup");

  it("no longer trusts p_client_id to select the client", () => {
    expect(body).not.toMatch(/coalesce\(p_client_id/);
    expect(body).not.toMatch(/invalid client for this organizer link/);
  });

  it("always derives the client from the submitter's own contact details", () => {
    expect(body).toMatch(/v_client_id := public\.find_or_create_public_lead\(v_workspace_id, p_first_name, p_last_name, p_email, p_phone\)/);
  });

  it("no longer creates the portal account directly", () => {
    expect(body).not.toMatch(/perform public\.link_public_portal_account/);
  });
});

describe("capture_public_lead_from_contact_step (client binding)", () => {
  const body = functionBody("capture_public_lead_from_contact_step");

  it("no longer creates the portal account directly", () => {
    expect(body).not.toMatch(/perform public\.link_public_portal_account/);
  });
});

describe("activate_public_portal_signup (deferred, session-bound activation)", () => {
  const body = functionBody("activate_public_portal_signup");

  it("derives identity from auth.uid(), never from a parameter", () => {
    expect(body).toMatch(/v_auth_user_id := auth\.uid\(\)/);
    expect(body).toMatch(/if v_auth_user_id is null then/);
  });

  it("derives the email from the confirmed session, not a parameter", () => {
    expect(body).toMatch(/select email, \(email_confirmed_at is not null\), raw_user_meta_data\s*\n\s*into v_email, v_email_confirmed, v_meta\s*\n\s*from auth\.users\s*\n\s*where id = v_auth_user_id/);
  });

  it("requires a confirmed email before activating", () => {
    expect(body).toMatch(/email must be confirmed before portal access can be granted/);
  });

  it("re-resolves the workspace from the organizer's own public token", () => {
    expect(body).toMatch(/from public\.organizer_templates\s*\n\s*where public_token = p_token and is_public = true and status = 'published'/);
  });

  it("is granted to authenticated only, never anon or public", () => {
    expect(source).toMatch(/revoke all on function public\.activate_public_portal_signup\(uuid\) from public/);
    expect(source).toMatch(/revoke all on function public\.activate_public_portal_signup\(uuid\) from anon/);
    expect(source).toMatch(/grant execute on function public\.activate_public_portal_signup\(uuid\) to authenticated/);
  });

  it("requires an actual public submission for this exact client and template before activating", () => {
    // A confirmed session + a matching/creatable client is not, by itself,
    // proof of engagement with THIS organizer -- the token is public and
    // meant to be shared. is_public_submission is set only by
    // submit_public_organizer_response[_with_signup], never by
    // execute_automation_step or copy_shared_engagement (the only other
    // functions that insert into organizer_responses).
    expect(body).toMatch(/from public\.organizer_responses\s*\n\s*where client_id = v_client_id\s*\n\s*and organizer_template_id = v_template_id\s*\n\s*and is_public_submission = true/);
    expect(body).toMatch(/no public organizer submission found for this account and link/);
  });

  it("resolves the organizer template id (not just its workspace) from the token, to scope the engagement check", () => {
    expect(body).toMatch(/select id, workspace_id into v_template_id, v_workspace_id/);
  });
});

describe("sign_public_engagement_letter_with_signup (deferred portal activation)", () => {
  const body = functionBody("sign_public_engagement_letter_with_signup");

  it("no longer creates the portal account directly", () => {
    expect(body).not.toMatch(/perform public\.link_public_portal_account/);
  });

  it("still writes the signature record (pre-confirmation behavior is preserved)", () => {
    expect(body).toMatch(/insert into public\.engagement_letter_public_signatures/);
  });

  it("still has no p_client_id parameter -- the client-binding defect never applied here", () => {
    expect(body).not.toMatch(/p_client_id/);
  });
});

describe("activate_public_engagement_letter_signup (deferred, session-bound activation)", () => {
  const body = functionBody("activate_public_engagement_letter_signup");

  it("derives identity from auth.uid(), never from a parameter", () => {
    expect(body).toMatch(/v_auth_user_id := auth\.uid\(\)/);
    expect(body).toMatch(/if v_auth_user_id is null then/);
  });

  it("derives the email from the confirmed session, not a parameter", () => {
    expect(body).toMatch(/select email, \(email_confirmed_at is not null\), raw_user_meta_data\s*\n\s*into v_email, v_email_confirmed, v_meta\s*\n\s*from auth\.users\s*\n\s*where id = v_auth_user_id/);
  });

  it("requires a confirmed email before activating", () => {
    expect(body).toMatch(/email must be confirmed before portal access can be granted/);
  });

  it("re-resolves the workspace and template from the engagement letter's own public token", () => {
    expect(body).toMatch(/from public\.engagement_letter_templates\s*\n\s*where public_token = p_token and is_public = true and status = 'published'/);
  });

  it("requires an actual signed engagement letter for this exact client and template before activating", () => {
    expect(body).toMatch(/from public\.engagement_letter_public_signatures\s*\n\s*where client_id = v_client_id\s*\n\s*and engagement_letter_template_id = v_template_id/);
    expect(body).toMatch(/no signed engagement letter found for this account and link/);
  });

  it("is granted to authenticated only, never anon or public", () => {
    expect(source).toMatch(/revoke all on function public\.activate_public_engagement_letter_signup\(uuid\) from public/);
    expect(source).toMatch(/revoke all on function public\.activate_public_engagement_letter_signup\(uuid\) from anon/);
    expect(source).toMatch(/grant execute on function public\.activate_public_engagement_letter_signup\(uuid\) to authenticated/);
  });

  it("does not accept a client id or auth user id from the caller", () => {
    const start = source.indexOf("function public.activate_public_engagement_letter_signup(");
    const signatureEnd = source.indexOf(")", start);
    const signature = source.slice(start, signatureEnd);
    expect(signature).not.toMatch(/p_client_id/);
    expect(signature).not.toMatch(/p_auth_user_id/);
  });
});
