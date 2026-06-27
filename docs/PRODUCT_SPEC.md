# Karaokio CDG-to-MP4 — Product Spec

Living spec for the converter. It captures what the app is, how each feature is meant to
behave, and a list of testable behaviors so we can write exhaustive tests and judge app
health. Keep this in sync with the code; the code is the source of truth when they disagree.

_Last reviewed: 2026-06-27._

## 1. What it is

A single static web page that converts karaoke **CDG + MP3** files into an **MP4** video,
entirely in the browser. No backend, no uploads, no account. The user's files are converted
on-device and never uploaded. Once loaded it works offline, and it can be installed like an app.

It is also the reference implementation for the Karaokio platform stack
(React + Vite + Tailwind v4 on the shadcn-style design system).

## 2. Users and core use cases

- A karaoke host or singer who bought CDG tracks and wants a normal video to play or share.
- Mostly mobile, often on poor or no wifi (bars, basements, backyards).
- Use cases: convert a single song, pick a quality, preview, download, optionally install
  the app and use it offline.

## 3. Tech stack (pinned versions)

| Area | Package | Version |
|---|---|---|
| Transcoder API | `@ffmpeg/ffmpeg` | 0.12.15 |
| Transcoder utils | `@ffmpeg/util` | 0.12.2 |
| Transcoder core (single-thread) | `@ffmpeg/core` | 0.12.10 |
| In-browser unzip | `fflate` | 0.8.3 |
| PWA / service worker | `vite-plugin-pwa` | 0.21.2 (workbox-build 7.4.1) |
| UI | `react` | 19.x |
| Build | `vite` | 6.x |
| Styling | `tailwindcss` | 4.x |

Update this table when these dependencies change, especially `@ffmpeg/core` (see below).

## 4. Conversion engine (ffmpeg.wasm)

- Uses the **single-thread** `@ffmpeg/core` build, served same-origin from `public/ffmpeg/`
  (copied in by `scripts/copy-ffmpeg-core.mjs` before dev/build). The core is roughly 31 MB.
- **Why single-thread:** the multi-thread core (`@ffmpeg/core-mt`) deadlocks at x264 init in
  the browser (nested-worker hang). Single-thread also needs no COOP/COEP cross-origin
  isolation headers, which keeps deployment to a plain static host.
- The core includes the **`cdg` demuxer** and **`cdgraphics` decoder** (verified). It has no
  SIMD (`x264: using cpu capabilities: none`), so encoding is CPU-bound and not instant.
- **Command** (`src/lib/ffmpeg.ts`):
  ```
  -i in.cdg -i in.mp3 -r 30 -vf scale=<W>:<H>:flags=neighbor \
    -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -shortest out.mp4
  ```
  - `-pix_fmt yuv420p` is required for Safari/QuickTime/browser playback.
  - `flags=neighbor` keeps the low-res CDG pixel-art crisp when upscaled.
  - `-shortest` ends at the shorter of the two inputs.
- A shared FFmpeg instance is loaded once and reused; the virtual FS is cleaned between runs.

## 5. Features and behaviors

Each feature lists acceptance criteria written as testable statements. `[unit]`,
`[integration]`, `[e2e]`, `[manual]` mark the cheapest level that can verify each.

### F1 — File input

- Accepts a `.zip` containing one `.cdg` and one `.mp3`. `[integration]`
- Accepts a loose `.cdg` and `.mp3` selected/dropped together. `[integration]`
- Works via both drag-and-drop and the file picker (button / dropzone click). `[e2e]`
- Zip extraction ignores directory entries and `__MACOSX/` resource forks. `[unit]`
- Errors clearly when no `.cdg` is present, when no `.mp3` is present, or when neither a zip
  nor a cdg+mp3 pair is given: "Drop a karaoke .zip, or a matching .cdg and .mp3 together."
  `[unit]`
- Output filename is derived from the CDG base name (`song.cdg` -> `song.mp4`). `[unit]`

### F2 — Conversion and quality

- Quality selector offers 480p (640x480), 720p (960x720), 1080p (1440x1080), all 4:3 to
  match CDG. Default is 1080p. `[unit]`
- The selected quality is passed to ffmpeg as the scale target. `[integration]`
- A successful run produces a non-empty MP4 with an H.264 (yuv420p) video stream and an AAC
  audio stream at the selected resolution. `[integration]`
- A non-zero ffmpeg exit, or an empty output, surfaces an error rather than a broken result.
  `[unit]`

### F3 — Progress and time estimate

- While converting, the UI shows a phase ("Reading files", "Loading converter",
  "Converting"), a progress bar, and a percentage. `[e2e]`
