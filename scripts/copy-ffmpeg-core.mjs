// Copy the single-thread @ffmpeg/core runtime into public/ffmpeg/<version>/ so it
// is served same-origin (works offline; no CDN) and so a version bump changes the
// URL (which invalidates the runtime cache). Runs before dev and build.
import { mkdirSync, copyFileSync, rmSync, statSync, readFileSync } from "node:fs";
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
const files = ["ffmpeg-core.js", "ffmpeg-core.wasm"];

for (const file of files) {
  const src = resolve(from, file);
  let size = 0;
  try {
    size = statSync(src).size;
  } catch {
    fail(`missing ${src}. The @ffmpeg/core layout may have changed in ${version}.`);
  }
  if (size === 0) fail(`${src} is empty; reinstall @ffmpeg/core.`);
}

// Clear any previous versions so stale cores are never shipped in dist.
rmSync(resolve(root, "public/ffmpeg"), { recursive: true, force: true });
const to = resolve(root, "public/ffmpeg", version);
mkdirSync(to, { recursive: true });
for (const file of files) copyFileSync(resolve(from, file), resolve(to, file));

console.log(`Copied @ffmpeg/core ${version} → public/ffmpeg/${version}/`);
