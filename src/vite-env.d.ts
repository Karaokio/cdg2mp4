/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

/** Installed @ffmpeg/core version, injected by Vite `define` (see vite.config.ts). */
declare const __FFMPEG_CORE_VERSION__: string;

/** Build-info, injected by Vite `define` (see vite.config.ts). */
declare const __APP_VERSION__: string;
declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;
