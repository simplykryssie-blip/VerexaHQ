// Minimal safe arithmetic evaluator for form_calculations.expression. Supports
// + - * / and parentheses over field_key identifiers and numeric literals —
// deliberately not `eval`/`Function` since expressions can reference
// workspace-authored template content.
type Token = { type: "num"; value: number } | { type: "ident"; value: string } | { type: "op"; value: string };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      tokens.push({ type: "num", value: Number(expr.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[a-zA-Z0-9_]/.test(expr[j])) j++;
      tokens.push({ type: "ident", value: expr.slice(i, j) });
      i = j;
      continue;
    }
    // Unknown character — skip rather than throw, since template content is
    // workspace-authored and shouldn't be able to crash the client fill page.
    i++;
  }
  return tokens;
}

function parse(tokens: Token[], scope: Record<string, number>): number {
  let pos = 0;

  function peek() {
    return tokens[pos];
  }
  function next() {
    return tokens[pos++];
  }

  function parseExpr(): number {
    let value = parseTerm();
    while (peek() && peek().type === "op" && (peek().value === "+" || peek().value === "-")) {
      const op = next() as { type: "op"; value: string };
      const rhs = parseTerm();
      value = op.value === "+" ? value + rhs : value - rhs;
    }
    return value;
  }
  function parseTerm(): number {
    let value = parseFactor();
    while (peek() && peek().type === "op" && (peek().value === "*" || peek().value === "/")) {
      const op = next() as { type: "op"; value: string };
      const rhs = parseFactor();
      value = op.value === "*" ? value * rhs : rhs === 0 ? 0 : value / rhs;
    }
    return value;
  }
  function parseFactor(): number {
    const tok = peek();
    if (!tok) return 0;
    if (tok.type === "op" && tok.value === "(") {
      next();
      const value = parseExpr();
      if (peek() && peek().value === ")") next();
      return value;
    }
    if (tok.type === "op" && tok.value === "-") {
      next();
      return -parseFactor();
    }
    if (tok.type === "num") {
      next();
      return tok.value;
    }
    if (tok.type === "ident") {
      next();
      return Number(scope[tok.value] ?? 0);
    }
    next();
    return 0;
  }

  if (tokens.length === 0) return 0;
  return parseExpr();
}

export function evaluateCalculation(expression: string, scope: Record<string, unknown>, roundingScale?: number | null): number {
  const numericScope: Record<string, number> = {};
  for (const [key, value] of Object.entries(scope)) {
    const n = Number(value);
    numericScope[key] = Number.isFinite(n) ? n : 0;
  }
  let result = 0;
  try {
    result = parse(tokenize(expression), numericScope);
  } catch {
    result = 0;
  }
  if (typeof roundingScale === "number") {
    const factor = 10 ** roundingScale;
    result = Math.round(result * factor) / factor;
  }
  return result;
}
