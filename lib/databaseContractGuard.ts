// Pure policy layer for the database contract guard (see
// tests/database-contract-guard.test.ts and supabase/migrations/
// 20260925000000_database_contract_guard.sql). The SQL side is a stable
// set of facts about the live database's SECURITY DEFINER surface; this
// module is where those facts get compared against the checked-in
// baseline (tests/fixtures/database-contract-baseline.json) to decide
// what's expected, what's a signature change worth a human's attention,
// and what's the exact authorization-drift pattern that produced the
// phone-number vulnerability and SD-1. Kept separate from the SQL and
// from the test file itself so the rule logic can be exercised directly
// with synthetic rows, without needing a live database.

export type ContractGuardRow = {
  function_name: string;
  args: string;
  overload_count: number;
  is_security_definer: boolean;
  authenticated_exec: boolean;
  anon_exec: boolean;
  service_role_exec: boolean;
  is_mutation: boolean;
  has_identifier_arg: boolean;
  has_recognized_auth: boolean;
  has_token_lookup: boolean;
};

export type ContractGuardBaseline = {
  serviceOnlyFunctions: { names: string[] };
  acceptedOverloads: Record<string, number>;
  acceptedPublicFunctions: { entries: Record<string, string> };
  trackedSignatures: { functions: Record<string, { args: string; isSecurityDefiner: boolean }> };
};

export type ContractGuardFinding = {
  severity: "fail" | "review";
  functionName: string;
  message: string;
};

export type ContractGuardResult = {
  findings: ContractGuardFinding[];
  failures: ContractGuardFinding[];
  reviews: ContractGuardFinding[];
};

/**
 * Every function this project has already had to reason carefully about
 * a security boundary for must never show authenticated/anon EXECUTE.
 * This is the exact regression class behind both confirmed vulnerabilities.
 */
function checkServiceOnlyFunctions(rows: ContractGuardRow[], baseline: ContractGuardBaseline): ContractGuardFinding[] {
  const findings: ContractGuardFinding[] = [];
  for (const name of baseline.serviceOnlyFunctions.names) {
    const row = rows.find((r) => r.function_name === name);
    if (!row) continue; // absent from the result set means no risky grant/overload at all -- fine
    if (row.authenticated_exec) {
      findings.push({
        severity: "fail",
        functionName: name,
        message: `${name} must be service_role-only but authenticated now has EXECUTE. This is the exact grant-drift pattern that caused the phone-number vulnerability and SD-1.`,
      });
    }
    if (row.anon_exec) {
      findings.push({
        severity: "fail",
        functionName: name,
        message: `${name} must be service_role-only but anon now has EXECUTE.`,
      });
    }
  }
  return findings;
}

/**
 * Any function with more than one live signature that isn't an already-
 * reviewed, accepted overload (with a matching count) is unexpected --
 * usually a CREATE FUNCTION with a changed arg list instead of a true
 * replacement, leaving a stale signature live.
 */
function checkOverloads(rows: ContractGuardRow[], baseline: ContractGuardBaseline): ContractGuardFinding[] {
  const findings: ContractGuardFinding[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.overload_count <= 1 || seen.has(row.function_name)) continue;
    seen.add(row.function_name);
    const accepted = baseline.acceptedOverloads[row.function_name];
    if (accepted === undefined) {
      findings.push({
        severity: "fail",
        functionName: row.function_name,
        message: `${row.function_name} has ${row.overload_count} live signatures but no overload is accepted in the baseline. Review whether this is a stale signature left behind by a migration that should have replaced it.`,
      });
    } else if (accepted !== row.overload_count) {
      findings.push({
        severity: "fail",
        functionName: row.function_name,
        message: `${row.function_name} has ${row.overload_count} live signatures; baseline accepts ${accepted}. Overload count changed -- review and update the baseline if intentional.`,
      });
    }
  }
  return findings;
}

