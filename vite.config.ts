import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";

// Bake the installed @ffmpeg/core version into the build so the core is served
// from a versioned URL (see src/lib/coreUrls.ts) — bumping the core then
// invalidates the runtime cache instead of serving a stale wasm forever.
const coreVersion: string = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./node_modules/@ffmpeg/core/package.json", import.meta.url)),
    "utf8"
  )
).version;

// Build-info traceability: app version + the exact commit + build time, so we can
// always tell what is live. The commit comes from Cloudflare Pages' build env, or
// from git locally, or "dev".
const appVersion: string = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8")
).version;
const buildCommit: string =
  process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) ||
  (() => {
    try {
      return execSync("git rev-parse --short HEAD").toString().trim();
    } catch {
      return "dev";
    }
  })();
const buildTime = new Date().toISOString();

// Inject build info as <meta> tags and emit a machine-readable /version.json.
function buildInfo(): Plugin {
  const info = { version: appVersion, commit: buildCommit, buildTime };
  return {
    name: "build-info",
    transformIndexHtml() {
      return [
        { tag: "meta", attrs: { name: "app-version", content: info.version }, injectTo: "head" },
        { tag: "meta", attrs: { name: "build-commit", content: info.commit }, injectTo: "head" },
        { tag: "meta", attrs: { name: "build-time", content: info.buildTime }, injectTo: "head" },
      ];
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify(info, null, 2) + "\n",
      });
    },
  };
}

// Single-thread @ffmpeg/core (per gating spike) needs no COOP/COEP headers.
export default defineConfig({
  define: {
    __FFMPEG_CORE_VERSION__: JSON.stringify(coreVersion),
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    buildInfo(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt", // never interrupt an in-progress conversion
      includeAssets: ["favicon/**", "logo_karaokio.png"],
      manifest: {
        // The app is "cdg2mp4"; Karaokio is the company/brand behind it.
        name: "cdg2mp4 — CDG to MP4 Converter by Karaokio",
        short_name: "cdg2mp4",
        description: "Convert karaoke CDG+MP3 files to MP4 video, right in your browser.",
        theme_color: "#D92334",
        background_color: "#FBF6F1",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Take control on first load so the conversion's core fetch is cached
        // immediately. Updates still wait for the user (skipWaiting stays off).
        clientsClaim: true,
        // Precache the small app shell (html/js/css/fonts/icons) for offline reload.
        globPatterns: ["**/*.{js,css,html,woff,woff2,png,svg,ico}"],
        // Do NOT precache the 31MB ffmpeg core; cache it at runtime on first use.
        globIgnores: ["**/ffmpeg/**"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes("/ffmpeg/"),
            handler: "CacheFirst",
            options: {
              cacheName: "ffmpeg-core",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // ffmpeg's worker + wasm are loaded at runtime via ?url assets; don't pre-bundle.
  optimizeDeps: { exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"] },
});
