# cdg2mp4

Browser-only CDG+MP3 to MP4 karaoke converter. React + Vite, deployed to Cloudflare Pages.

## Before pushing

Run `npm run verify`. It is the exact sequence CI runs in the "Typecheck, lint, test, build" job:

```
npm run typecheck && npm run lint && npm run format && npm run test && npm run build
```

Running only `vitest` is not enough. Lint and Prettier fail CI on files that tests never touch, including non-`src/` files such as scripts under `public/`.

A `pre-push` hook in `.githooks/` runs `npm run verify` automatically. It is wired up by the `prepare` script on `npm install`; run `npm run prepare` once if you cloned before that existed. Bypass with `git push --no-verify`.

E2E (`npm run e2e`) is not in `verify` because it needs a Playwright browser and takes ~90s. Run it when a change touches the conversion flow or UI.

## Content Security Policy

The CSP lives in [public/_headers](public/_headers) and Cloudflare Pages serves it. `script-src` has no `'unsafe-inline'`, so **no inline `<script>` in index.html**. Put the code in a file under `public/` and load it with `src` (see [public/theme-init.js](public/theme-init.js)); `script-src 'self'` covers it. Prefer that over adding a `sha256-` hash to the CSP, since a hash breaks silently whenever the script body changes.

CSP violations do not fail any test or build. Verify by serving `dist/` with the `_headers` CSP applied and checking the console, not with `vite dev`, which sends no CSP.

## Patched dependencies

`patches/` holds `patch-package` diffs that `postinstall` applies on every `npm install` / `npm ci`. Today that is `cdgraphics@7.0.0` (scroll-offset out-of-bounds read, #92). Bumping a patched package requires regenerating its patch (`npx patch-package <name>` after editing `node_modules/<name>`), or deleting the patch once upstream has the fix; a version mismatch fails the install loudly.
