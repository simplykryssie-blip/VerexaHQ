import * as dns from "node:dns";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";

// VEREXA SSRF: centralized outbound-request guard for any feature that
// fetches a URL supplied by a workspace user. The security boundary is the
// actual outbound TCP connection, not the hostname string: a hostname that
// resolves to a public address today can resolve to an internal/loopback
// address on the next lookup (DNS rebinding), so every destination is
// resolved and IP-checked here, and the real connection is pinned to the
// exact address that was checked via Node's `lookup` socket option -- the
// global `fetch()` API has no equivalent pinning hook, which is why this
// uses http.request/https.request directly instead.
//
// This file independently backs two call sites with different response
// needs: a status-only outbound webhook POST (automation delivery, no body
// needed) and a GET whose response body must actually be read (a banner
// image fetched for PDF embedding). `safeFetch` covers the first; the
// `*Buffer` variants cover the second, adding a hard response-size cap on
// top of the same destination/redirect validation -- see
// lib/documents/fetchImageBytesSafe.ts for that consumer.
export class BlockedDestinationError extends Error {
  constructor(message = "Request blocked: destination not allowed") {
    super(message);
    this.name = "BlockedDestinationError";
  }
}

// Thrown (never leaked to a caller's error message) when a response body
// exceeds the caller's configured byte cap, whether that was knowable
// upfront from Content-Length or only discovered mid-stream.
export class ResponseTooLargeError extends Error {
  constructor(message = "Response exceeded the maximum allowed size") {
    super(message);
    this.name = "ResponseTooLargeError";
  }
}

export type ResolvedAddress = { address: string; family: 4 | 6 };
export type LookupAllFn = (hostname: string) => Promise<ResolvedAddress[]>;

// Numeric (not string-prefix) range checks so "10.1.2.3" and "10.254.254.254"
// are both caught the same way a real router would classify them.
export function isUnsafeIPv4(address: string): boolean {
  const parts = address.split(".");
  if (parts.length !== 4) return true;
  const octets = parts.map((part) => Number(part));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = octets;

  if (a === 0) return true; // 0.0.0.0/8 -- "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 shared/CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. 169.254.169.254 cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224 && a <= 239) return true; // 224.0.0.0/4 multicast
  if (a >= 240) return true; // 240.0.0.0/4 reserved + 255.255.255.255 broadcast

  return false;
}

function parseIPv6Groups(address: string): number[] | null {
  const zoneIdx = address.indexOf("%");
  const addr = zoneIdx === -1 ? address : address.slice(0, zoneIdx);

  let head = addr;
  let embeddedIPv4: number[] | null = null;
  const lastColon = addr.lastIndexOf(":");
  const tail = lastColon === -1 ? "" : addr.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = tail.split(".").map((part) => Number(part));
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    embeddedIPv4 = v4;
    head = `${addr.slice(0, lastColon + 1)}0:0`;
  }

  let groups: string[];
  const doubleColonIdx = head.indexOf("::");
  if (doubleColonIdx !== -1) {
    const left = head
      .slice(0, doubleColonIdx)
      .split(":")
      .filter((g) => g.length > 0);
    const right = head
      .slice(doubleColonIdx + 2)
      .split(":")
      .filter((g) => g.length > 0);
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    groups = [...left, ...Array(missing).fill("0"), ...right];
  } else {
    groups = head.split(":");
  }
  if (groups.length !== 8) return null;

  const nums = groups.map((g) => parseInt(g, 16));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;

  if (embeddedIPv4) {
    nums[6] = (embeddedIPv4[0] << 8) | embeddedIPv4[1];
    nums[7] = (embeddedIPv4[2] << 8) | embeddedIPv4[3];
  }
  return nums;
}

export function isUnsafeIPv6(address: string): boolean {
  const g = parseIPv6Groups(address);
  if (!g) return true; // unparseable -- fail closed

  const allZero = (from: number, to: number) => g.slice(from, to).every((v) => v === 0);

  if (allZero(0, 7) && g[7] === 1) return true; // ::1 loopback
  if (allZero(0, 8)) return true; // :: unspecified

  // ::ffff:0:0/96 -- IPv4-mapped; defer to the embedded address's own rules.
  if (allZero(0, 5) && g[5] === 0xffff) {
    const a = (g[6] >> 8) & 0xff;
    const b = g[6] & 0xff;
    const c = (g[7] >> 8) & 0xff;
    const d = g[7] & 0xff;
    return isUnsafeIPv4(`${a}.${b}.${c}.${d}`);
  }

  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // 2001:db8::/32 documentation-only

  return false;
}

export const defaultLookupAll: LookupAllFn = async (hostname) => {
  const literalFamily = net.isIP(hostname);
  if (literalFamily === 4) return [{ address: hostname, family: 4 }];
  if (literalFamily === 6) return [{ address: hostname, family: 6 }];

  const [v4, v6] = await Promise.allSettled([dns.promises.resolve4(hostname), dns.promises.resolve6(hostname)]);
  const addresses: ResolvedAddress[] = [];
  if (v4.status === "fulfilled") addresses.push(...v4.value.map((address) => ({ address, family: 4 as const })));
  if (v6.status === "fulfilled") addresses.push(...v6.value.map((address) => ({ address, family: 6 as const })));
  if (addresses.length === 0) throw new Error(`DNS resolution failed for ${hostname}`);
  return addresses;
};

