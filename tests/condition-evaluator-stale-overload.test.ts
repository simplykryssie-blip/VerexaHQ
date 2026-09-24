// Regression coverage for a confirmed 6th occurrence of the changed-
// argument-list-without-a-drop overload trap (after create_engagement,
// create_client, set_firm_tax_profile, and search_clients).
//
// 20260916195308_partner_automation_conditions_and_actions.sql made
// p_connection_id/p_onboarding_id canonical on _evaluate_condition_list
// (needed to resolve partner_onboarding-scoped condition fields like
// package_purchase.package_name). 20260927050000_decision_step.sql later
// redefines the function with the OLD 5-arg signature and no accompanying
// DROP FUNCTION for the 7-arg version -- Postgres registers a changed
// argument list as a brand-new function identity, not a replacement.
//
// Confirmed live in production (2026-09-24): exactly ONE
// _evaluate_condition_list overload exists -- the correct 7-arg one --
// because 20260927050000 was never actually applied there (absent from
// supabase_migrations.schema_migrations). This is therefore a
// migration-history hygiene issue (a fresh replay of this migrations
// directory, e.g. a new environment, would introduce the stale overload
// production doesn't have), not a live bug. Fixed by
// 20261031060000_drop_stale_evaluate_condition_list_overload.sql, a safe
// no-op against current production.
//
// This file guards two things: (1) the drop migration itself targets the
// exact stale signature, and (2) no migration -- past or future -- at or
// after the point p_connection_id/p_onboarding_id became canonical ever
// (re)creates a public._evaluate_condition_list missing them, which is
// what would silently resurrect this exact bug.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase/migrations");

const STALE_SIGNATURE = "jsonb, jsonb, uuid, uuid, uuid";
const CANONICAL_ONWARDS_CUTOFF = "20260916195308";

describe("20261031060000_drop_stale_evaluate_condition_list_overload.sql", () => {
  const source = readFileSync(
    join(migrationsDir, "20261031060000_drop_stale_evaluate_condition_list_overload.sql"),
    "utf8"
  );

  it("drops the exact stale 5-argument identity by position-only types, not just by name", () => {
    expect(source).toMatch(/drop function if exists public\._evaluate_condition_list\(jsonb, jsonb, uuid, uuid, uuid\);/);
  });

  it("touches nothing else -- no other DDL statement in this migration", () => {
    const statements = source.split("\n").filter((line) => !line.trim().startsWith("--") && line.trim().length > 0);
    expect(statements).toHaveLength(1);
  });
});

describe("public._evaluate_condition_list -- every definition at or after the partner-identity cutover carries p_connection_id/p_onboarding_id", () => {
  // Anchored on "function public._evaluate_condition_list(" (not just the
  // bare function name) so this only ever matches real `create (or
  // replace) function` definitions, never the function's own recursive
  // self-calls elsewhere in its body (e.g. `v_group_result :=
  // public._evaluate_condition_list(...)`), which have no "function"
  // keyword immediately before the name. Uses balanced-paren counting
  // rather than assuming a lone closing-paren line, since this function's
  // signature is sometimes written all on one line (e.g.
  // 20260927050000_decision_step.sql) and sometimes one param per line.
  function extractParamBlocks(source: string): string[] {
    const blocks: string[] = [];
    const startMarker = "function public._evaluate_condition_list(";
    let searchFrom = 0;
    while (true) {
      const start = source.indexOf(startMarker, searchFrom);
      if (start === -1) break;
      const bodyStart = start + startMarker.length;
      let depth = 1;
      let i = bodyStart;
      for (; i < source.length && depth > 0; i++) {
        if (source[i] === "(") depth++;
        else if (source[i] === ")") depth--;
      }
      if (depth !== 0) break;
      const closeIndex = i - 1;
      blocks.push(source.slice(bodyStart, closeIndex));
      searchFrom = closeIndex + 1;
    }
    return blocks;
  }

  const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  const allBlocks: { file: string; block: string }[] = [];
  for (const file of migrationFiles) {
    const source = readFileSync(join(migrationsDir, file), "utf8");
    for (const block of extractParamBlocks(source)) {
      allBlocks.push({ file, block });
    }
  }

  it("finds at least one _evaluate_condition_list definition to check (sanity check that the extraction itself works)", () => {
    expect(allBlocks.length).toBeGreaterThan(0);
  });

  function normalizeToTypes(block: string): string {
    return block
      .split(",")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((param) => param.replace(/^p_\w+\s+/, "").replace(/\s+default.*$/i, ""))
      .join(", ");
  }

  it("every definition at or after the partner-identity cutover either includes p_connection_id/p_onboarding_id, or -- if it doesn't (a stale-shaped definition) -- is neutralized by a DROP FUNCTION targeting that exact signature in a same-or-later-sorting migration", () => {
    // 20260927050000_decision_step.sql permanently contains the stale
    // 5-arg shape in its own source text (it was never applied to
    // production and its text is not rewritten -- see this repo's own
    // Migration Reconciliation precedent for when historical file content
    // is corrected vs. left as-is and neutralized by a later migration).
    // The invariant that actually matters -- and that would still catch a
    // brand-new future regression of this exact kind -- isn't "the stale
    // shape's text never appears again," it's "wherever it does appear,
    // a same-or-later DROP FUNCTION for that exact signature exists,"
    // which is what this checks.
    const canonicalOnwards = allBlocks.filter(({ file }) => file >= CANONICAL_ONWARDS_CUTOFF);
    expect(canonicalOnwards.length).toBeGreaterThan(0);

    const dropFiles = migrationFiles.filter((file) => {
      const source = readFileSync(join(migrationsDir, file), "utf8");
      return new RegExp(
        `drop function if exists public\\._evaluate_condition_list\\(${STALE_SIGNATURE.replace(/[[\]]/g, "\\$&")}\\);`
      ).test(source);
    });

    for (const { file, block } of canonicalOnwards) {
      const hasCanonicalParams = block.includes("p_connection_id") && block.includes("p_onboarding_id");
      if (hasCanonicalParams) continue;

      expect(normalizeToTypes(block), `${file} has a non-canonical, non-stale shape -- unexpected`).toBe(STALE_SIGNATURE);
      const neutralizedByLaterDrop = dropFiles.some((dropFile) => dropFile >= file);
      expect(
        neutralizedByLaterDrop,
        `${file} defines the stale 5-argument _evaluate_condition_list with no same-or-later DROP FUNCTION neutralizing it`
      ).toBe(true);
    }
  });
});
