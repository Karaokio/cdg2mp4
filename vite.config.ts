import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
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

// Single-thread @ffmpeg/core (per gating spike) needs no COOP/COEP headers.
export default defineConfig({
  define: {
    __FFMPEG_CORE_VERSION__: JSON.stringify(coreVersion),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt", // never interrupt an in-progress conversion
      includeAssets: ["favicon/**", "logo_karaokio.png"],
      manifest: {
        name: "Karaokio CDG to MP4 Converter",
        short_name: "Karaokio",
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
