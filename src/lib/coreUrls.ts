// Single source of truth for the ffmpeg core URLs, shared by the loader and the
// offline-status pill. The version is baked into the path so that bumping
// @ffmpeg/core changes the URL, which naturally invalidates the runtime cache
// (a CacheFirst entry keyed on an unversioned URL would otherwise serve a stale
// core forever after an upgrade). The version is injected by Vite (define) from
// the installed @ffmpeg/core package; see vite.config.ts and copy-ffmpeg-core.mjs.
const base = import.meta.env.BASE_URL;

export const CORE_VERSION = __FFMPEG_CORE_VERSION__;
export const CORE_JS_URL = `${base}ffmpeg/${CORE_VERSION}/ffmpeg-core.js`;
// The wasm is shipped gzipped (the raw ~31MB file exceeds Cloudflare Pages' 25 MiB
// per-file limit) and decompressed in the browser; see src/lib/ffmpeg.ts.
export const CORE_WASM_GZ_URL = `${base}ffmpeg/${CORE_VERSION}/ffmpeg-core.wasm.gz`;
