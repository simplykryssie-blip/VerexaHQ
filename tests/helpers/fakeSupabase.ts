// A minimal stand-in for the real @supabase/supabase-js client, for tests
// that need to exercise real page/data-loading code (which calls
// supabase.from(table)...various chained filters...) without a live
// database. Every chain method just returns the same builder (matching the
// real PostgrestFilterBuilder's fluent API), and the builder itself is
// thenable so `await supabase.from(x).select(...).eq(...)` resolves without
// a terminal call, exactly like the real client.
//
// Fixtures are keyed by table/rpc name; any table or rpc not explicitly
// configured resolves to an empty-but-valid result ({ data: [], count: 0,
// error: null }) -- which conveniently doubles as the "no related records"
// condition by default, so a test only needs to configure the handful of
// tables it actually cares about.

export type FixtureResult = { data: unknown; count?: number | null; error?: unknown };

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "delete",
  "eq",
  "neq",
  "is",
  "in",
  "not",
  "or",
  "contains",
  "order",
  "range",
  "limit",
  "gte",
  "lte",
  "match",
] as const;

function buildQueryBuilder(result: FixtureResult) {
  const resolved: FixtureResult = { data: result.data, count: result.count ?? null, error: result.error ?? null };
  const builder: Record<string, unknown> = {};
  for (const method of CHAIN_METHODS) {
    builder[method] = () => builder;
  }
  // .single()/.maybeSingle() degenerate a list-shaped fixture (the common
  // case -- most fixtures are configured as arrays) into its first row or
  // null, matching what Postgrest actually returns for those calls instead
  // of leaking the raw array through as a truthy, shapeless "row".
  const singleResult: FixtureResult = Array.isArray(resolved.data)
    ? { ...resolved, data: resolved.data[0] ?? null }
    : resolved;
  builder.maybeSingle = () => Promise.resolve(singleResult);
  builder.single = () => Promise.resolve(singleResult);
  // Makes the builder itself awaitable, matching the real client -- most of
  // this codebase's queries end a chain with plain filter calls (no
  // .single()/.maybeSingle()) and just `await` the chain directly.
  builder.then = (onFulfilled: (v: FixtureResult) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(resolved).then(onFulfilled, onRejected);
  return builder;
}

export function createFakeSupabase(options: {
  tables?: Record<string, FixtureResult>;
  rpcs?: Record<string, FixtureResult>;
  user?: { id: string } | null;
}) {
  const tables = options.tables ?? {};
  const rpcs = options.rpcs ?? {};
  const user = options.user ?? { id: "staff-user-1" };

  return {
    from(table: string) {
      return buildQueryBuilder(tables[table] ?? { data: [], count: 0, error: null });
    },
    rpc(name: string, _args?: Record<string, unknown>) {
      const fixture = rpcs[name] ?? { data: null, error: null };
      return Promise.resolve(fixture);
    },
    auth: {
      getUser: () => Promise.resolve({ data: { user }, error: null }),
    },
    storage: {
      from() {
        return {
          download: () => Promise.resolve({ data: null, error: new Error("storage not mocked in tests") }),
          upload: () => Promise.resolve({ data: null, error: new Error("storage not mocked in tests") }),
        };
      },
    },
  };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;
