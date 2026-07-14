import { describe, it, expect, beforeEach, vi } from "vitest";
import { getInitialTheme, applyTheme, THEME_STORAGE_KEY } from "./theme";

const mockPrefersDark = (dark: boolean) =>
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: dark } as MediaQueryList);

describe("theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    vi.restoreAllMocks();
  });

  it("prefers the saved choice over the OS preference", () => {
    mockPrefersDark(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(getInitialTheme()).toBe("light");
  });

  it("falls back to the OS preference when nothing is saved", () => {
    mockPrefersDark(true);
    expect(getInitialTheme()).toBe("dark");
    mockPrefersDark(false);
    expect(getInitialTheme()).toBe("light");
  });

  it("ignores garbage in storage", () => {
    mockPrefersDark(false);
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
