# Deploying to Cloudflare Pages

The app is a static bundle (`dist/`) and auto-deploys to Cloudflare Pages on every push
to `main`, after CI passes. Target domain: **cdg2mp4.com**.

## How it works

`.github/workflows/ci.yml` has a `deploy` job that runs only on `main`, only after the
`check` and `e2e` jobs pass. It builds and runs `wrangler pages deploy dist`.

## One-time setup

1. **Cloudflare account + domain.** Have `cdg2mp4.com` on Cloudflare (or add it).

2. **Create the Pages project** (once). Either in the dashboard (Workers & Pages → Create →
   Pages → Direct Upload, name it `cdg2mp4`), or with wrangler:

   ```bash
   npx wrangler pages project create cdg2mp4 --production-branch main
   ```

3. **Add two GitHub repo secrets** (Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN` — a token with the **Cloudflare Pages: Edit** permission.
   - `CLOUDFLARE_ACCOUNT_ID` — your account id (dashboard URL or `wrangler whoami`).

4. **Custom domain.** In the Pages project → Custom domains → add `cdg2mp4.com` (and
   `www` if wanted). Cloudflare provisions SSL automatically.

After that, merging to `main` deploys automatically.

## What ships, and why the wasm is gzipped

- `public/_headers` is applied by Pages (CSP + security headers — see that file).
- Cloudflare Pages rejects any file over **25 MiB**, and the ffmpeg core wasm is ~31 MiB.
  So `scripts/copy-ffmpeg-core.mjs` stages it **gzipped** (`ffmpeg-core.wasm.gz`, ~9.8 MiB),
  and the app decompresses it in the browser (`src/lib/ffmpeg.ts`). The loader detects
  whether the host already decompressed it (via `Content-Encoding`) by checking the gzip
  magic bytes, so it works whether or not Pages serves the `.gz` with `Content-Encoding`.
- The core path is versioned (`/ffmpeg/<version>/`), so upgrading `@ffmpeg/core` changes the
  URL and the service-worker runtime cache refetches instead of serving a stale core.

## Manual deploy (fallback)

```bash
npm run build
npx wrangler pages deploy dist --project-name=cdg2mp4 --branch=main
```

## Notes

- The service worker uses **prompted** updates, so returning visitors see an "Update ready"
  pill rather than a forced reload. The hashed assets + versioned core mean updates are
  picked up cleanly on the next visit.
- No special compute or headers beyond `_headers` are required; it's a pure static deploy.
