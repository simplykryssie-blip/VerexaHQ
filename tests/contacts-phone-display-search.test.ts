// Regression coverage for VEREXAHQ CONTACTS PASS 1 (phone display, phone
// search, sub-Contact input consistency). The audit found: (1) the
// Contacts list and Full Contact record rendered raw, unformatted phone
// strings even though lib/phone.ts's formatPhone() already exists and is
// already wired into every phone input; (2) search_clients matched phone
// numbers with a raw ilike against the formatted primary_phone column, so
// a differently-punctuated query never matched a stored value; and (3) the
// sub-Contact (client_contacts) phone/email fields had no `type` set on
// their InlineAddForm field defs, so they got neither live phone
// formatting nor the lowercase/trim email normalization every other phone
// or email input on this page already has.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { formatPhone } from "@/lib/phone";
import { CLIENT_COLUMNS, type ClientRow } from "@/app/(app)/clients/clientListColumns";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase/migrations");
const SEARCH_CLIENTS_MIGRATION = "20261031070000_search_clients_normalized_phone_match.sql";
const addFormsSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "app/(app)/clients/[id]/AddForms.tsx"),
  "utf8"
);

/** AddContactForm/EditContactForm call useRouter() directly, so they can't
 *  be invoked as plain functions outside a real React render tree (no
 *  AppRouterContext provider in a hookless unit test) -- source-text
 *  assertion is the same technique this repo's search_clients migration
 *  regression test already uses for exactly this kind of "does the field
 *  definition have the right shape" check. */
function fieldBlockFor(functionName: string) {
  const start = addFormsSource.indexOf(`export function ${functionName}(`);
  expect(start, `${functionName} not found in AddForms.tsx`).toBeGreaterThan(-1);
  const fieldsStart = addFormsSource.indexOf("fields={[", start);
  const fieldsEnd = addFormsSource.indexOf("]}", fieldsStart);
  return addFormsSource.slice(fieldsStart, fieldsEnd);
}

describe("formatPhone -- every reasonable representation normalizes the same way", () => {
  const REPRESENTATIONS = ["3378587792", "337-858-7792", "337 858 7792", "(337) 858-7792"];

  it("formats every representation to the same canonical (337) 858-7792 string", () => {
    for (const value of REPRESENTATIONS) {
      expect(formatPhone(value)).toBe("(337) 858-7792");
    }
  });

  it("all four representations produce an identical formatted result (display consistency)", () => {
    const formatted = new Set(REPRESENTATIONS.map(formatPhone));
    expect(formatted.size).toBe(1);
  });
});

describe("Contacts list -- Phone column applies formatPhone at display time", () => {
  const phoneColumn = CLIENT_COLUMNS.find((c) => c.key === "phone");

  function baseRow(overrides: Partial<ClientRow> = {}): ClientRow {
    return {
      id: "client-1",
      client_type: "individual",
      first_name: "Dustin",
      last_name: "Fruge",
      business_name: null,
      primary_email: null,
      primary_phone: null,
      lifecycle_status: "active",
      tags: [],
      ...overrides,
    };
  }

  it("renders a raw stored phone number in the canonical (337) 858-7792 format", () => {
    const el = phoneColumn!.render(baseRow({ primary_phone: "3378587792" })) as { props: { children: string } };
    expect(el.props.children).toBe("(337) 858-7792");
  });

  it("renders an already-formatted phone number unchanged", () => {
    const el = phoneColumn!.render(baseRow({ primary_phone: "(337) 858-7792" })) as { props: { children: string } };
    expect(el.props.children).toBe("(337) 858-7792");
  });

  it("still renders the empty-state dash for no phone on file, not a crash", () => {
    const el = phoneColumn!.render(baseRow({ primary_phone: null })) as { props: { children: string } };
    expect(el.props.children).toBe("--");
  });
});

describe("search_clients -- normalized_phone match, added via 20261031070000", () => {
  const source = readFileSync(join(migrationsDir, SEARCH_CLIENTS_MIGRATION), "utf8");

  it("matches the free-text query against clients.normalized_phone using a digits-only version of the query", () => {
    expect(source).toContain("regexp_replace(coalesce(p_query, ''), '\\D', '', 'g')");
    expect(source).toContain("c.normalized_phone ilike '%' || v_query_digits || '%'");
  });

  it("guards the normalized_phone clause so a name-only query (no digits) never matches via an empty pattern", () => {
    expect(source).toContain("v_query_digits <> ''");
  });

  it("keeps every pre-existing search predicate intact -- name, email, raw phone, ssn/ein last4, engagement number", () => {
    expect(source).toContain("coalesce(c.business_name, '') || ' ' || coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) ilike");
    expect(source).toContain("c.primary_email ilike '%' || p_query || '%'");
    expect(source).toContain("c.primary_phone ilike '%' || p_query || '%'");
    expect(source).toContain("c.ssn_last4 = p_query");
    expect(source).toContain("c.ein_last4 = p_query");
    expect(source).toContain("e.engagement_number ilike '%' || p_query || '%'");
  });

  it("keeps every other existing filter predicate untouched (service, staff, stage, docs, balance, type, has_email/has_phone)", () => {
    for (const needle of [
      "p_assigned_staff_id is null or c.relationship_manager_id = p_assigned_staff_id",
      "p_client_type is null or c.client_type = p_client_type",
      "p_has_email is null or p_has_email = (c.primary_email is not null)",
      "p_has_phone is null or p_has_phone = (c.primary_phone is not null)",
      "p_service_id is null or exists",
      "p_pipeline_stage_name is null or exists",
      "p_missing_documents is null or p_missing_documents = exists",
      "p_outstanding_balance is null or p_outstanding_balance = exists",
    ]) {
      expect(source, `missing predicate: ${needle}`).toContain(needle);
    }
  });

  it("keeps the exact same 14-parameter signature as production -- a changed signature would register as a stale duplicate overload instead of replacing the function in place (the exact defect 20261031050000 already had to fix once for this function)", () => {
    const paramBlockStart = source.indexOf("create or replace function public.search_clients(") + "create or replace function public.search_clients(".length;
    const paramBlockEnd = source.indexOf("\n)", paramBlockStart);
    const params = source
      .slice(paramBlockStart, paramBlockEnd)
      .split(",")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((param) => param.replace(/^p_\w+\s+/, "").replace(/\s+default.*$/i, ""));
    expect(params.join(", ")).toBe(
      "uuid, text, text[], text, uuid, uuid, text, boolean, boolean, text, boolean, boolean, integer, integer"
    );
  });
});

describe("Sub-Contact (client_contacts) form fields -- phone/email now use the shared InlineAddForm input treatment", () => {
  it("AddContactForm's phone field is type=tel (live phone formatting) and email field is type=email (lowercase/trim on blur)", () => {
    const block = fieldBlockFor("AddContactForm");
    expect(block).toMatch(/name:\s*"phone",\s*label:\s*"Phone",\s*type:\s*"tel"/);
    expect(block).toMatch(/name:\s*"email",\s*label:\s*"Email",\s*type:\s*"email"/);
  });

  it("EditContactForm's phone field is type=tel and email field is type=email", () => {
    const block = fieldBlockFor("EditContactForm");
    expect(block).toMatch(/name:\s*"phone",\s*label:\s*"Phone",\s*type:\s*"tel"/);
    expect(block).toMatch(/name:\s*"email",\s*label:\s*"Email",\s*type:\s*"email"/);
  });
});
