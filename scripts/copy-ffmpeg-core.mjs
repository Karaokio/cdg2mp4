// Copy the single-thread @ffmpeg/core runtime into public/ffmpeg/ so it is
// served same-origin (works offline; no CDN). Runs before dev and build.
import { mkdirSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const from = resolve(root, "node_modules/@ffmpeg/core/dist/esm");
const to = resolve(root, "public/ffmpeg");

mkdirSync(to, { recursive: true });
for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  copyFileSync(resolve(from, file), resolve(to, file));
}
console.log("Copied @ffmpeg/core runtime → public/ffmpeg/");