type PinnedRequestOptions = {
  protocol: "http:" | "https:";
  hostname: string;
  port: number;
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  pinnedAddress: string;
  pinnedFamily: 4 | 6;
  timeoutMs: number;
  signal?: AbortSignal;
};

type RequestResult = { status: number; headers: http.IncomingHttpHeaders };

function startPinnedRequest<TResult extends RequestResult>(
  opts: PinnedRequestOptions,
  onResponse: (res: http.IncomingMessage, settle: { resolve: (r: TResult) => void; reject: (e: Error) => void }) => void
): Promise<TResult> {
  return new Promise<TResult>((resolve, reject) => {
    const transport = opts.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        protocol: opts.protocol,
        // hostname/port/path/headers here all come from the original URL --
        // Node derives the Host header (and, for https, the TLS SNI
        // servername) from `hostname`, never from the resolved IP. The
        // `lookup` override below is what actually redirects the TCP
        // connection to the pre-validated address, so the host the browser
        // or server "sees" and the address we connect to are decoupled from
        // each other in exactly the way DNS rebinding depends on.
        hostname: opts.hostname,
        port: opts.port,
        path: opts.path,
        method: opts.method,
        headers: opts.headers,
        timeout: opts.timeoutMs,
        lookup: (_hostname: string, _options: unknown, callback: (err: Error | null, address: string, family: number) => void) => {
          callback(null, opts.pinnedAddress, opts.pinnedFamily);
        },
      },
      (res) => onResponse(res, { resolve, reject })
    );

    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);

    if (opts.signal) {
      if (opts.signal.aborted) {
        req.destroy(new Error("Request aborted"));
      } else {
        opts.signal.addEventListener("abort", () => req.destroy(new Error("Request aborted")), { once: true });
      }
    }

    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// Status-only variant for delivery bookkeeping (automation webhooks): the
// response body is never needed, so it's drained and discarded rather than
// buffered.
export function issueRequestNode(opts: PinnedRequestOptions): Promise<RequestResult> {
  return startPinnedRequest<RequestResult>(opts, (res, { resolve, reject }) => {
    res.resume();
    res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
    res.on("error", reject);
  });
}

type BufferedRequestOptions = PinnedRequestOptions & { maxBodyBytes: number };
type BufferedRequestResult = RequestResult & { body: Buffer };

// Body-returning variant for content that must actually be read (a banner
// image). Enforces a hard byte cap both from a declared Content-Length
// (reject before reading any body bytes) and while streaming (reject the
// moment received bytes exceed the cap, regardless of what Content-Length
// claimed or whether it was present at all) -- so a chunked or
// length-lying response can never be buffered past the limit.
export function issueRequestNodeBuffered(opts: BufferedRequestOptions): Promise<BufferedRequestResult> {
  return startPinnedRequest<BufferedRequestResult>(opts, (res, { resolve, reject }) => {
    const declaredLength = res.headers["content-length"] ? Number(res.headers["content-length"]) : null;
    if (declaredLength !== null && Number.isFinite(declaredLength) && declaredLength > opts.maxBodyBytes) {
      res.destroy();
      reject(new ResponseTooLargeError());
      return;
    }

    const chunks: Buffer[] = [];
    let received = 0;
    let rejected = false;
    res.on("data", (chunk: Buffer) => {
      if (rejected) return;
      received += chunk.length;
      if (received > opts.maxBodyBytes) {
        rejected = true;
        res.destroy();
        reject(new ResponseTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    res.on("end", () => {
      if (rejected) return;
      resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) });
    });
    res.on("error", (err) => {
      if (!rejected) reject(err);
    });
  });
}

export type SafeFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRedirects?: number;
};

export type SafeFetchResult = { ok: boolean; status: number };

export type SafeFetchDeps = {
  lookupAll?: LookupAllFn;
  issueRequest?: typeof issueRequestNode;
};

const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 15000;

function isSafeAddress(addr: ResolvedAddress): boolean {
  return addr.family === 4 ? !isUnsafeIPv4(addr.address) : !isUnsafeIPv6(addr.address);
}

async function resolveAndValidate(hostname: string, lookupAll: LookupAllFn): Promise<ResolvedAddress> {
  let addresses: ResolvedAddress[];
  try {
    addresses = await lookupAll(hostname);
  } catch {
    throw new BlockedDestinationError();
  }
  if (addresses.length === 0) throw new BlockedDestinationError();
  // If DNS returns several answers and even one is unsafe, the hostname is
  // not a trustworthy destination -- a later connection (ours or anyone
  // else's resolver cache) could land on the unsafe answer, so the whole
  // name is rejected rather than cherry-picking the first safe-looking one.
  for (const addr of addresses) {
    if (!isSafeAddress(addr)) throw new BlockedDestinationError();
  }
  return addresses[0];
}

