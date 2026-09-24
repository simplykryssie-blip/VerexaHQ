// VEREXAHQ DASHBOARD RECONCILIATION: true drag-and-drop + Reset Layout.
// The pre-existing Customize mode dragged rows in a separate abstract list,
// not the actual dashboard cards, and had no Reset Layout action at all.
// This locks in the fix: real dnd-kit sortable behavior applied directly to
// the rendered widget cards (scoped per-section, since a widget's section
// is fixed by type and cross-section drops can't move it there anyway), a
// hidden widget staying visible-but-dimmed in Customize mode so it can be
// re-shown from the real grid (no separate list needed to reach it), and a
// Reset Layout action that both persists (deletes this user's
// user_widget_preferences rows) and updates immediately (sets local state
// to the workspace's own dashboard_widgets defaults, passed down
// separately as `defaultWidgets`).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const shellSource = readFileSync(join(repoRoot, "app/(app)/dashboard/DashboardShell.tsx"), "utf8");
const cardSource = readFileSync(join(repoRoot, "components/dashboard/SortableWidgetCard.tsx"), "utf8");
const pageSource = readFileSync(join(repoRoot, "app/(app)/dashboard/page.tsx"), "utf8");

describe("DashboardShell -- real card drag-and-drop", () => {
  it("uses dnd-kit (a maintained library), not raw HTML5 drag events, for reordering", () => {
    expect(shellSource).toMatch(/from "@dnd-kit\/core"/);
    expect(shellSource).toMatch(/from "@dnd-kit\/sortable"/);
    expect(shellSource).not.toMatch(/dataTransfer/);
  });

  it("wraps the actual rendered widget grid in DndContext/SortableContext, not a separate proxy list", () => {
    const gridSectionStart = shellSource.indexOf("WIDGET_SECTIONS.map((section)");
    expect(gridSectionStart).toBeGreaterThan(-1);
    const gridSection = shellSource.slice(gridSectionStart, gridSectionStart + 2400);
    expect(gridSection).toMatch(/<DndContext/);
    expect(gridSection).toMatch(/<SortableContext/);
    expect(gridSection).toMatch(/<SortableWidgetCard/);
    expect(gridSection).toMatch(/renderWidget\(row\.widget_type\)/);
  });

  it("keeps drag reordering confined to one section per SortableContext (cross-section drops can't move a widget out of its fixed-by-type section anyway)", () => {
    expect(shellSource).toMatch(/items=\{sectionRows\.map\(\(r\) => r\.id\)\}/);
  });

  it("in Customize mode, renders hidden widgets too (dimmed) instead of only the abstract list showing them -- otherwise there'd be no way to re-show one", () => {
    expect(shellSource).toMatch(/customizing \? sorted : visible/);
    expect(shellSource).toMatch(/customizing && !row\.is_visible/);
  });

  it("SortableWidgetCard exposes a drag handle and the show/hide toggle only while editing, and disables it via dnd-kit's own `disabled` option rather than omitting listeners inconsistently", () => {
    expect(cardSource).toMatch(/useSortable\(\{ id, disabled: !editing \}\)/);
    expect(cardSource).toMatch(/GripVertical/);
    expect(cardSource).toMatch(/onToggleVisible/);
  });
});

describe("DashboardShell -- Reset Layout", () => {
  it("renders a Reset Layout action, only while customizing", () => {
    const actionsBlock = shellSource.slice(shellSource.indexOf("actions={"), shellSource.indexOf("actions={") + 800);
    expect(actionsBlock).toMatch(/\{customizing && \(/);
    expect(actionsBlock).toMatch(/Reset Layout/);
    expect(actionsBlock).toMatch(/resetLayout/);
  });

  it("resetLayout deletes this user's own preference rows (scoped by user_id, not a broad admin/service-role delete) and restores local state from defaultWidgets", () => {
    const fnStart = shellSource.indexOf("async function resetLayout()");
    expect(fnStart).toBeGreaterThan(-1);
    const fn = shellSource.slice(fnStart, shellSource.indexOf("\n  }\n", fnStart));
    expect(fn).toMatch(/\.from\("user_widget_preferences"\)/);
    expect(fn).toMatch(/\.delete\(\)/);
    expect(fn).toMatch(/\.eq\("user_id", user\.id\)/);
    expect(fn).toMatch(/\.in\("dashboard_widget_id", rows\.map\(\(r\) => r\.id\)\)/);
    expect(fn).toMatch(/setRows\(defaultWidgets\)/);
    expect(fn).toMatch(/router\.refresh\(\)/);
  });

  it("DashboardShell requires defaultWidgets as a prop distinct from the merged widgets prop, and page.tsx supplies the raw pre-merge dashboard_widgets rows", () => {
    expect(shellSource).toMatch(/defaultWidgets: WidgetRow\[\]/);
    expect(pageSource).toMatch(/defaultWidgets=\{widgets \?\? \[\]\}/);
  });
});
