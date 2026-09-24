// Regression coverage for VEREXAHQ CONTACTS PASS 5 (DocumentWorkspace's
// "Show activity" panel narrowed to genuinely document-specific
// activity_type values -- general Contact/Engagement history now lives
// exclusively in the Timeline tab wired in Pass 3, so this panel no longer
// duplicates it). DocumentWorkspace is a "use client" component calling
// useState() outside a render tree, the same constraint every other
// Contacts pass's component tests have hit -- source-text assertion, same
// as the rest of this suite.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceSource = readFileSync(join(repoRoot, "components/documents/DocumentWorkspace.tsx"), "utf8");
const typesSource = readFileSync(join(repoRoot, "components/documents/types.ts"), "utf8");
const baselineSchema = readFileSync(
  join(repoRoot, "supabase/migrations/00000000000000_baseline_schema_snapshot_for_fresh_projects.sql"),
  "utf8"
);
const portalEngagementSource = readFileSync(join(repoRoot, "app/portal/(portal)/engagements/[id]/page.tsx"), "utf8");
const portalDocumentsSource = readFileSync(join(repoRoot, "app/portal/(portal)/documents/page.tsx"), "utf8");

describe("DocumentWorkspace -- activity panel filters to document-specific activity_type values", () => {
  it("defines a document-scoped activity_type allowlist and filters the incoming activity feed against it", () => {
    expect(workspaceSource).toContain("const DOCUMENT_ACTIVITY_TYPES = new Set([");
    expect(workspaceSource).toContain(
      "const documentActivity = activity.filter((a) => DOCUMENT_ACTIVITY_TYPES.has(a.activity_type));"
    );
  });

  it("renders the filtered list, not the raw unfiltered activity prop", () => {
    expect(workspaceSource).toContain("documentActivity.length === 0");
    expect(workspaceSource).toContain("documentActivity.map((a) =>");
    // The raw, unfiltered `activity` prop must not itself be rendered directly.
    expect(workspaceSource).not.toMatch(/\{activity\.length === 0/);
    expect(workspaceSource).not.toMatch(/\{activity\.map\(/);
  });

  it("renamed the toggle to make the new scope explicit, without changing any other behavior", () => {
    expect(workspaceSource).toContain('{showActivity ? "Hide document activity" : "Show document activity"}');
  });

  it("every allowlisted activity_type is one the app's own triggers actually write for a document or its signature workflow (no guessed values)", () => {
    const allowlistBlock = workspaceSource.slice(
      workspaceSource.indexOf("const DOCUMENT_ACTIVITY_TYPES"),
      workspaceSource.indexOf("]);") + 3
    );
    const allowlisted = [...allowlistBlock.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
    expect(allowlisted.length).toBeGreaterThan(0);

    // record_attachment_activity: 'DOCUMENT_' || upper(verb) for
    // Deleted/Archived/Restored/Renamed/Uploaded.
    expect(baselineSchema).toContain("'DOCUMENT_' || upper(v_verb)");
    // record_document_request_activity: fixed DOCUMENT_REQUEST_CREATED.
    expect(baselineSchema).toContain("'DOCUMENT_REQUEST_CREATED', 'DOCUMENT_REQUEST_CREATED'");
    // record_signature_activity: SIGNATURE_SIGNED / SIGNATURE_DECLINED / SIGNATURE_UPDATED.
    expect(baselineSchema).toContain(
      "case new.status when 'signed' then 'SIGNATURE_SIGNED' when 'declined' then 'SIGNATURE_DECLINED' else 'SIGNATURE_UPDATED' end"
    );

    for (const type of allowlisted) {
      expect(type.startsWith("DOCUMENT_") || type.startsWith("SIGNATURE_")).toBe(true);
    }
  });

  it("does not touch general (non-document) activity_type values like ENGAGEMENT_CREATED, NOTE_ADDED, or PAYMENT_RECEIVED -- those remain Timeline-only", () => {
    const allowlistBlock = workspaceSource.slice(
      workspaceSource.indexOf("const DOCUMENT_ACTIVITY_TYPES"),
      workspaceSource.indexOf("]);") + 3
    );
    for (const nonDocumentType of ["ENGAGEMENT_CREATED", "NOTE_ADDED", "PAYMENT_RECEIVED", "EMAIL_SENT", "STATUS_CHANGE"]) {
      expect(allowlistBlock).not.toContain(nonDocumentType);
    }
  });
});

describe("ActivityRow now carries activity_type so DocumentWorkspace can filter by it", () => {
  it("components/documents/types.ts's ActivityRow includes activity_type", () => {
    expect(typesSource).toContain(
      "export type ActivityRow = { id: string; description: string; activity_type: string; created_at: string };"
    );
  });
});

describe("Portal activity_log queries -- updated to select activity_type so the new filter doesn't silently empty their document activity panel", () => {
  it("portal engagement detail selects activity_type", () => {
    expect(portalEngagementSource).toContain(
      '.from("activity_log").select("id, description, activity_type, created_at")'
    );
  });

  it("portal documents page selects activity_type", () => {
    expect(portalDocumentsSource).toContain(
      '.from("activity_log").select("id, description, activity_type, created_at")'
    );
  });
});
