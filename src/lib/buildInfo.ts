// Build-info, injected at build time (see vite.config.ts). Mirrors /version.json
// and the <meta> tags in index.html.

// The app is "cdg2mp4"; the company / brand is "Karaokio".
export const APP_NAME = "cdg2mp4";
export const COMPANY = "Karaokio";

export const APP_VERSION = __APP_VERSION__;
export const BUILD_COMMIT = __BUILD_COMMIT__;
export const BUILD_TIME = __BUILD_TIME__;

export const REPO_URL = "https://github.com/Karaokio/cdg2mp4";
export const COMMIT_URL =
  BUILD_COMMIT && BUILD_COMMIT !== "dev" ? `${REPO_URL}/commit/${BUILD_COMMIT}` : REPO_URL;

/** A short, human label like "v2.0.0 · a1b2c3d". */
export const BUILD_LABEL = `v${APP_VERSION} · ${BUILD_COMMIT}`;
