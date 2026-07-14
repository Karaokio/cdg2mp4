export type Theme = "light" | "dark";

/** Same key the pre-paint script in index.html reads. */
export const THEME_STORAGE_KEY = "karaokio-theme";

/** Saved choice wins; new users get light. */
export function getInitialTheme(): Theme {
  try {
    // window-qualified: Node exposes a bare `localStorage` global that
    // shadows the DOM one under the test runner.
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // localStorage can throw in private/locked-down modes; fall through.
  }
  return "light";
}

/** Flip the token layer (semantic.css keys off [data-theme]) and persist. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Non-persistent storage just means the choice lasts for this visit.
  }
}
