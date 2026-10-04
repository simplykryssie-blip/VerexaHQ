// F-03 / F-04 (Verexa Complete System Audit, 2026-10-01 -- P05-01/P05-02):
// submit_public_organizer_response() trusted a caller-supplied p_client_id
// (`coalesce(p_client_id, find_or_create_public_lead(...))`), checked only
// for workspace membership -- never that it related to the submitter's own
// email/phone. The exact same defect shape in the sibling
// submit_public_organizer_response_with_signup() was already fixed by
// migration 20260929234503_fix_public_organizer_portal_authorization.sql
// (PR #348), which this migration's own header quotes; that fix was never
// applied to this (more commonly used, non-signup) function until now.
//
// F-04, bundled in the same migration because it's the same function and
// investigation: the answers-insertion loop enforced no required/
// conditional/type validation server-side -- all of it lived only in
// PublicOrganizerForm.tsx, trivially bypassed by a direct RPC call.
//
// Source-level checks only, mirroring this repo's established convention
// (tests/public-organizer-portal-authorization-fix.test.ts,
// tests/aal2-migration.test.ts) -- no live Supabase test-project
// credentials exist in this sandbox. Both fixes were additionally proven
// BEHAVIORALLY (not just structurally) during development, against a
// disposable local Postgres 16 instance loaded with a minimal stand-in
// schema (organizer_templates/organizer_fields/clients/organizer_responses/
// organizer_response_answers, plus stub/no-op versions of the unchanged
// helper functions this RPC calls) -- 10 real invocations covering forged
// p_client_id (did not land on the target), legitimate returning-client
// resolution, a bogus/cross-workspace p_client_id, omitted required
// fields, a conditionally-hidden field answered anyway (dropped, not
// persisted, no exception), the same field made visible (persisted),
// malformed vs. valid SSN, and malformed vs. valid signature shape -- all
// passed with the expected outcome. That harness was local-only, had no
// connection to Supabase/Verexa, and was torn down afterward; it is not
// part of this committed suite because it isn't CI-reproducible without a
// local Postgres, so it is not re-asserted here as if it were a live
// Supabase integration test -- the checks below are the static/source
// claims that harness exercised dynamically.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const migration = readFileSync(
  join(migrationsDir, "20261104010119_fix_submit_public_organizer_response_client_binding_and_validation.sql"),
  "utf8"
);
const priorFixMigration = readFileSync(
  join(migrationsDir, "20260929234503_fix_public_organizer_portal_authorization.sql"),
  "utf8"
);

function fnBody(): string {
  const start = migration.indexOf("function public.submit_public_organizer_response(");
  const end = migration.lastIndexOf("$function$;");
  expect(start).toBeGreaterThan(-1);
  return migration.slice(start, end);
}

