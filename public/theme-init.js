// Apply a saved dark choice before first paint; the html attribute already
// defaults to light. Key must match THEME_STORAGE_KEY in src/lib/theme.ts.
// Kept as a separate file rather than inline so it passes `script-src 'self'`
// in public/_headers without needing 'unsafe-inline' or a per-build hash.
try {
  if (localStorage.getItem("karaokio-theme") === "dark")
    document.documentElement.dataset.theme = "dark";
} catch (e) {}
