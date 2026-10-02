import { describe, expect, it } from "vitest";
import { applyMobileMenuFallbackState } from "@/components/site/sections/CustomHtmlSection";

function makeMenu(initiallyOpen = false) {
  const classes = new Set(initiallyOpen ? ["open"] : []);
  const attributes = new Map<string, string>();
  const button = {
    textContent: initiallyOpen ? "×" : "☰",
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
  };
  const panel = {
    classList: {
      contains(token: string) {
        return classes.has(token);
      },
      toggle(token: string, force?: boolean) {
        const shouldHaveClass = force ?? !classes.has(token);
        if (shouldHaveClass) classes.add(token);
        else classes.delete(token);
        return shouldHaveClass;
      },
    },
  };

  return { button, panel, classes, attributes };
}

describe("custom HTML mobile menu fallback", () => {
  it("opens a menu when the custom HTML click handler was lost", () => {
    const menu = makeMenu();

    applyMobileMenuFallbackState(menu.button, menu.panel, true);

    expect(menu.classes.has("open")).toBe(true);
    expect(menu.attributes.get("aria-expanded")).toBe("true");
    expect(menu.button.textContent).toBe("×");
  });

  it("closes a menu when the custom HTML click handler was lost", () => {
    const menu = makeMenu(true);

    applyMobileMenuFallbackState(menu.button, menu.panel, false);

    expect(menu.classes.has("open")).toBe(false);
    expect(menu.attributes.get("aria-expanded")).toBe("false");
    expect(menu.button.textContent).toBe("☰");
  });

  it("does not toggle twice when the custom HTML handler already changed the state", () => {
    const menu = makeMenu(true);

    applyMobileMenuFallbackState(menu.button, menu.panel, true);

    expect(menu.classes.has("open")).toBe(true);
    expect(menu.attributes.size).toBe(0);
    expect(menu.button.textContent).toBe("×");
  });
});
