import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("workflow tag editor state ownership", () => {
  it("keeps the transient tag draft in the parent instead of duplicating it inside TagListInput", () => {
    const source = read("components/workflows/TagListInput.tsx");

    expect(source).toContain("draft: string;");
    expect(source).toContain("onDraftChange: (draft: string) => void;");
    expect(source).not.toContain("useState(");
    expect(source).not.toContain("const [draft");
  });

  it("passes the trigger draft through to the controlled tag editor", () => {
    const source = read("components/workflows/TriggerFields.tsx");

    expect(source).toContain("tagDraft?: string;");
    expect(source).toContain(`draft={tagDraft ?? ""}`);
    expect(source).toContain("onDraftChange={onTagDraftChange ?? (() => {})}");
  });

  it("folds the parent-owned draft into the save payload and clears it after save", () => {
    const source = read("components/workflows/WorkflowBuilder.tsx");

    expect(source).toContain("const draftTag = tagDraft.trim();");
    expect(source).toContain("const draftTag = triggerTagDraft.trim();");
    expect(source).toContain("setTagDraft(\"\");");
    expect(source).toContain("setTriggerTagDraft(\"\");");
  });
});