- Progress is clamped to 0..1 (ffmpeg can report slightly over 1 near the end). `[unit]`
- After enough samples, a remaining-time estimate is shown and is rounded for calm display
  (for example "about 25s left", "about 1m 30s left"). `[unit]`
- Before progress starts, a reassurance line is shown instead of a stuck 0%. `[manual]`

### F4 — Result

- On success, the MP4 is shown in an in-page `<video>` (autoplay, loop) and offered as a
  download with the derived filename. `[e2e]`
- "Convert another" returns to the idle state. `[e2e]`
- Object URLs are revoked when replaced or on unmount (no leaks across repeated runs).
  `[unit]`

### F5 — Offline and install (PWA) — _status: PR #11_

- App shell (html, JS, CSS, fonts, icons) is precached for offline reload. `[e2e]`
- The 31 MB core is runtime-cached (CacheFirst) on first use, not precached, so first paint
  stays fast. `[integration]`
- The service worker claims clients on first load, so the core caches during the first
  conversion. `[e2e]`
- Offline status pill reads the real cache and shows: "Save for offline" (not cached),
  "Saving for offline" (in progress), "Available offline" (cached) with a "Remove" action,
  and "Update ready, tap to reload" when a new SW is waiting. `[e2e]`
- "Save for offline" caches the core on a single click (it polls the cache until the SW has
  written it). `[e2e]`
- "Remove" deletes the core cache and reverts to "Save for offline". `[e2e]`
- With the network off, the app reloads and a conversion still completes from cache. `[e2e]`
- Updates are prompted (never forced mid-conversion); the service worker only runs in the
  production build, not in `npm run dev`. `[manual]`
- Install button is event-gated on `beforeinstallprompt`, hides once installed, and adapts
  its label ("Add to Home Screen" on touch, "Install app" on desktop). iOS Safari shows a
  Share-menu hint instead of a button. `[manual]`
- Every actionable control has a hover tooltip. `[unit]`

### F6 — Branding and design system

- All UI is token-driven from `src/styles/tokens/` (no raw hex in components). `[unit]`
- Reuses the shadcn-style primitives in `src/components/ui/` (Button, Surface, Label,
  Spinner). `[manual]`

## 6. Non-functional requirements

- **Privacy:** file contents never leave the device (conversion is fully local) and there is
  no backend or account. The app does send anonymous product analytics (PostHog) and only the
  feedback a user chooses to submit (Tally); both are off unless their keys are configured.
  See `PRIVACY.md`. `[integration]`
- **Performance:** a full song converts in roughly a minute at 1080p on typical hardware,
  faster at lower quality. First load downloads the ~31 MB core once. `[manual]`
- **Offline:** after first load, reload and conversion work with no network. `[e2e]`
- **Deploy:** the `dist/` output is a self-contained static bundle, no special headers.
  `[manual]`
- **Accessibility:** the dropzone is keyboard operable; controls have labels/titles; focus
  rings use the token focus color. `[manual]`

## 7. Browser support matrix

| Browser | Convert | Offline / SW | One-tap install |
|---|---|---|---|
| Chrome / Edge (desktop) | yes | yes | yes (`beforeinstallprompt`) |
| Chrome (Android) | yes | yes | yes |
| Safari (macOS) | yes | yes | no programmatic install |
| Safari (iOS) | yes | yes | manual Add to Home Screen (hint shown) |
| Firefox | yes | yes | no install button |

## 8. Known limitations

- Encoding is CPU-bound (no SIMD in the wasm core); very long songs at 1080p take a while.
- The browser may evict the cached core under storage pressure; it re-downloads when online.
- iOS has no one-tap install; only a manual hint.
- The README "How it works" snippet still shows the old `-s 640x480` command; the real
  command is the `scale=...:flags=neighbor` form above. Fix when convenient.

## 9. Test plan (coverage targets)

- **Unit** (Vitest): `zip.ts` extraction and naming, quality-to-size mapping, ETA
  formatting, progress clamping, error messages, cache-name helpers.
- **Integration** (Vitest + jsdom or a thin harness): `filesToPair`, and a small real
  conversion of `test/files/sample.*` asserting a valid MP4 (can run under Node with the
  core, or in a browser runner).
- **E2E** (Playwright, against `npm run preview`): drop zip -> convert -> preview ->
  download; loose cdg+mp3 path; offline reload + offline conversion; pill state transitions
  (save, remove, available); update prompt.
- **Manual / device:** install on Android and iOS via a tunnel; cross-browser playback of
  the output MP4; reduced-motion and keyboard passes.

## 10. Open questions / future

- Optional styled tooltip component (instant, on-brand) to replace native `title`.
- Optional 9:16 export preset and trimming.
- Local stdio MCP wrapper for programmatic conversion.
