// Phase 6J-2 -- /partner-dashboard/onboarding server page. Mirrors the
// existing tests/clients-page.test.ts pattern (this repo has no
// component-rendering test setup, so a server page is exercised by calling
// its exported function directly and inspecting the returned element
// tree) -- and goes one step further where it matters: walking the tree to
// confirm the exact props a security/correctness-sensitive state receives,
// not just "did it throw".
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FixtureResult } from "./helpers/fakeSupabase";

const WORKSPACE_FIXTURE = { id: "workspace-partner-1", name: "Child Workspace", slug: "child-workspace", workspace_type: "independent_ptin" };

const CONNECTION_FIXTURE = {
  connection_id: "connection-1",
  ero_workspace_id: "parent-workspace-1",
  name: "Parent ERO",
  relationship_type: "ero_ptin",
  package_name: null,
  revenue_share_percent: null,
  revenue_share_scope: null,
  primary_contact_email: null,
  phone: null,
  bank_partner_name: null,
  software_partner_name: null,
};

const DOCUMENT_REQUEST_FIXTURE = {
  id: "request-1",
  title: "W-9",
  due_date: null,
  status: "open",
  created_at: "2026-01-01T00:00:00Z",
  items: [{ id: "item-1", name: "Signed W-9", is_required: true, status: "pending", category: null, due_date: null }],
};

function baseOnboarding(overrides: Record<string, unknown> = {}) {
  return {
    id: "onboarding-1",
    status: "in_progress",
    agreement_required: true,
    documents_required: true,
    training_required: false,
    bank_software_setup_required: false,
    application_submitted_at: null,
    agreement_signed: false,
    documents_completed: false,
    training_completed_at: null,
    bank_software_setup_completed_at: null,
    review_note: null,
    rejected_reason: null,
    created_at: "2026-01-01T00:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

const state = vi.hoisted(() => ({ supabase: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => state.supabase,
}));
vi.mock("@/lib/workspace", () => ({
  getCurrentWorkspace: () => Promise.resolve(WORKSPACE_FIXTURE),
}));

function setSupabase(tables: Record<string, FixtureResult> = {}, rpcs: Record<string, FixtureResult> = {}) {
  state.supabase = createFakeSupabase({ tables, rpcs });
}

// React elements are plain objects ({ type, props }) -- walkable without a
// renderer. Finds the first element whose `type` function/name matches.
function findElement(node: unknown, predicate: (type: unknown) => boolean): { type: unknown; props: Record<string, unknown> } | null {
  if (node == null || typeof node !== "object") return null;
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type !== undefined && predicate(el.type)) return el as { type: unknown; props: Record<string, unknown> };
  const children = el.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
  } else if (children) {
    const found = findElement(children, predicate);
    if (found) return found;
  }
  return null;
}

function typeNamed(name: string) {
  return (type: unknown) => typeof type === "function" && (type as { name?: string }).name === name;
}

beforeEach(() => {
  vi.resetModules();
});

