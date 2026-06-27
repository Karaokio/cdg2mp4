import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

// A dedicated Vitest config (not the app's vite.config, which loads the PWA
// plugin we don't want during unit tests).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  define: {
    __FFMPEG_CORE_VERSION__: JSON.stringify("test"),
  },
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/coreUrls.ts", "src/**/*.test.ts"],
    },
  },
});
