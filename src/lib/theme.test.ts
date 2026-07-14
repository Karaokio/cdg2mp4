import { describe, it, expect, beforeEach } from "vitest";
import { getInitialTheme, applyTheme, THEME_STORAGE_KEY } from "./theme";

describe("theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("prefers the saved choice", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(getInitialTheme()).toBe("dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(getInitialTheme()).toBe("light");
  });

  it("defaults to light when nothing is saved", () => {
    expect(getInitialTheme()).toBe("light");
  });

  it("ignores garbage in storage", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "disco");
    expect(getInitialTheme()).toBe("light");
  });

  it("applyTheme sets the data attribute and persists", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});