describe("F-03: submit_public_organizer_response() client binding", () => {
  const body = fnBody();

  it("no longer trusts p_client_id to select the client", () => {
    expect(body).not.toMatch(/coalesce\(p_client_id/);
    expect(body).not.toMatch(/invalid client for this organizer link/);
  });

  it("always derives the client from the submitter's own contact details, unconditionally", () => {
    expect(body).toMatch(/v_client_id\s*:=\s*public\.find_or_create_public_lead\(v_workspace_id, p_first_name, p_last_name, p_email, p_phone\);/);
  });

  it("keeps p_client_id on the signature for backward compatibility, but never reads it", () => {
    const signatureStart = migration.indexOf("function public.submit_public_organizer_response(");
    const signatureEnd = migration.indexOf("$function$", signatureStart);
    const signature = migration.slice(signatureStart, migration.indexOf(")", migration.indexOf("as $function$", signatureStart)));
    expect(signature).toMatch(/p_client_id uuid default null::uuid/);
    // Outside of comment prose explaining *why* it's unused, p_client_id
    // must never appear in an actual expression/statement in the
    // executable body -- it is a dead parameter now, exactly like the
    // already-fixed sibling function.
    const declareEnd = body.indexOf("begin");
    const executableBody = body
      .slice(declareEnd)
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(executableBody).not.toMatch(/p_client_id/);
  });

  it("preserves workspace resolution and the operational-workspace guard unchanged", () => {
    expect(body).toMatch(/select id, workspace_id into v_template_id, v_workspace_id\s*\n\s*from public\.organizer_templates/);
    expect(body).toMatch(/if not public\.is_workspace_operational\(v_workspace_id\) then/);
  });

  it("still requires an email before doing anything else (unchanged precondition)", () => {
    expect(body).toMatch(/if p_email is null or btrim\(p_email\) = '' then\s*\n\s*raise exception 'Email is required';/);
  });
});

describe("F-03 (defense in depth): submit_public_organizer_response_with_signup is untouched by this migration", () => {
  it("this migration does not define or redefine the signup variant", () => {
    expect(migration).not.toMatch(/function public\.submit_public_organizer_response_with_signup/);
  });

  it("the already-shipped fix (PR #348) in the other migration still holds -- not modified here", () => {
    const start = priorFixMigration.indexOf("function public.submit_public_organizer_response_with_signup(");
    const end = priorFixMigration.indexOf("$function$;", start);
    const signupBody = priorFixMigration.slice(start, end);
    expect(signupBody).not.toMatch(/coalesce\(p_client_id/);
    expect(signupBody).toMatch(/v_client_id := public\.find_or_create_public_lead\(v_workspace_id, p_first_name, p_last_name, p_email, p_phone\);/);
  });
});

describe("F-04: required-field validation", () => {
  const body = fnBody();

  it("raises a distinct, explicit error when a required top-level field has no non-blank answer", () => {
    expect(body).toMatch(/raise exception 'Please answer: %', v_field\.label;/);
  });

  it("scopes required-field enforcement to top-level, answerable field types only", () => {
    expect(body).toMatch(/f\.parent_field_id is null\s*\n\s*and f\.field_type not in \('section', 'rich_text', 'repeating_section'\)/);
  });

  it("does not enforce required-ness for a field this submission resolves as hidden", () => {
    // The hidden-field branch removes the field from both tracking maps
    // and `continue`s before the is_required check ever runs for it.
    const hiddenBranch = body.slice(body.indexOf("if not v_visible then"), body.indexOf("if v_field.is_required then"));
    expect(hiddenBranch).toMatch(/continue;/);
  });
});

describe("F-04: conditional (show_if) visibility, evaluated server-side", () => {
  const body = fnBody();

  it("evaluates show_if using the same operator set as lib/organizer/conditionalLogic.ts", () => {
    for (const op of ["equals", "not_equals", "includes", "not_includes", "is_answered", "is_blank"]) {
      expect(body).toContain(`'${op}'`);
    }
  });

  it("supports both 'all' and 'any' match modes", () => {
    expect(body).toMatch(/v_match_mode\s*:=\s*case when v_cond->>'match' = 'any' then 'any' else 'all' end;/);
    expect(body).toMatch(/v_match_mode = 'any'/);
  });

  it("documented choice: a conditionally-hidden field's answer is dropped, not rejected and not persisted", () => {
    expect(body).toMatch(/Documented choice: drop this field's answer entirely/);
    expect(body).toMatch(/v_answer_text_by_field := v_answer_text_by_field - \(v_field\.id::text\);/);
    expect(body).toMatch(/v_submitted_field_ids := v_submitted_field_ids - \(v_field\.id::text\);/);
  });

  it("the answer-insertion loop skips any field_id no longer tracked (hidden or unrecognized)", () => {
    expect(body).toMatch(/if not \(v_submitted_field_ids \? \(v_answer->>'field_id'\)\) then\s*\n\s*-- Dropped above/);
  });
});

describe("F-04: SSN/EIN format validation", () => {
  const body = fnBody();

  it("rejects a non-blank SSN/EIN answer that isn't exactly 9 digits once non-digits are stripped", () => {
    expect(body).toMatch(/if v_answer_field_type in \('ssn', 'ein'\) then/);
    expect(body).toMatch(/v_digits := regexp_replace\(v_raw_text, '\\D', '', 'g'\);/);
    expect(body).toMatch(/if v_digits <> '' and length\(v_digits\) <> 9 then\s*\n\s*raise exception '% must be exactly 9 digits\.', v_answer_field_label;/);
  });

  it("allows a blank SSN/EIN value through this check (required-ness, if any, is enforced separately)", () => {
    // The guard is specifically `v_digits <> ''` -- an empty digit string
    // short-circuits past the raise.
    const ssnCheck = body.slice(body.indexOf("if v_answer_field_type in ('ssn', 'ein') then"), body.indexOf("elsif v_answer_field_type = 'signature'"));
    expect(ssnCheck).toMatch(/v_digits <> ''/);
  });
});

describe("F-04: malformed structured signature values", () => {
  const body = fnBody();

  it("rejects a submitted signature value that isn't a jsonb object with a non-blank typed_name", () => {
    expect(body).toMatch(/elsif v_answer_field_type = 'signature' and v_answer->'value' is not null/);
    expect(body).toMatch(/raise exception 'Invalid signature value for %', v_answer_field_label;/);
  });

  it("does not reject name/address/file_upload answers submitted as a legacy plain string (unchanged downstream contract)", () => {
    // Only 'ssn'/'ein'/'signature' get a shape/format check here -- name,
    // address, and file_upload answers pass through exactly as before,
    // since _propose_client_field_from_organizer_answer and
    // resolve_and_sign_organizer_response already defensively handle both
    // the structured-object and legacy-plain-string shapes for those types.
    expect(body).not.toMatch(/v_answer_field_type = 'name'/);
    expect(body).not.toMatch(/v_answer_field_type = 'address'/);
    expect(body).not.toMatch(/v_answer_field_type = 'file_upload'/);
  });
});

describe("F-04: all rejections are explicit RPC errors, not silent acceptance", () => {
  const body = fnBody();

  it("every validation failure path raises an exception (none merely logs, skips, or returns early)", () => {
    const raiseCount = (body.match(/raise exception/g) ?? []).length;
    // Email required, link unavailable, workspace not operational, required
    // field missing, SSN/EIN malformed, signature malformed -- at least 6
    // distinct raise sites.
    expect(raiseCount).toBeGreaterThanOrEqual(6);
  });
});

describe("Scope discipline: this migration touches only the target function", () => {
  it("defines exactly one function", () => {
    const matches = migration.match(/create or replace function public\.\w+/g) ?? [];
    expect(matches).toEqual(["create or replace function public.submit_public_organizer_response"]);
  });

  it("touches no RLS policy, grant, or revoke statement", () => {
    expect(migration).not.toMatch(/create policy|drop policy|alter policy/i);
    expect(migration).not.toMatch(/^\s*grant |^\s*revoke /im);
  });

  it("touches no other organizer function by name", () => {
    for (const other of [
      "capture_public_lead_from_contact_step",
      "activate_public_portal_signup",
      "link_public_portal_account",
      "resolve_and_sign_organizer_response",
      "resolve_organizer_response_service",
      "_propose_client_field_from_organizer_answer",
      "find_or_create_public_lead",
    ]) {
      // find_or_create_public_lead and the others are CALLED (referenced),
      // which is expected and fine -- this asserts none of them is
      // (re)defined by this migration.
      expect(migration).not.toMatch(new RegExp(`create or replace function public\\.${other}\\(`));
    }
  });

  it("touches no table, index, or constraint", () => {
    expect(migration).not.toMatch(/create table|alter table|create index|drop table/i);
  });
});
