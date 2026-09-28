// Regression coverage for VEREXAHQ CONTACTS PASS 2 (unified Add Contact
// Information control, client_addresses.street2, and the one-primary-
// address-total behavior change). Component-level tests use source-text
// assertion rather than invoking the "use client" components directly --
// AddContactInformationControl/AddEmailForm/AddPhoneForm/AddAddressForm all
// call useRouter()/useState() outside a real render tree, which throws
// ("Invalid hook call") when called as a plain function in a hookless
// vitest run, the same constraint Pass 1's sub-Contact field tests hit.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase/migrations");
const controlSource = readFileSync(join(repoRoot, "app/(app)/clients/[id]/AddContactInformationControl.tsx"), "utf8");
const workspaceTabsSource = readFileSync(join(repoRoot, "app/(app)/clients/[id]/ClientWorkspaceTabs.tsx"), "utf8");
const addFormsSource = readFileSync(join(repoRoot, "app/(app)/clients/[id]/AddForms.tsx"), "utf8");
const channelFormsSource = readFileSync(join(repoRoot, "app/(app)/clients/[id]/ContactChannelForms.tsx"), "utf8");
const inlineFormSource = readFileSync(join(repoRoot, "components/InlineAddForm.tsx"), "utf8");
const primaryAddressMigration = readFileSync(
  join(migrationsDir, "20261031090000_client_addresses_single_primary.sql"),
  "utf8"
);

describe("Unified 'Add Contact Information' control replaces the three separate triggers", () => {
  it("offers exactly the three existing contact-method types, reusing the existing forms", () => {
    expect(controlSource).toContain("Add Contact Information");
    expect(controlSource).toContain('import { AddEmailForm, AddPhoneForm } from "./ContactChannelForms"');
    expect(controlSource).toContain('import { AddAddressForm } from "./AddForms"');
    expect(controlSource).toMatch(/value:\s*"email"/);
    expect(controlSource).toMatch(/value:\s*"phone"/);
    expect(controlSource).toMatch(/value:\s*"address"/);
  });

  it("drives all three existing forms through controlled open/onOpenChange, not a duplicate submit path", () => {
    expect(controlSource).toContain("open={active ===");
    expect(controlSource).toContain("onOpenChange=");
    // No new supabase table/RPC call in the control itself -- it only
    // renders the three existing forms, which own their own submit logic.
    expect(controlSource).not.toContain("supabase.from(");
    expect(controlSource).not.toContain("supabase.rpc(");
  });

  it("the three separate per-section 'Add Email' / 'Add Phone' / 'Add Address' triggers are gone from the Identifying Info section, replaced by the one unified control", () => {
    expect(workspaceTabsSource).toContain("<AddContactInformationControl");
    expect(workspaceTabsSource).not.toMatch(/<AddEmailForm\s/);
    expect(workspaceTabsSource).not.toMatch(/<AddPhoneForm\s/);
    expect(workspaceTabsSource).not.toMatch(/<AddAddressForm\s/);
  });
});

describe("InlineAddForm controlled-open mode", () => {
  it("adds open/onOpenChange as optional props -- uncontrolled (existing) behavior is preserved when omitted", () => {
    expect(inlineFormSource).toContain("open?: boolean");
    expect(inlineFormSource).toContain("onOpenChange?: (open: boolean) => void");
    expect(inlineFormSource).toContain("const isControlled = controlledOpen !== undefined");
  });

  it("renders nothing (no default trigger button) while closed in controlled mode, since an external trigger owns visibility", () => {
    expect(inlineFormSource).toContain("if (isControlled) return null;");
  });
});

