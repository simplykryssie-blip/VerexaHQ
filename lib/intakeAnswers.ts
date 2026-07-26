// Small, dependency-free helpers for editing the nested "answers" object
// the intake wizard's expanded sections write into (spouse, dependents,
// per-income-type detail, deductions, life changes, etc). Every write goes
// through setDeep so components never mutate state in place.
export type AnyRecord = Record<string, unknown>;

export function getDeep(obj: AnyRecord, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as AnyRecord)[key];
  }
  return cur;
}

export function setDeep(obj: AnyRecord, path: string[], value: unknown): AnyRecord {
  if (path.length === 0) return obj;
  const [head, ...rest] = path;
  const existing = obj[head];
  const nextChild =
    rest.length === 0
      ? value
      : setDeep(existing && typeof existing === "object" && !Array.isArray(existing) ? { ...(existing as AnyRecord) } : {}, rest, value);
  return { ...obj, [head]: nextChild };
}

export function getBool(obj: AnyRecord, path: string[]): boolean {
  return getDeep(obj, path) === true;
}

export function getStr(obj: AnyRecord, path: string[]): string {
  const v = getDeep(obj, path);
  return typeof v === "string" ? v : "";
}

export function getArray<T = unknown>(obj: AnyRecord, path: string[]): T[] {
  const v = getDeep(obj, path);
  return Array.isArray(v) ? (v as T[]) : [];
}
