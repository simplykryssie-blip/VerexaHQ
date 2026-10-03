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
  it("revokes EXECUTE from authenticated, and only from authenticated", () => {
    const stmt = migration.match(/revoke execute on function public\.is_notification_enabled\([^)]*\) from ([^;]+);/);
    expect(stmt).not.toBeNull();
    const revokedFrom = stmt![1].split(",").map((r) => r.trim());
    expect(revokedFrom).toEqual(["authenticated"]);
  });

  it("targets the function's real, live identity arguments (uuid, uuid, text, text) -- confirmed against the connected production database (daxpavvsotvsyqqntddc) immediately before writing this migration, so the REVOKE resolves to the actual function instead of failing to find a match or silently targeting a different overload", () => {
    expect(migration).toMatch(/revoke execute on function public\.is_notification_enabled\(uuid, uuid, text, text\) from authenticated;/);
  });

  it("service-role/internal execution remains available: the REVOKE statement names only `authenticated` (asserted above), no separate SQL statement revokes from service_role anywhere in this file, and the function's own SECURITY DEFINER body is left untouched", () => {
    // Strip comment lines first -- this file's own prose mentions
    // "revoke" and "service_role" in explanatory text, which must not be
    // mistaken for actual SQL statements.
    const sqlOnly = migration
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    const revokeStatements = sqlOnly.match(/revoke[^;]*;/gi) ?? [];
    expect(revokeStatements.length).toBeGreaterThan(0);
    for (const stmt of revokeStatements) {
      expect(stmt.toLowerCase()).not.toContain("service_role");
    }
    expect(migration).not.toMatch(/create or replace function public\.is_notification_enabled/);
  });

  it("does not alter the function's business logic -- no CREATE OR REPLACE / ALTER FUNCTION statement for it exists anywhere in this migration, only the REVOKE", () => {
    expect(migration).not.toMatch(/(create or replace function|alter function)\s+public\.is_notification_enabled/i);
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

  // No live database is available in this sandbox (the credential-gated
  // suites in tests/database-contract-guard.test.ts and
  // tests/critical-paths.test.ts fail the same way, with the same
  // documented limitation, on every run here) -- so "same-workspace
  // allowed" / "cross-workspace rejected" can't be proven by actually
  // calling the function as two different users. What CAN be proven from
  // source alone, and is proven by the two assertions below together, is
  // the full control-flow shape: the ENTIRE function body is exactly
  // "if not is_workspace_member(...) then raise exception ... end if;
  // return exists(...);" with nothing else in between or around it. Given
  // that shape, is_workspace_member(p_workspace_id) = true unconditionally
  // skips the raise and falls through to the return (same-workspace
  // allowed), and = false unconditionally raises before the return is ever
  // reached, since a raised exception aborts the function immediately
  // (cross-workspace rejected) -- these are the only two possible paths.
  it("allows same-workspace access: when is_workspace_member(p_workspace_id) is true, the only other statement in the function is the existence check, with nothing else gating it", () => {
    const body = fnBody();
    const canonical =
      /begin\s*\n\s*if not public\.is_workspace_member\(p_workspace_id\) then\s*\n\s*raise exception '(?:[^']|'')*';\s*\n\s*end if;\s*\n\s*return exists \(select 1 from public\.workspace_ghl_connections where workspace_id = p_workspace_id\);\s*\n\s*end;/;
    expect(body).toMatch(canonical);
  });

  it("rejects cross-workspace access: when is_workspace_member(p_workspace_id) is false, RAISE EXCEPTION is unconditional inside that branch, so control never reaches the RETURN", () => {
    const body = fnBody();
    const thenIndex = body.indexOf("if not public.is_workspace_member(p_workspace_id) then") + "if not public.is_workspace_member(p_workspace_id) then".length;
    const endIfIndex = body.indexOf("end if;", thenIndex);
    const branchBody = body.slice(thenIndex, endIfIndex);
    // The branch taken when NOT a member contains only the raise -- no
    // conditional around it that could skip it, and no return inside it
    // that could race the exception.
    expect(branchBody).toMatch(/raise exception/);
    expect(branchBody).not.toMatch(/\bif\b/); // no nested condition guarding the raise
    expect(branchBody).not.toMatch(/\breturn\b/); // the raise is the branch's only effect
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

  // Same reasoning and same documented live-database limitation as the GHL
  // block above: this proves the control-flow shape from source, not a
  // live two-tenant execution.
  it("allows same-workspace access: when is_workspace_member(p_workspace_id) is true, the only other statement in the function is the existence check, with nothing else gating it", () => {
    const body = fnBody();
    const canonical =
      /begin\s*\n\s*if not public\.is_workspace_member\(p_workspace_id\) then\s*\n\s*raise exception '(?:[^']|'')*';\s*\n\s*end if;\s*\n\s*return exists \(select 1 from public\.workspace_jotform_connections where workspace_id = p_workspace_id\);\s*\n\s*end;/;
    expect(body).toMatch(canonical);
  });

  it("rejects cross-workspace access: when is_workspace_member(p_workspace_id) is false, RAISE EXCEPTION is unconditional inside that branch, so control never reaches the RETURN", () => {
    const body = fnBody();
    const thenIndex = body.indexOf("if not public.is_workspace_member(p_workspace_id) then") + "if not public.is_workspace_member(p_workspace_id) then".length;
    const endIfIndex = body.indexOf("end if;", thenIndex);
    const branchBody = body.slice(thenIndex, endIfIndex);
    expect(branchBody).toMatch(/raise exception/);
    expect(branchBody).not.toMatch(/\bif\b/);
    expect(branchBody).not.toMatch(/\breturn\b/);
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