describe("AddEmailForm / AddPhoneForm / AddAddressForm forward open/onOpenChange to InlineAddForm", () => {
  it("AddEmailForm accepts and forwards open/onOpenChange", () => {
    const block = channelFormsSource.slice(
      channelFormsSource.indexOf("export function AddEmailForm("),
      channelFormsSource.indexOf("export function SetEmailPrimaryButton(")
    );
    expect(block).toContain("open?: boolean; onOpenChange?: (open: boolean) => void");
    expect(block).toMatch(/<InlineAddForm[\s\S]*?open=\{open\}[\s\S]*?onOpenChange=\{onOpenChange\}/);
  });

  it("AddPhoneForm accepts and forwards open/onOpenChange", () => {
    const block = channelFormsSource.slice(
      channelFormsSource.indexOf("export function AddPhoneForm("),
      channelFormsSource.indexOf("export function SetPhonePrimaryButton(")
    );
    expect(block).toContain("open?: boolean; onOpenChange?: (open: boolean) => void");
    expect(block).toMatch(/<InlineAddForm[\s\S]*?open=\{open\}[\s\S]*?onOpenChange=\{onOpenChange\}/);
  });

  it("AddAddressForm accepts and forwards open/onOpenChange", () => {
    const block = addFormsSource.slice(
      addFormsSource.indexOf("export function AddAddressForm("),
      addFormsSource.indexOf("const ADDRESS_TYPE_OPTIONS")
    );
    expect(block).toContain("open?: boolean; onOpenChange?: (open: boolean) => void");
    expect(block).toMatch(/<InlineAddForm[\s\S]*?open=\{open\}[\s\S]*?onOpenChange=\{onOpenChange\}/);
  });
});

describe("client_addresses.street2 -- structured secondary/unit field", () => {
  it("AddAddressForm submits street2 alongside street without touching street's own value", () => {
    const block = addFormsSource.slice(
      addFormsSource.indexOf("export function AddAddressForm("),
      addFormsSource.indexOf("const ADDRESS_TYPE_OPTIONS")
    );
    expect(block).toMatch(/name:\s*"street2"/);
    expect(block).toContain("street2: v.street2 || null");
    expect(block).toContain("street: v.street"); // street itself is untouched/unrenamed
  });

  it("EditAddressForm carries street2 through initialValues, fields, and the update payload", () => {
    const block = addFormsSource.slice(addFormsSource.indexOf("export function EditAddressForm("));
    expect(block).toMatch(/street2:\s*address\.street2 \?\? ""/);
    expect(block).toMatch(/name:\s*"street2"/);
    expect(block).toContain("street2: v.street2 || null");
  });

  it("the Addresses list displays street2 (when present) alongside street, city, state, and zip", () => {
    expect(workspaceTabsSource).toContain("[a.street, a.street2, a.city,");
  });

  it("AddressRow's type includes street2", () => {
    expect(workspaceTabsSource).toMatch(/export type AddressRow = \{[\s\S]*?street2: string \| null;[\s\S]*?\}/);
  });
});

describe("street2 migration -- additive only, no existing data touched", () => {
  const source = readFileSync(join(migrationsDir, "20261031080000_client_addresses_street2.sql"), "utf8");

  it("adds a nullable column, nothing else", () => {
    expect(source).toContain("alter table public.client_addresses add column if not exists street2 text;");
    expect(source).not.toMatch(/drop |delete |update /i);
  });
});

describe("set_client_address_primary -- one primary address total, not one per address_type", () => {
  it("unsets every other primary address for the client regardless of address_type", () => {
    expect(primaryAddressMigration).toContain(
      "update public.client_addresses set is_primary = false where client_id = v_client_id and is_primary and id <> p_address_id;"
    );
    // The old, superseded per-type predicate must be gone, not just supplemented.
    expect(primaryAddressMigration).not.toContain("and address_type = v_address_type");
  });

  it("preserves the existing permission and workspace-operational checks unchanged", () => {
    expect(primaryAddressMigration).toContain("has_permission(v_workspace_id, 'clients.edit')");
    expect(primaryAddressMigration).toContain("public.is_workspace_operational(v_workspace_id)");
  });

  it("adds a partial unique index enforcing the invariant at the database level too", () => {
    expect(primaryAddressMigration).toContain("create unique index if not exists client_addresses_one_primary_per_client");
    expect(primaryAddressMigration).toContain("on public.client_addresses (client_id)");
    expect(primaryAddressMigration).toContain("where is_primary;");
  });
});
