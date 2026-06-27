// Stage the single-thread @ffmpeg/core runtime into public/ffmpeg/<version>/ so it
// is served same-origin (works offline; no CDN) and so a version bump changes the
// URL (which invalidates the runtime cache). The wasm is gzipped because the raw
// ~31MB file exceeds Cloudflare Pages' 25 MiB per-file limit; the app decompresses
// it in the browser via DecompressionStream (see src/lib/ffmpeg.ts). Runs before
// dev and build.
import { mkdirSync, copyFileSync, writeFileSync, rmSync, statSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corePkg = resolve(root, "node_modules/@ffmpeg/core/package.json");

function fail(message) {
  console.error(`[copy-ffmpeg-core] ${message}`);
  process.exit(1);
}

let version;
try {
  version = JSON.parse(readFileSync(corePkg, "utf8")).version;
} catch {
  fail('@ffmpeg/core is not installed. Run "npm install" first.');
}

const from = resolve(root, "node_modules/@ffmpeg/core/dist/esm");

function srcSize(file) {
  const src = resolve(from, file);
  try {
    const size = statSync(src).size;
    if (size === 0) fail(`${src} is empty; reinstall @ffmpeg/core.`);
    return src;
  } catch {
    fail(`missing ${src}. The @ffmpeg/core layout may have changed in ${version}.`);
  }
}

const coreJs = srcSize("ffmpeg-core.js");
const coreWasm = srcSize("ffmpeg-core.wasm");

// Clear any previous versions so stale cores are never shipped in dist.
rmSync(resolve(root, "public/ffmpeg"), { recursive: true, force: true });
const to = resolve(root, "public/ffmpeg", version);
mkdirSync(to, { recursive: true });

// The loader (109KB) is small enough to serve raw; the wasm is gzipped to fit
// the host's per-file limit and to shrink the first-load download.
copyFileSync(coreJs, resolve(to, "ffmpeg-core.js"));
const gz = gzipSync(readFileSync(coreWasm), { level: 9 });
writeFileSync(resolve(to, "ffmpeg-core.wasm.gz"), gz);

const mib = (n) => (n / 1048576).toFixed(2);
console.log(
  `Copied @ffmpeg/core ${version} → public/ffmpeg/${version}/ ` +
    `(wasm ${mib(statSync(coreWasm).size)}MiB → gz ${mib(gz.length)}MiB)`
);
