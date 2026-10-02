// VEREXA-AAL-001: source-level checks against the DB-side migration,
// mirroring this repo's existing convention for asserting migration SQL
// content (e.g. tests/contact-sharing-schema.test.ts) rather than requiring
// a live database connection this sandbox doesn't have.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const migration = readFileSync(join(migrationsDir, "20261103000000_aal2_enforcement.sql"), "utf8");

describe("VEREXA-AAL-001 migration: has_aal2()", () => {
  it("defines has_aal2() reading the auth.jwt() aal claim, mirroring has_permission()/is_workspace_admin()'s own shape", () => {
    expect(migration).toMatch(/create or replace function public\.has_aal2\(\)/);
    expect(migration).toMatch(/stable security definer/i);
    expect(migration).toMatch(/set search_path to 'public'/);
    expect(migration).toMatch(/auth\.jwt\(\)->>'aal'/);
  });

  it("revokes has_aal2() from public/anon and grants only to authenticated -- same hardening as reveal_my_ptin() itself", () => {
    expect(migration).toMatch(/revoke all on function public\.has_aal2\(\) from public, anon;/);
    expect(migration).toMatch(/grant execute on function public\.has_aal2\(\) to authenticated;/);
  });
});

describe("VEREXA-AAL-001 migration: reveal_my_ptin() guard", () => {
  it("checks has_aal2() before decrypting the PTIN, not after", () => {
    const fnStart = migration.indexOf("create or replace function public.reveal_my_ptin()");
    const fnBody = migration.slice(fnStart);
    const guardIndex = fnBody.indexOf("public.has_aal2()");
    const decryptIndex = fnBody.indexOf("decrypt_firm_secret");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(decryptIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(decryptIndex);
  });

  it("raises an exception rather than returning null/empty on failure (fail closed)", () => {
    const fnStart = migration.indexOf("create or replace function public.reveal_my_ptin()");
    const fnBody = migration.slice(fnStart, migration.indexOf("$function$;", fnStart));
    expect(fnBody).toMatch(/if not public\.has_aal2\(\) then\s*\n\s*raise exception/);
  });

  it("preserves the existing auth.uid() scoping and audit_log insert unchanged", () => {
    expect(migration).toMatch(/where id = auth\.uid\(\)/);
    expect(migration).toMatch(/insert into public\.audit_log/);
    expect(migration).toMatch(/'reveal_ptin', 'warning'/);
  });
});

describe("VEREXA-AAL-001 migration: workspace_security_policies left unchanged", () => {
  it("does not modify workspace_security_policies RLS -- the bootstrap/chicken-and-egg problem is documented, not worked around", () => {
    expect(migration).not.toMatch(/drop policy.*workspace_security_policies/i);
    expect(migration).not.toMatch(/create policy.*workspace_security_policies/i);
  });
});
