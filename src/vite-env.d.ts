/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

/** Installed @ffmpeg/core version, injected by Vite `define` (see vite.config.ts). */
declare const __FFMPEG_CORE_VERSION__: string;

/** Build-info, injected by Vite `define` (see vite.config.ts). */
declare const __APP_VERSION__: string;
declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

/** Public client config (see .env.example). All optional; absent = feature off. */
interface ImportMetaEnv {
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_TALLY_FORM_URL?: string;
}
