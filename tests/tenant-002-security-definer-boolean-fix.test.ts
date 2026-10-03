// TENANT-002: source-level checks against the DB-side migration, mirroring
// this repo's existing convention for asserting migration SQL content (see
// tests/aal2-migration.test.ts) rather than requiring a live database
// connection this sandbox doesn't have.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const migration = readFileSync(join(migrationsDir, "20261103120000_tenant_002_security_definer_boolean_disclosure.sql"), "utf8");

describe("TENANT-002 migration: is_notification_enabled() loses authenticated RPC access", () => {
  it("revokes EXECUTE from authenticated, leaving service_role (its only real caller) untouched", () => {
    expect(migration).toMatch(/revoke execute on function public\.is_notification_enabled\(uuid, uuid, text, text\) from authenticated;/);
  });

  it("does not touch the function's own definition -- every real caller is an internal SQL trigger/RPC, not the authenticated PostgREST role", () => {
    expect(migration).not.toMatch(/create or replace function public\.is_notification_enabled/);
  });
});

describe("TENANT-002 migration: is_workspace_ghl_connected() workspace-membership guard", () => {
  function fnBody(): string {
    const start = migration.indexOf("create or replace function public.is_workspace_ghl_connected");
    const end = migration.indexOf("$function$;", start);
    expect(start).toBeGreaterThan(-1);
    return migration.slice(start, end);
  }

  it("checks is_workspace_member(p_workspace_id) before the connection lookup, not after", () => {
    const body = fnBody();
    const guardIndex = body.indexOf("public.is_workspace_member(p_workspace_id)");
    const queryIndex = body.indexOf("workspace_ghl_connections");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(queryIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(queryIndex);
  });

  it("raises an exception rather than returning false on failure (fail closed, not silently wrong)", () => {
    expect(fnBody()).toMatch(/if not public\.is_workspace_member\(p_workspace_id\) then\s*\n\s*raise exception/);
  });

  it("preserves the same table and column used by the original query", () => {
    expect(fnBody()).toMatch(/select 1 from public\.workspace_ghl_connections where workspace_id = p_workspace_id/);
  });

  it("stays SECURITY DEFINER with the same single uuid parameter, so no grant or call-site change is needed", () => {
    expect(migration).toMatch(/create or replace function public\.is_workspace_ghl_connected\(p_workspace_id uuid\)\s*\nreturns boolean\s*\nlanguage plpgsql\s*\nsecurity definer/);
  });
});

describe("TENANT-002 migration: is_workspace_jotform_connected() workspace-membership guard", () => {
  function fnBody(): string {
    const start = migration.indexOf("create or replace function public.is_workspace_jotform_connected");
    const end = migration.indexOf("$function$;", start);
    expect(start).toBeGreaterThan(-1);
    return migration.slice(start, end);
  }

  it("checks is_workspace_member(p_workspace_id) before the connection lookup, not after", () => {
    const body = fnBody();
    const guardIndex = body.indexOf("public.is_workspace_member(p_workspace_id)");
    const queryIndex = body.indexOf("workspace_jotform_connections");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(queryIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(queryIndex);
  });

  it("raises an exception rather than returning false on failure (fail closed, not silently wrong)", () => {
    expect(fnBody()).toMatch(/if not public\.is_workspace_member\(p_workspace_id\) then\s*\n\s*raise exception/);
  });

  it("preserves the same table and column used by the original query", () => {
    expect(fnBody()).toMatch(/select 1 from public\.workspace_jotform_connections where workspace_id = p_workspace_id/);
  });

  it("stays SECURITY DEFINER with the same single uuid parameter, so no grant or call-site change is needed", () => {
    expect(migration).toMatch(/create or replace function public\.is_workspace_jotform_connected\(p_workspace_id uuid\)\s*\nreturns boolean\s*\nlanguage plpgsql\s*\nsecurity definer/);
  });
});

describe("TENANT-002 migration: scope discipline", () => {
  it("touches none of the four other functions/tables this fix must not alter", () => {
    expect(migration).not.toMatch(/create or replace function public\.search_clients/);
    expect(migration).not.toMatch(/create or replace function public\.notify_workspace_admins/);
    expect(migration).not.toMatch(/alter table/i);
    expect(migration).not.toMatch(/drop policy|create policy/i);
  });
});
