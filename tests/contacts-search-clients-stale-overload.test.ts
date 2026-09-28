// Regression coverage for VEREXAHQ -- CONTACTS FINAL CLOSEOUT: the
// search_clients stale-overload defect. 20261031000000 added
// p_client_type/p_has_email/p_has_phone via `create or replace function`,
// but Postgres registers a changed argument list as a brand-new function
// identity rather than replacing the old one -- the exact trap this
// codebase already hit and fixed for create_engagement, create_client, and
// set_firm_tax_profile. That left the pre-Phase-1 11-arg search_clients
// live in production alongside the intended 14-arg version, which
// PostgREST's function-overload resolution could pick ambiguously for an
// unfiltered Contacts search. Fixed by
// 20261031050000_drop_stale_search_clients_overload.sql (DROP FUNCTION
// targeting the exact stale positional-type signature).
//
// This file guards two things: (1) the drop migration itself targets the
// exact stale signature, and (2) no migration -- past or future -- ever
// (re)creates a public.search_clients whose parameter list is missing the
// three canonical filter params, which is what would silently resurrect
// this exact bug.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase/migrations");

const STALE_SIGNATURE = "uuid, text, text[], text, uuid, uuid, text, boolean, boolean, integer, integer";

describe("20261031050000_drop_stale_search_clients_overload.sql", () => {
  const source = readFileSync(join(migrationsDir, "20261031050000_drop_stale_search_clients_overload.sql"), "utf8");

  it("drops the exact stale 11-argument identity by position-only types, not just by name", () => {
    expect(source).toMatch(
      /drop function if exists public\.search_clients\(uuid, text, text\[\], text, uuid, uuid, text, boolean, boolean, integer, integer\);/
    );
  });

  it("touches nothing else -- no other DDL statement in this migration", () => {
    const statements = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("--") && line.trim().length > 0);
    expect(statements).toHaveLength(1);
  });
});

describe("public.search_clients -- every definition across all migrations carries the canonical filter params", () => {
  // Extracts every `create or replace function public.search_clients(...)`
  // parameter block across the whole migrations directory. This repo's own
  // convention (confirmed against all 4 existing search_clients migrations)
  // puts each param on its own line with the closing paren alone on its
  // own line, so that's used as the block boundary rather than naive brace
  // matching.
  function extractSearchClientsParamBlocks(source: string): string[] {
    const blocks: string[] = [];
    const startMarker = "create or replace function public.search_clients(";
    let searchFrom = 0;
    while (true) {
      const start = source.indexOf(startMarker, searchFrom);
      if (start === -1) break;
      const bodyStart = start + startMarker.length;
      const closeIndex = source.indexOf("\n)", bodyStart);
      if (closeIndex === -1) break;
      blocks.push(source.slice(bodyStart, closeIndex));
      searchFrom = closeIndex + 1;
    }
    return blocks;
  }

  const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  const allBlocks: { file: string; block: string }[] = [];
  for (const file of migrationFiles) {
    const source = readFileSync(join(migrationsDir, file), "utf8");
    for (const block of extractSearchClientsParamBlocks(source)) {
      allBlocks.push({ file, block });
    }
  }

  it("finds at least one search_clients definition to check (sanity check that the extraction itself works)", () => {
    expect(allBlocks.length).toBeGreaterThan(0);
  });

  it("every search_clients definition in the migration history that postdates the Phase 1 filter migration includes p_client_type, p_has_email, and p_has_phone", () => {
    // Migrations from before 20261031000000 predate the filters and are
    // legitimately missing them (they're superseded, not stale in the
    // bug sense) -- only definitions at or after that point must carry
    // the canonical shape, since a definition at or after that point
    // missing them would BE this exact regression.
    const canonicalOnwards = allBlocks.filter(({ file }) => file >= "20261031000000");
    expect(canonicalOnwards.length).toBeGreaterThan(0);
    for (const { file, block } of canonicalOnwards) {
      expect(block, `${file} is missing p_client_type`).toContain("p_client_type");
      expect(block, `${file} is missing p_has_email`).toContain("p_has_email");
      expect(block, `${file} is missing p_has_phone`).toContain("p_has_phone");
    }
  });

  it("no migration at or after the Phase 1 filter migration defines search_clients with exactly the stale 11-argument shape (the specific signature that was dropped) -- migrations before that point legitimately used it as the then-current definition, not a regression", () => {
    const canonicalOnwards = allBlocks.filter(({ file }) => file >= "20261031000000");
    for (const { file, block } of canonicalOnwards) {
      // Normalize to a comma-separated type-only signature the same way
      // the DROP FUNCTION statement expresses it, so this doesn't drift
      // from what actually matters (the type signature Postgres keys
      // function identity on), not incidental whitespace/param naming.
      const types = block
        .split(",")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((param) => param.replace(/^p_\w+\s+/, "").replace(/\s+default.*$/i, ""))
        .join(", ");
      expect(types, `${file} defines search_clients with the exact stale signature`).not.toBe(STALE_SIGNATURE);
    }
  });
});