/**
 * The high-risk-new-function pattern: SECURITY DEFINER, authenticated or
 * anon executable, mutates data, accepts a workspace/resource identifier,
 * and neither a recognized authorization predicate call nor a token-
 * lookup pattern was found in the body. Not proof of a vulnerability --
 * a function can be safe for reasons this heuristic can't see (e.g.
 * capture_public_lead_from_site_page derives its scope from a resource
 * lookup, not an identity check) -- so anything already reviewed and
 * listed in acceptedPublicFunctions or serviceOnlyFunctions is exempt.
 * Everything else in this shape must be looked at by a person.
 */
function checkHighRiskNewFunctions(rows: ContractGuardRow[], baseline: ContractGuardBaseline): ContractGuardFinding[] {
  const findings: ContractGuardFinding[] = [];
  const serviceOnly = new Set(baseline.serviceOnlyFunctions.names);
  const acceptedPublic = new Set(Object.keys(baseline.acceptedPublicFunctions.entries));
  for (const row of rows) {
    if (!row.is_security_definer) continue;
    if (!(row.authenticated_exec || row.anon_exec)) continue;
    if (!row.is_mutation) continue;
    if (!row.has_identifier_arg) continue;
    if (row.has_recognized_auth || row.has_token_lookup) continue;
    if (serviceOnly.has(row.function_name)) continue; // already flagged by checkServiceOnlyFunctions
    if (acceptedPublic.has(row.function_name)) continue;
    findings.push({
      severity: "fail",
      functionName: row.function_name,
      message: `${row.function_name}(${row.args}) is SECURITY DEFINER, ${row.authenticated_exec ? "authenticated" : "anon"}-executable, mutates data, accepts a resource identifier, and no recognized authorization predicate or token lookup was found in its body. This is the exact shape of the phone-number vulnerability and SD-1 -- review before merging, and add it to the baseline's acceptedPublicFunctions (with a reason) if it is genuinely safe.`,
    });
  }
  return findings;
}

/**
 * Signature/SECURITY DEFINER drift on the curated tracked-function list.
 * A change here isn't automatically wrong -- it's a REVIEW REQUIRED
 * signal, since legitimate signature changes happen. The exception is a
 * SECURITY DEFINER -> SECURITY INVOKER (or reverse) flip, which is
 * flagged as a hard failure: that specific change silently alters
 * whether the function bypasses RLS, and should never happen by accident.
 */
function checkTrackedSignatures(rows: ContractGuardRow[], baseline: ContractGuardBaseline): ContractGuardFinding[] {
  const findings: ContractGuardFinding[] = [];
  for (const [name, expected] of Object.entries(baseline.trackedSignatures.functions)) {
    const row = rows.find((r) => r.function_name === name);
    if (!row) {
      findings.push({
        severity: "review",
        functionName: name,
        message: `${name} is tracked in the baseline but was not returned by the guard query at all (it may have been dropped, or renamed). Review required.`,
      });
      continue;
    }
    if (row.is_security_definer !== expected.isSecurityDefiner) {
      findings.push({
        severity: "fail",
        functionName: name,
        message: `${name} changed from SECURITY ${expected.isSecurityDefiner ? "DEFINER" : "INVOKER"} to SECURITY ${row.is_security_definer ? "DEFINER" : "INVOKER"}. This changes whether the function bypasses RLS -- review required before this is accepted.`,
      });
    }
    if (row.args !== expected.args) {
      findings.push({
        severity: "review",
        functionName: name,
        message: `${name} signature changed: baseline expects "${expected.args}", live is "${row.args}". Not necessarily wrong -- update the baseline in this PR if the change is intentional.`,
      });
    }
  }
  return findings;
}

export function evaluateContractGuard(rows: ContractGuardRow[], baseline: ContractGuardBaseline): ContractGuardResult {
  const findings = [
    ...checkServiceOnlyFunctions(rows, baseline),
    ...checkOverloads(rows, baseline),
    ...checkHighRiskNewFunctions(rows, baseline),
    ...checkTrackedSignatures(rows, baseline),
  ];
  return {
    findings,
    failures: findings.filter((f) => f.severity === "fail"),
    reviews: findings.filter((f) => f.severity === "review"),
  };
}
