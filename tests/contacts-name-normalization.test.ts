// Regression coverage for VEREXAHQ CONTACTS PASS 4 (conservative, blur-time
// name normalization). normalizeName is a pure function and is exercised
// directly; InlineAddForm/EditClientProfileForm/AddForms wiring uses
// source-text assertion since they're "use client" components calling hooks
// outside a render tree, the same constraint every other Contacts pass's
// component tests have hit.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizeName } from "@/lib/name";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const inlineFormSource = readFileSync(join(repoRoot, "components/InlineAddForm.tsx"), "utf8");
const profileFormSource = readFileSync(join(repoRoot, "app/(app)/clients/[id]/EditClientProfileForm.tsx"), "utf8");
const addFormsSource = readFileSync(join(repoRoot, "app/(app)/clients/[id]/AddForms.tsx"), "utf8");

describe("normalizeName -- naive all-lower/all-upper casing gets capitalized at word boundaries", () => {
  it("capitalizes a simple all-lowercase first name", () => {
    expect(normalizeName("john")).toBe("John");
  });

  it("capitalizes an all-lowercase name with an apostrophe", () => {
    expect(normalizeName("o'neal")).toBe("O'Neal");
  });

  it("capitalizes an all-lowercase name with an internal apostrophe mid-phrase", () => {
    expect(normalizeName("john o'neal")).toBe("John O'Neal");
  });

  it("capitalizes an all-lowercase hyphenated name", () => {
    expect(normalizeName("mary-jane smith-jones")).toBe("Mary-Jane Smith-Jones");
  });

  it("capitalizes an all-lowercase multi-word compound/particle name", () => {
    expect(normalizeName("mary ann de la cruz")).toBe("Mary Ann De La Cruz");
  });

  it("collapses internal whitespace while capitalizing", () => {
    expect(normalizeName("john   smith")).toBe("John Smith");
  });

  it("capitalizes ALL-CAPS input the same way (documented limitation: no internal-capital reconstruction)", () => {
    expect(normalizeName("MCDONALD")).toBe("Mcdonald");
    expect(normalizeName("JOHN SMITH")).toBe("John Smith");
  });
});

describe("normalizeName -- deliberate mixed-case input is left completely unchanged", () => {
  it("preserves McDonald exactly as typed", () => {
    expect(normalizeName("McDonald")).toBe("McDonald");
  });

  it("preserves O'Neal exactly as typed", () => {
    expect(normalizeName("O'Neal")).toBe("O'Neal");
  });

  it("preserves a mixed-case multi-word name exactly as typed", () => {
    expect(normalizeName("Mary McDonald")).toBe("Mary McDonald");
  });

  it("preserves DeSantos-style internal capitals exactly as typed", () => {
    expect(normalizeName("DeSantos")).toBe("DeSantos");
  });
});

describe("normalizeName -- edge cases", () => {
  it("returns an empty string unchanged", () => {
    expect(normalizeName("")).toBe("");
  });

  it("returns whitespace-only input trimmed to empty", () => {
    expect(normalizeName("   ")).toBe("");
  });

  it("trims leading/trailing whitespace on otherwise-normal input", () => {
    expect(normalizeName("  john  ")).toBe("John");
  });

  it("leaves non-alphabetic input (no letters to normalize) unchanged", () => {
    expect(normalizeName("123")).toBe("123");
  });
});

describe("InlineAddForm -- new 'name' field type calls normalizeName on blur only", () => {
  it("adds 'name' to the FieldDef type union", () => {
    expect(inlineFormSource).toMatch(/type\?:\s*"text"\s*\|\s*"email"\s*\|\s*"tel"\s*\|\s*"date"\s*\|\s*"select"\s*\|\s*"textarea"\s*\|\s*"richtext"\s*\|\s*"name"/);
  });

  it("imports normalizeName from lib/name", () => {
    expect(inlineFormSource).toContain('import { normalizeName } from "@/lib/name"');
  });

  it("applies normalizeName in the onBlur handler, not onChange (so users can type freely mid-word)", () => {
    expect(inlineFormSource).toContain('f.type === "name"');
    expect(inlineFormSource).toContain("normalizeName(e.target.value)");
    // onChange only special-cases tel (phone formatting) -- name fields pass through raw keystrokes.
    expect(inlineFormSource).toMatch(/f\.type === "tel" \? formatPhone\(raw\) : raw/);
  });

  it("renders a 'name' field as a plain text input (not an invalid HTML input type)", () => {
    expect(inlineFormSource).toContain('type={f.type === "name" ? "text" : f.type ?? "text"}');
  });
});

describe("EditClientProfileForm -- individual first/last name normalized, business_name never touched", () => {
  it("first_name and last_name use type: name", () => {
    const fieldsBlock = profileFormSource.slice(
      profileFormSource.indexOf("const fields: FieldDef[]"),
      profileFormSource.indexOf("return (")
    );
    expect(fieldsBlock).toMatch(/name:\s*"first_name"[\s\S]*?type:\s*"name"/);
    expect(fieldsBlock).toMatch(/name:\s*"last_name"[\s\S]*?type:\s*"name"/);
  });

  it("business_name field definition has no type: name normalization", () => {
    expect(profileFormSource).toMatch(/name:\s*"business_name",\s*label:\s*entityNameLabel,\s*required:\s*true\s*\}/);
  });
});

describe("AddForms -- sub-Contact first/last name normalized on both Add and Edit", () => {
  it("AddContactForm uses type: name for first_name/last_name", () => {
    const block = addFormsSource.slice(
      addFormsSource.indexOf("export function AddContactForm("),
      addFormsSource.indexOf("export function EditContactForm(")
    );
    expect(block).toMatch(/name:\s*"first_name",\s*label:\s*"First name",\s*type:\s*"name"/);
    expect(block).toMatch(/name:\s*"last_name",\s*label:\s*"Last name",\s*type:\s*"name"/);
  });

  it("EditContactForm uses type: name for first_name/last_name", () => {
    const block = addFormsSource.slice(
      addFormsSource.indexOf("export function EditContactForm("),
      addFormsSource.indexOf("export function AddAddressForm(")
    );
    expect(block).toMatch(/name:\s*"first_name",\s*label:\s*"First name",\s*type:\s*"name"/);
    expect(block).toMatch(/name:\s*"last_name",\s*label:\s*"Last name",\s*type:\s*"name"/);
  });

  it("AddPortalUserForm's invited_name uses type: name", () => {
    const block = addFormsSource.slice(
      addFormsSource.indexOf("export function AddPortalUserForm("),
      addFormsSource.indexOf("invited_email")
    );
    expect(block).toMatch(/name:\s*"invited_name",\s*label:\s*"Name",\s*type:\s*"name"/);
  });
});
