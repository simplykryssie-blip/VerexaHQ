// P16-03 / P16-05; P18-07: the token-only inbound automation webhook
// (app/api/automations/webhook/[token]/route.ts) accepted arbitrary JSON
// with no rate/size control and no event-id dedup. The Zoom and Resend
// inbound webhooks (app/api/zoom/webhook, app/api/resend/webhook) verify
// their signature correctly but never checked timestamp freshness (a
// captured valid request could be replayed forever) and never deduped on
// the provider's own event id (a retried/duplicate delivery reprocessed
// and double-applied its side effects). This generalizes the same
// claim_stripe_webhook_event pattern already proven for Stripe
// (migration stripe_webhook_event_idempotency) across all three, via the
// new claim_provider_webhook_event function (migration
// webhook_replay_dedup_and_zoom_provider).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const state = vi.hoisted(() => ({
  rateLimitOk: true,
  automationByToken: {} as Record<string, { id: string; workspace_id: string } | undefined>,
  claims: new Map<string, { id: string }>(),
  automationRuns: [] as Array<{ id: string; automation_id: string; workspace_id: string }>,
  emailLog: {} as Record<string, { status?: string; open_count?: number; click_count?: number }>,
  zoomConnectionUpdates: [] as string[],
}));

function fakeSupabase() {
  return {
    rpc: vi.fn((name: string, args: Record<string, unknown>) => {
      if (name === "check_rate_limit") {
        return Promise.resolve({ data: state.rateLimitOk, error: null });
      }
      if (name === "claim_provider_webhook_event") {
        const key = `${args.p_provider}:${args.p_event_id}`;
        const existing = state.claims.get(key);
        if (existing) {
          return {
            single: () => Promise.resolve({ data: { id: existing.id, should_process: false }, error: null }),
          };
        }
        const id = `claim-${state.claims.size + 1}`;
        state.claims.set(key, { id });
        return {
          single: () => Promise.resolve({ data: { id, should_process: true }, error: null }),
        };
      }
      if (name === "start_next_automation_step") {
        return Promise.resolve({ data: null, error: null });
      }
      if (name === "find_or_create_public_lead") {
        return Promise.resolve({ data: "client-1", error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }),
    from: (table: string) => {
      if (table === "automations") {
        return {
          select: () => ({
            eq: (col: string, val: string) => {
              const filters: Record<string, string> = { [col]: val };
              const chain = {
                eq: (col2: string, val2: string) => {
                  filters[col2] = val2;
                  return chain;
                },
                maybeSingle: () => {
                  const row = state.automationByToken[filters.webhook_token];
                  if (!row || filters.trigger_type !== "webhook.received") {
                    return Promise.resolve({ data: null, error: null });
                  }
                  return Promise.resolve({ data: row, error: null });
                },
              };
              return chain;
            },
          }),
        };
      }
      if (table === "automation_runs") {
        return {
          insert: (row: { automation_id: string; workspace_id: string }) => ({
            select: () => ({
              maybeSingle: () => {
                const id = `run-${state.automationRuns.length + 1}`;
                state.automationRuns.push({ id, automation_id: row.automation_id, workspace_id: row.workspace_id });
                return Promise.resolve({ data: { id }, error: null });
              },
            }),
          }),
        };
      }
      if (table === "user_zoom_connections") {
        return {
          update: (_vals: unknown) => ({
            eq: (_col: string, val: string) => {
              state.zoomConnectionUpdates.push(val);
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      if (table === "email_log") {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: () => Promise.resolve({ data: state.emailLog[val] ?? null, error: null }),
            }),
          }),
          update: (vals: Record<string, unknown>) => ({
            eq: (_col: string, val: string) => {
              state.emailLog[val] = { ...state.emailLog[val], ...vals };
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      if (table === "webhook_events") {
        return {
          update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
    },
  };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => fakeSupabase() }));

function reset() {
  vi.resetModules();
  state.rateLimitOk = true;
  state.automationByToken = {};
  state.claims.clear();
  state.automationRuns = [];
  state.emailLog = {};
  state.zoomConnectionUpdates = [];
}

// ---------------------------------------------------------------------------
// Automation webhook
// ---------------------------------------------------------------------------
describe("POST /api/automations/webhook/[token] -- rate/size/dedup (P16-03/P16-05/P18-07)", () => {
  beforeEach(reset);

  function makeRequest(token: string, body: unknown, headers: Record<string, string> = {}) {
    return new Request(`https://app.example.test/api/automations/webhook/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  it("authorized: a valid token for a published webhook.received automation starts a run", async () => {
    state.automationByToken["tok-a"] = { id: "auto-1", workspace_id: "ws-a" };
    const { POST } = await import("@/app/api/automations/webhook/[token]/route");
    const res = await POST(makeRequest("tok-a", { foo: "bar" }), { params: Promise.resolve({ token: "tok-a" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.run_id).toBeDefined();
    expect(state.automationRuns).toHaveLength(1);
  });

  it("cross-tenant: a token only ever resolves its own automation/workspace, never a different one", async () => {
    state.automationByToken["tok-a"] = { id: "auto-1", workspace_id: "ws-a" };
    state.automationByToken["tok-b"] = { id: "auto-2", workspace_id: "ws-b" };
    const { POST } = await import("@/app/api/automations/webhook/[token]/route");
    await POST(makeRequest("tok-a", {}), { params: Promise.resolve({ token: "tok-a" }) });
    expect(state.automationRuns[0].workspace_id).toBe("ws-a");
    expect(state.automationRuns[0].automation_id).toBe("auto-1");
  });

  it("unauthorized: an unknown/forged token is rejected and never starts a run", async () => {
    const { POST } = await import("@/app/api/automations/webhook/[token]/route");
    const res = await POST(makeRequest("forged-token", {}), { params: Promise.resolve({ token: "forged-token" }) });
    expect(res.status).toBe(404);
    expect(state.automationRuns).toHaveLength(0);
  });

  it("rate limited: too many requests for the same token are rejected before any DB mutation", async () => {
    state.automationByToken["tok-a"] = { id: "auto-1", workspace_id: "ws-a" };
    state.rateLimitOk = false;
    const { POST } = await import("@/app/api/automations/webhook/[token]/route");
    const res = await POST(makeRequest("tok-a", {}), { params: Promise.resolve({ token: "tok-a" }) });
    expect(res.status).toBe(429);
    expect(state.automationRuns).toHaveLength(0);
  });

  it("oversized payload is rejected before parsing or mutation", async () => {
    state.automationByToken["tok-a"] = { id: "auto-1", workspace_id: "ws-a" };
    const { POST } = await import("@/app/api/automations/webhook/[token]/route");
    const hugeBody = { data: "x".repeat(300 * 1024) };
    const res = await POST(makeRequest("tok-a", hugeBody), { params: Promise.resolve({ token: "tok-a" }) });
    expect(res.status).toBe(413);
    expect(state.automationRuns).toHaveLength(0);
  });

  it("malformed JSON is rejected", async () => {
    state.automationByToken["tok-a"] = { id: "auto-1", workspace_id: "ws-a" };
    const { POST } = await import("@/app/api/automations/webhook/[token]/route");
    const req = new Request("https://app.example.test/api/automations/webhook/tok-a", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });
    const res = await POST(req, { params: Promise.resolve({ token: "tok-a" }) });
    expect(res.status).toBe(400);
  });

  it("replay: a duplicate delivery with the same caller-supplied event id does not start a second run", async () => {
    state.automationByToken["tok-a"] = { id: "auto-1", workspace_id: "ws-a" };
    const { POST } = await import("@/app/api/automations/webhook/[token]/route");
    const headers = { "x-webhook-event-id": "evt-123" };
    const res1 = await POST(makeRequest("tok-a", { foo: "bar" }, headers), { params: Promise.resolve({ token: "tok-a" }) });
    const res2 = await POST(makeRequest("tok-a", { foo: "bar" }, headers), { params: Promise.resolve({ token: "tok-a" }) });
    expect(res1.status).toBe(200);
    expect((await res1.json()).run_id).toBeDefined();
    expect(res2.status).toBe(200);
    expect((await res2.json()).duplicate).toBe(true);
    expect(state.automationRuns).toHaveLength(1);
  });

  it("without a supplied event id, dedup is skipped and existing behavior is unchanged (each call starts a run)", async () => {
    state.automationByToken["tok-a"] = { id: "auto-1", workspace_id: "ws-a" };
    const { POST } = await import("@/app/api/automations/webhook/[token]/route");
    await POST(makeRequest("tok-a", { foo: "bar" }), { params: Promise.resolve({ token: "tok-a" }) });
    await POST(makeRequest("tok-a", { foo: "bar" }), { params: Promise.resolve({ token: "tok-a" }) });
    expect(state.automationRuns).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Zoom webhook
// ---------------------------------------------------------------------------
describe("POST /api/zoom/webhook -- signature freshness & replay (P16-03/P16-05/P18-07)", () => {
  const secret = "test-zoom-secret";

  beforeEach(() => {
    reset();
    process.env.ZOOM_WEBHOOK_SECRET_TOKEN = secret;
  });

  function sign(rawBody: string, timestamp: string) {
    return `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  }

  function makeRequest(rawBody: string, timestamp: string, signature: string) {
    return new Request("https://app.example.test/api/zoom/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-zm-request-timestamp": timestamp, "x-zm-signature": signature },
      body: rawBody,
    });
  }

  it("authorized: a validly signed, fresh app_deauthorized event revokes the connection", async () => {
    const timestamp = String(Date.now());
    const body = JSON.stringify({ event: "app_deauthorized", payload: { user_id: "zoom-user-1" } });
    const { POST } = await import("@/app/api/zoom/webhook/route");
    const res = await POST(makeRequest(body, timestamp, sign(body, timestamp)));
    expect(res.status).toBe(200);
    expect(state.zoomConnectionUpdates).toEqual(["zoom-user-1"]);
  });

  it("unauthorized: an invalid signature is rejected and never reaches the mutation", async () => {
    const timestamp = String(Date.now());
    const body = JSON.stringify({ event: "app_deauthorized", payload: { user_id: "zoom-user-1" } });
    const { POST } = await import("@/app/api/zoom/webhook/route");
    const res = await POST(makeRequest(body, timestamp, "v0=deadbeef"));
    expect(res.status).toBe(401);
    expect(state.zoomConnectionUpdates).toHaveLength(0);
  });

  it("replay: a stale (but validly signed) timestamp is rejected and never reaches the mutation", async () => {
    const staleTimestamp = String(Date.now() - 10 * 60 * 1000); // 10 minutes old
    const body = JSON.stringify({ event: "app_deauthorized", payload: { user_id: "zoom-user-1" } });
    const { POST } = await import("@/app/api/zoom/webhook/route");
    const res = await POST(makeRequest(body, staleTimestamp, sign(body, staleTimestamp)));
    expect(res.status).toBe(401);
    expect(state.zoomConnectionUpdates).toHaveLength(0);
  });

  it("replay: a duplicate delivery of the exact same (valid, fresh) event+timestamp is deduped, not reprocessed", async () => {
    const timestamp = String(Date.now());
    const body = JSON.stringify({ event: "app_deauthorized", payload: { user_id: "zoom-user-1" } });
    const signature = sign(body, timestamp);
    const { POST } = await import("@/app/api/zoom/webhook/route");
    const res1 = await POST(makeRequest(body, timestamp, signature));
    const res2 = await POST(makeRequest(body, timestamp, signature));
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect((await res2.json()).duplicate).toBe(true);
    expect(state.zoomConnectionUpdates).toEqual(["zoom-user-1"]); // only once
  });

  it("the endpoint.url_validation CRC handshake is unaffected and needs no dedup", async () => {
    const timestamp = String(Date.now());
    const body = JSON.stringify({ event: "endpoint.url_validation", payload: { plainToken: "abc123" } });
    const { POST } = await import("@/app/api/zoom/webhook/route");
    const res = await POST(makeRequest(body, timestamp, sign(body, timestamp)));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.plainToken).toBe("abc123");
    expect(json.encryptedToken).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Resend webhook
// ---------------------------------------------------------------------------
describe("POST /api/resend/webhook -- signature freshness & replay (P16-03/P16-05/P18-07)", () => {
  const secret = "whsec_" + Buffer.from("test-resend-secret-bytes").toString("base64");

  beforeEach(() => {
    reset();
    process.env.RESEND_WEBHOOK_SECRET = secret;
  });

  function sign(svixId: string, svixTimestamp: string, payload: string) {
    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
    const sig = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
    return `v1,${sig}`;
  }

  function makeRequest(payload: string, svixId: string, svixTimestamp: string, svixSignature: string) {
    return new Request("https://app.example.test/api/resend/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      },
      body: payload,
    });
  }

  it("authorized: a validly signed, fresh email.delivered event updates email_log", async () => {
    const svixId = "msg_1";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "email-1" } });
    const { POST } = await import("@/app/api/resend/webhook/route");
    const res = await POST(makeRequest(payload, svixId, svixTimestamp, sign(svixId, svixTimestamp, payload)));
    expect(res.status).toBe(200);
    expect(state.emailLog["email-1"]?.status).toBe("delivered");
  });

  it("unauthorized: an invalid signature is rejected and never reaches email_log", async () => {
    const svixId = "msg_2";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "email-2" } });
    const { POST } = await import("@/app/api/resend/webhook/route");
    const res = await POST(makeRequest(payload, svixId, svixTimestamp, "v1,bm90YXJlYWxzaWc="));
    expect(res.status).toBe(400);
    expect(state.emailLog["email-2"]).toBeUndefined();
  });

  it("replay: a stale (but validly signed) timestamp is rejected and never reaches email_log", async () => {
    const svixId = "msg_3";
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 10 * 60); // 10 minutes old
    const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "email-3" } });
    const { POST } = await import("@/app/api/resend/webhook/route");
    const res = await POST(makeRequest(payload, svixId, staleTimestamp, sign(svixId, staleTimestamp, payload)));
    expect(res.status).toBe(400);
    expect(state.emailLog["email-3"]).toBeUndefined();
  });

  it("replay: a duplicate delivery of the same event does not double-increment open_count", async () => {
    const svixId = "msg_4";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const payload = JSON.stringify({ type: "email.opened", data: { email_id: "email-4" } });
    const signature = sign(svixId, svixTimestamp, payload);
    const { POST } = await import("@/app/api/resend/webhook/route");
    const res1 = await POST(makeRequest(payload, svixId, svixTimestamp, signature));
    const res2 = await POST(makeRequest(payload, svixId, svixTimestamp, signature));
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect((await res2.json()).duplicate).toBe(true);
    expect(state.emailLog["email-4"]?.open_count).toBe(1); // not 2
  });

  it("dedup falls back to svix-id when the event carries no email_id", async () => {
    const svixId = "msg_5";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const payload = JSON.stringify({ type: "some.other.event", data: {} });
    const signature = sign(svixId, svixTimestamp, payload);
    const { POST } = await import("@/app/api/resend/webhook/route");
    const res1 = await POST(makeRequest(payload, svixId, svixTimestamp, signature));
    const res2 = await POST(makeRequest(payload, svixId, svixTimestamp, signature));
    expect(res1.status).toBe(200);
    expect((await res1.json()).duplicate).toBeUndefined();
    expect((await res2.json()).duplicate).toBe(true);
  });
});