function assertRequestableUrl(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new BlockedDestinationError();
  if (url.username || url.password) throw new BlockedDestinationError();
  if (!url.hostname) throw new BlockedDestinationError();
}

// Shared resolve-validate-connect-redirect loop. `issue` performs the one
// actual pinned request for the current hop and returns at minimum
// {status, headers}; the loop inspects only those two fields to decide
// whether to follow a redirect, so it works unchanged whether `issue`
// also returns a body (safeFetchBuffer) or not (safeFetch).
async function runSafeRequestLoop<TResult extends RequestResult>(
  rawUrl: string,
  init: SafeFetchInit,
  lookupAll: LookupAllFn,
  issue: (opts: PinnedRequestOptions) => Promise<TResult>
): Promise<TResult> {
  const maxRedirects = init.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const method = init.method ?? "GET";
  const body = init.body;

  let currentUrl: URL;
  try {
    currentUrl = new URL(rawUrl);
  } catch {
    throw new BlockedDestinationError();
  }

  const visited = new Set<string>();
  let redirectCount = 0;

  while (true) {
    assertRequestableUrl(currentUrl);

    const normalized = currentUrl.toString();
    if (visited.has(normalized)) throw new BlockedDestinationError();
    visited.add(normalized);

    const pinned = await resolveAndValidate(currentUrl.hostname, lookupAll);
    const port = currentUrl.port ? Number(currentUrl.port) : currentUrl.protocol === "https:" ? 443 : 80;
    const path = `${currentUrl.pathname}${currentUrl.search}`;

    const result = await issue({
      protocol: currentUrl.protocol as "http:" | "https:",
      hostname: currentUrl.hostname,
      port,
      path,
      method,
      headers: init.headers ?? {},
      body,
      pinnedAddress: pinned.address,
      pinnedFamily: pinned.family,
      timeoutMs,
      signal: init.signal,
    });

    const location = result.headers.location;
    const isRedirect = result.status >= 300 && result.status < 400 && typeof location !== "undefined";
    if (!isRedirect) return result;

    redirectCount++;
    if (redirectCount > maxRedirects) throw new BlockedDestinationError();

    const locationValue = Array.isArray(location) ? location[0] : location;
    try {
      currentUrl = new URL(locationValue, currentUrl);
    } catch {
      throw new BlockedDestinationError();
    }
  }
}

// Fetches `rawUrl` only after resolving it to a concrete IP and confirming
// that IP is not loopback/private/link-local/multicast/metadata, then pins
// the actual connection to that exact IP. Redirects are followed manually
// (never via fetch's automatic redirect-following) with the same
// resolve-then-validate-then-pin treatment applied to every hop, a loop
// guard, and a fixed hop limit -- so a redirect can never be used to reach a
// destination the direct URL itself wouldn't have been allowed to reach.
// Status-only: used for delivery bookkeeping where the response body is
// never needed. For a caller that must read the body, use safeFetchBuffer.
export async function safeFetch(rawUrl: string, init: SafeFetchInit = {}, deps: SafeFetchDeps = {}): Promise<SafeFetchResult> {
  const lookupAll = deps.lookupAll ?? defaultLookupAll;
  const issueRequest = deps.issueRequest ?? issueRequestNode;
  const result = await runSafeRequestLoop(rawUrl, init, lookupAll, issueRequest);
  return { ok: result.status >= 200 && result.status < 300, status: result.status };
}

export type SafeFetchBufferInit = SafeFetchInit & { maxBodyBytes?: number };
export type SafeFetchBufferResult = { ok: boolean; status: number; body: Buffer };
export type SafeFetchBufferDeps = {
  lookupAll?: LookupAllFn;
  issueRequest?: typeof issueRequestNodeBuffered;
};

// A letterhead/banner image is a small decorative graphic scaled to at most
// ~90pt tall in the rendered PDF (lib/pdf/textPdf.ts's headerImage) -- a
// legitimate upload is realistically well under 1MB. 8MB gives generous
// headroom for an unusually large source image while still giving a hard,
// known bound on memory used per request, regardless of what an
// attacker-chosen destination claims or streams.
export const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;

// Same destination/redirect protection as safeFetch, but actually returns
// the response body -- bounded by maxBodyBytes (checked against a declared
// Content-Length upfront, and again against actual bytes received while
// streaming, so neither a truthful large Content-Length nor a lying/absent
// one can defeat the cap). Never buffers past the limit.
export async function safeFetchBuffer(
  rawUrl: string,
  init: SafeFetchBufferInit = {},
  deps: SafeFetchBufferDeps = {}
): Promise<SafeFetchBufferResult> {
  const lookupAll = deps.lookupAll ?? defaultLookupAll;
  const issueRequest = deps.issueRequest ?? issueRequestNodeBuffered;
  const maxBodyBytes = init.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  const result = await runSafeRequestLoop(rawUrl, init, lookupAll, (opts) => issueRequest({ ...opts, maxBodyBytes }));
  return { ok: result.status >= 200 && result.status < 300, status: result.status, body: result.body };
}