describe("/partner-dashboard/onboarding page", () => {
  it("shows the not-connected empty state when there is no parent connection", async () => {
    setSupabase({}, { get_my_ero_connection: { data: [] } });
    const { default: Page } = await import("@/app/(app)/partner-dashboard/onboarding/page");
    const result = await Page();
    expect(result).toBeTruthy();
    const empty = findElement(result, typeNamed("EmptyState"));
    expect(empty?.props.message).toMatch(/not connected/i);
  });

  it("shows the not-started informational state when connected but no onboarding record exists, and offers no start control", async () => {
    setSupabase({}, { get_my_ero_connection: { data: [CONNECTION_FIXTURE] }, get_my_partner_onboarding: { data: [] } });
    const { default: Page } = await import("@/app/(app)/partner-dashboard/onboarding/page");
    const result = await Page();
    const empty = findElement(result, typeNamed("EmptyState"));
    expect(empty?.props.message).toMatch(/has not been started yet/i);
    expect(empty?.props.message).toContain("Parent ERO");
    // The empty state for "no onboarding" must never carry an action --
    // that would be a Start Onboarding control, which partner-initiated
    // onboarding explicitly forbids.
    expect(empty?.props.action).toBeUndefined();
  });

  for (const status of ["pending", "in_progress", "under_review", "setup", "ready", "rejected", "withdrawn"]) {
    it(`renders without throwing when onboarding status is ${status}`, async () => {
      setSupabase(
        { partner_onboardings: { data: [{ application_data: { legal_business_name: "Test Co" } }] } },
        { get_my_ero_connection: { data: [CONNECTION_FIXTURE] }, get_my_partner_onboarding: { data: [baseOnboarding({ status })] } }
      );
      const { default: Page } = await import("@/app/(app)/partner-dashboard/onboarding/page");
      await expect(Page()).resolves.toBeTruthy();
    });
  }

  it("passes the review_note through to the application component when info was requested (status stays in_progress)", async () => {
    setSupabase(
      { partner_onboardings: { data: [{ application_data: {} }] } },
      {
        get_my_ero_connection: { data: [CONNECTION_FIXTURE] },
        get_my_partner_onboarding: { data: [baseOnboarding({ status: "in_progress", review_note: "Please clarify your PTIN status" })] },
      }
    );
    const { default: Page } = await import("@/app/(app)/partner-dashboard/onboarding/page");
    const result = await Page();
    const app = findElement(result, typeNamed("PartnerOnboardingApplication"));
    expect(app?.props.status).toBe("in_progress");
    expect(app?.props.reviewNote).toBe("Please clarify your PTIN status");
  });

  it("passes the rejected_reason through when status is rejected", async () => {
    setSupabase(
      { partner_onboardings: { data: [{ application_data: {} }] } },
      {
        get_my_ero_connection: { data: [CONNECTION_FIXTURE] },
        get_my_partner_onboarding: { data: [baseOnboarding({ status: "rejected", rejected_reason: "Not a fit at this time" })] },
      }
    );
    const { default: Page } = await import("@/app/(app)/partner-dashboard/onboarding/page");
    const result = await Page();
    const app = findElement(result, typeNamed("PartnerOnboardingApplication"));
    expect(app?.props.status).toBe("rejected");
    expect(app?.props.rejectedReason).toBe("Not a fit at this time");
  });

  it("passes setup readiness fields through unmodified when status is setup", async () => {
    setSupabase(
      { partner_onboardings: { data: [{ application_data: {} }] } },
      {
        get_my_ero_connection: { data: [CONNECTION_FIXTURE] },
        get_my_partner_onboarding: {
          data: [
            baseOnboarding({
              status: "setup",
              training_required: true,
              training_completed_at: null,
              bank_software_setup_required: true,
              bank_software_setup_completed_at: "2026-02-01T00:00:00Z",
            }),
          ],
        },
      }
    );
    const { default: Page } = await import("@/app/(app)/partner-dashboard/onboarding/page");
    const result = await Page();
    const app = findElement(result, typeNamed("PartnerOnboardingApplication"));
    expect(app?.props.trainingRequired).toBe(true);
    expect(app?.props.trainingCompletedAt).toBeNull();
    expect(app?.props.bankSoftwareSetupRequired).toBe(true);
    expect(app?.props.bankSoftwareSetupCompletedAt).toBe("2026-02-01T00:00:00Z");
  });

  it("prepopulates from application_data read directly from partner_onboardings by the RPC-resolved id", async () => {
    setSupabase(
      { partner_onboardings: { data: [{ application_data: { legal_business_name: "Prefilled Co" } }] } },
      { get_my_ero_connection: { data: [CONNECTION_FIXTURE] }, get_my_partner_onboarding: { data: [baseOnboarding({ status: "in_progress" })] } }
    );
    const { default: Page } = await import("@/app/(app)/partner-dashboard/onboarding/page");
    const result = await Page();
    const app = findElement(result, typeNamed("PartnerOnboardingApplication"));
    expect((app?.props.applicationData as Record<string, unknown> | null)?.legal_business_name).toBe("Prefilled Co");
  });

  // Phase 6J-3: agreement token lookup and document-request fetch, gated
  // correctly on required/signed/status so a signed or closed onboarding
  // never triggers a needless (or, for rejected/withdrawn, forbidden-by-
  // policy-intent) new lookup.
  it("looks up an agreement token and passes it through when the agreement is required but not yet signed", async () => {
    setSupabase(
      { partner_onboardings: { data: [{ application_data: {} }] } },
      {
        get_my_ero_connection: { data: [CONNECTION_FIXTURE] },
        get_my_partner_onboarding: { data: [baseOnboarding({ status: "in_progress", agreement_required: true, agreement_signed: false })] },
        get_my_partner_onboarding_agreement_token: { data: "tok_abc123" },
      }
    );
    const { default: Page } = await import("@/app/(app)/partner-dashboard/onboarding/page");
    const result = await Page();
    const app = findElement(result, typeNamed("PartnerOnboardingApplication"));
    expect(app?.props.agreementRequired).toBe(true);
    expect(app?.props.agreementSigned).toBe(false);
    expect(app?.props.agreementToken).toBe("tok_abc123");
  });

  it("does not look up an agreement token once the agreement is already signed", async () => {
    let tokenRpcCalled = false;
    setSupabase(
      { partner_onboardings: { data: [{ application_data: {} }] } },
      {
        get_my_ero_connection: { data: [CONNECTION_FIXTURE] },
        get_my_partner_onboarding: { data: [baseOnboarding({ status: "setup", agreement_required: true, agreement_signed: true })] },
      }
    );
    const original = (state.supabase as { rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown> }).rpc.bind(state.supabase);
    (state.supabase as { rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown> }).rpc = (name, args) => {
      if (name === "get_my_partner_onboarding_agreement_token") tokenRpcCalled = true;
      return original(name, args);
    };
    const { default: Page } = await import("@/app/(app)/partner-dashboard/onboarding/page");
    const result = await Page();
    const app = findElement(result, typeNamed("PartnerOnboardingApplication"));
    expect(app?.props.agreementSigned).toBe(true);
    expect(app?.props.agreementToken).toBeNull();
    expect(tokenRpcCalled).toBe(false);
  });

  it("does not look up an agreement token or documents for a rejected onboarding", async () => {
    let tokenRpcCalled = false;
    setSupabase(
      { partner_onboardings: { data: [{ application_data: {} }] }, document_requests: { data: [DOCUMENT_REQUEST_FIXTURE] } },
      {
        get_my_ero_connection: { data: [CONNECTION_FIXTURE] },
        get_my_partner_onboarding: {
          data: [baseOnboarding({ status: "rejected", agreement_required: true, agreement_signed: false, documents_required: true })],
        },
      }
    );
    const original = (state.supabase as { rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown> }).rpc.bind(state.supabase);
    (state.supabase as { rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown> }).rpc = (name, args) => {
      if (name === "get_my_partner_onboarding_agreement_token") tokenRpcCalled = true;
      return original(name, args);
    };
    const { default: Page } = await import("@/app/(app)/partner-dashboard/onboarding/page");
    const result = await Page();
    const app = findElement(result, typeNamed("PartnerOnboardingApplication"));
    expect(tokenRpcCalled).toBe(false);
    expect(app?.props.agreementToken).toBeNull();
    expect(app?.props.documentRequests).toEqual([]);
  });

  it("fetches document requests scoped to the connection when documents are required", async () => {
    setSupabase(
      { partner_onboardings: { data: [{ application_data: {} }] }, document_requests: { data: [DOCUMENT_REQUEST_FIXTURE] } },
      {
        get_my_ero_connection: { data: [CONNECTION_FIXTURE] },
        get_my_partner_onboarding: { data: [baseOnboarding({ status: "under_review", documents_required: true })] },
      }
    );
    const { default: Page } = await import("@/app/(app)/partner-dashboard/onboarding/page");
    const result = await Page();
    const app = findElement(result, typeNamed("PartnerOnboardingApplication"));
    expect(app?.props.documentRequests).toEqual([DOCUMENT_REQUEST_FIXTURE]);
    expect(app?.props.parentWorkspaceId).toBe("parent-workspace-1");
    expect(app?.props.firmConnectionId).toBe("connection-1");
  });

  it("passes an empty document list through when documents are not required", async () => {
    setSupabase(
      { partner_onboardings: { data: [{ application_data: {} }] }, document_requests: { data: [DOCUMENT_REQUEST_FIXTURE] } },
      {
        get_my_ero_connection: { data: [CONNECTION_FIXTURE] },
        get_my_partner_onboarding: { data: [baseOnboarding({ status: "under_review", documents_required: false })] },
      }
    );
    const { default: Page } = await import("@/app/(app)/partner-dashboard/onboarding/page");
    const result = await Page();
    const app = findElement(result, typeNamed("PartnerOnboardingApplication"));
    expect(app?.props.documentRequests).toEqual([]);
  });
});
