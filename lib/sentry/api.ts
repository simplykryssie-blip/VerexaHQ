import { isSentryApiConfigured } from "@/lib/providerStatus";

const SENTRY_API = "https://sentry.io/api/0";

export type SentryResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export type SentryIssue = {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  level: string;
  status: string;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
};

function token() {
  return process.env.SENTRY_API_TOKEN || process.env.SENTRY_AUTH_TOKEN;
}

function notConfigured<T>(): SentryResult<T> {
  return { ok: false, reason: "Sentry API access is not configured for this environment." };
}

async function errorReason(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.detail ?? `Sentry responded with ${res.status}`;
}

/**
 * Recent issues (error groups) for the configured Sentry project, newest
 * first. Defaults to unresolved issues from the last 24h -- the same window
 * that matters for "is something actively breaking right now."
 */
export async function fetchRecentSentryIssues(opts?: { query?: string; statsPeriod?: string; limit?: number }): Promise<SentryResult<SentryIssue[]>> {
  if (!isSentryApiConfigured()) return notConfigured();

  const org = process.env.SENTRY_ORG!;
  const project = process.env.SENTRY_PROJECT!;
  const query = opts?.query ?? "is:unresolved";
  const statsPeriod = opts?.statsPeriod ?? "24h";
  const limit = opts?.limit ?? 25;

  const url = new URL(`${SENTRY_API}/projects/${org}/${project}/issues/`);
  url.searchParams.set("query", query);
  url.searchParams.set("statsPeriod", statsPeriod);
  url.searchParams.set("sort", "date");
  url.searchParams.set("limit", String(limit));

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "Couldn't reach Sentry's API." };
  }

  if (!res.ok) return { ok: false, reason: await errorReason(res) };

  const data = (await res.json()) as SentryIssue[];
  return { ok: true, data };
}
