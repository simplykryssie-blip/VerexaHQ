// P15-DB-001: 660 migration files had only 624 unique version prefixes --
// 33 collision groups, up to 3 files sharing one prefix, 36 surplus files.
// Nothing in this repo actually applies migrations by replaying this
// directory in filename order (no supabase/config.toml, no CI step runs
// `supabase db push`/`migration up`; every migration in this project's
// history was applied via one-off tool calls, and the production ledger's
// version column is server-generated at apply time, not derived from the
// filename -- confirmed directly against the live ledger). So a collision
// carries no current production-application risk, but it is a real hazard
// for anyone who ever does bootstrap a fresh environment with the standard
// Supabase CLI (duplicate version prefixes there error or sort
// non-deterministically) and for anyone reasoning about migration order by
// filename, as this entire engagement repeatedly has.
//
// Remediated by pure `git mv` renames (zero content changes, verified via
// `git diff --stat` showing 0 insertions/deletions across all 36 renamed
// files) -- colliding files were disambiguated by nudging every file but
// the earliest-committed one in each group forward by whole seconds within
// its original timestamp slot, ordered by actual git commit history (the
// most defensible available signal for real authorship order). A
// cross-reference check confirmed no file in any collision group defines a
// table/function/view/type that another file in the same group references,
// so reordering within a group cannot introduce a definition-before-use
// break. This test guards against the collision recurring.
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

function prefix(filename: string): string {
  const match = filename.match(/^(\d+)_/);
  if (!match) {
    throw new Error(`Migration file does not start with a numeric version prefix: ${filename}`);
  }
  return match[1];
}

describe("migration filename version prefixes (P15-DB-001)", () => {
  it("every migration file has a numeric version prefix", () => {
    for (const f of files) {
      expect(() => prefix(f)).not.toThrow();
    }
  });

  it("no two migration files share the same version prefix", () => {
    const seen = new Map<string, string[]>();
    for (const f of files) {
      const p = prefix(f);
      const list = seen.get(p) ?? [];
      list.push(f);
      seen.set(p, list);
    }

    const collisions = [...seen.entries()].filter(([, fs]) => fs.length > 1);
    if (collisions.length > 0) {
      const detail = collisions.map(([p, fs]) => `  ${p}: ${fs.join(", ")}`).join("\n");
      throw new Error(`Found ${collisions.length} migration version-prefix collision(s):\n${detail}`);
    }
    expect(collisions).toEqual([]);
  });

  it("has at least the expected number of migration files (sanity floor, not a brittle exact count)", () => {
    // Guards against this test silently running against an empty/wrong
    // directory rather than ever meaningfully failing.
    expect(files.length).toBeGreaterThan(600);
  });
});
