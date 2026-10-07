// Automation as the Universal Process Engine + UI V2: "Product Purchased"
// must be a first-class, clearly-labeled trigger in the builder's picker --
// not just a DB-level event (fire_firm_package_purchase_automations already
// emits product.purchased/product.canceled; this locks in that the UI
// actually exposes them, matching known_automation_trigger_types()).
import { describe, it, expect } from "vitest";
import { TRIGGER_TYPES, TRIGGER_CATEGORIES, triggerSummary } from "@/components/workflows/TriggerFields";

describe("Product Purchased trigger", () => {
  it("is registered as a selectable trigger type with a category that exists", () => {
    const purchased = TRIGGER_TYPES.find((t) => t.value === "product.purchased");
    const canceled = TRIGGER_TYPES.find((t) => t.value === "product.canceled");
    expect(purchased).toBeDefined();
    expect(canceled).toBeDefined();
    expect(TRIGGER_CATEGORIES.some((c) => c.key === purchased?.category)).toBe(true);
    expect(TRIGGER_CATEGORIES.some((c) => c.key === canceled?.category)).toBe(true);
  });

  it("does not collide with the existing firm_package.purchased trigger -- both remain independently selectable", () => {
    expect(TRIGGER_TYPES.some((t) => t.value === "firm_package.purchased")).toBe(true);
    expect(TRIGGER_TYPES.some((t) => t.value === "product.purchased")).toBe(true);
  });

  it("renders a plain-language summary with no trigger_config required", () => {
    expect(triggerSummary("product.purchased", {}, [])).toBe("When a product is purchased");
    expect(triggerSummary("product.canceled", {}, [])).toBe("When a product purchase is canceled");
  });
});
