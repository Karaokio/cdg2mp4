# Feedback + analytics plan (cdg2mp4)

## Why

People use cdg2mp4 silently, so today the only signal is someone complaining on a blog when
it breaks. The goal is earlier, cheaper signal: who is using it, how much, where, what for,
plus bugs and feature requests, without paying for backend services. All of the tools below
run on someone else's free tier, so the "no backend I pay for" goal stays intact.

## Division of labor

| Question | Tool | How |
| --- | --- | --- |
| Is anyone using it? How many? Where? | **PostHog** | Passive events + IP geo. No user action needed. |
| Did conversions work? What file types / resolutions? | **PostHog** | Event properties on every conversion. |
| Is it down / are failures spiking? | **PostHog** (error tracking + a failure event) | Trend + alert, so you know before the blog comments. |
| Who are they, what do they use it for, feature ideas, bugs in their words | **Tally** | Short feedback form, responses land in Google Sheets. |
| Want updates when Karaokio launches? | **Tally** | Optional email field on the same form. |
| Best-in-class crash reports (deferred) | **Sentry** | Only if PostHog error tracking proves too thin. |

PostHog tells you *that* and *how much*. Tally tells you *who* and *why*. They complement;
neither replaces the other.

## What you set up vs what I wire

| You (dashboards, one-time) | Me (in repo) |
| --- | --- |
| Create PostHog account, US-cloud project "cdg2mp4", copy the project API key | Install `posthog-js`, init it, fire the event taxonomy, update CSP, read keys from env |
| Create Tally account + the feedback form (spec below), connect it to a Google Sheet | Add the footer "Feedback" link + contextual prompts, pre-fill build/context, read the form URL from env |
| Add the env vars to the Cloudflare Pages project (and a local `.env`) | Commit `.env.example`, document the vars |

I cannot create accounts or build the Tally form for you (those are human/ToS actions), even
with API keys. The keys below are *publishable client keys* (PostHog project key, Sentry DSN
are designed to be exposed in the browser), so there is no secret to leak; they go in
`VITE_*` build env vars, which are baked into the public bundle by design.

## PostHog (product analytics)

**You create:** account at posthog.com, region **US cloud**, project named `cdg2mp4`.
Copy the **Project API key** and note the host `https://us.i.posthog.com`.

**Config choices (recommended):**

- Autocapture: leave on to start (cheap, catches clicks), or off if you only want the named
  events below. Named events are what matters for funnels.
- Persistence: `localStorage+cookie` is default; cost-driven and low-stakes, so no consent
  banner needed. Honor Do Not Track is optional.
- Two-product separation: when the karaoke directory ships, give it its **own project** (or
  add an `app` property) so funnels do not mix.

**Env vars:**

```
VITE_POSTHOG_KEY=phc_xxx          # publishable project key
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

**Event taxonomy** (as shipped; file *names* are sent for diagnosability, file *contents*
never are — see PRIVACY.md):

- `conversion_started` { input_type: "zip" | "pair", resolution } + input file names
  (`zip_name`, or `cdg_name` + `mp3_name`)
- `conversion_succeeded` { input_type, resolution, duration_ms, song_seconds,
  output_mb_bucket, output_name } + input file names. `song_seconds` is derived from the
  CDG stream length (300 packets/sec x 24 bytes = 7200 bytes/sec), so it measures the
  graphics duration, not the usually slightly longer MP3.
- `conversion_failed` { input_type, resolution, stage, reason, error_name?,
  error_message?, zip_extensions? } + input file names. `reason` is the low-cardinality
  code from `classifyError` (e.g. `load_failed`, `ffmpeg_error`, `bad_input`).
- `conversion_cancelled` { input_type, resolution, stage, progress_pct, duration_ms }
- `saved_for_offline`, `offline_removed`, `pwa_installed`, `update_applied`,
  `download_clicked` { resolution }
- UI events: `theme_toggled` { theme }, `email_clicked` { trigger },
  `feedback_opened` / `feedback_submitted` { trigger },
  `command_disclosure_opened` { resolution }, `command_copied` { resolution, real_names },
  `command_explain_opened`, `lone_file_held` { file_kind, file_name },
  `lone_file_cleared` { file_kind }, `input_rejected` { extensions }
- Every event carries the super properties `app`, `build` (the build commit from
  `src/lib/buildInfo.ts`), and `theme`.

**CSP:** add to `connect-src` in `public/_headers`:
`https://us.i.posthog.com https://us-assets.i.posthog.com`. Install via npm and bundle, so
`script-src 'self'` is untouched.

## Tally (feedback + newsletter)

**You create:** account at tally.so, one form named **"cdg2mp4 feedback"**.

**Visible fields (keep it short):**

1. *Feedback, bugs, or feature ideas?* (long text) -> one open question covering bugs, feature
   requests, and use-case chatter. The hidden `trigger` field separates bug reports
   (`after_failure`) from the rest. Merged from two earlier questions on 2026-07-21.
2. *Attach the file that didn't work* (optional file upload: .zip, .cdg, .mp3, or the output
   .mp4; free-plan limit is 10 MB per file). Added 2026-07-21 via the Tally API.
3. *Email, if you would like updates or a reply* (optional) -> this is the newsletter capture.
4. Closing text: "Prefer not to fill out the form? Email us directly at `support@karaokio.com`."

Form edits are made via the Tally API (`PATCH https://api.tally.so/forms/<id>`) using
`TALLY_API_KEY` from the local `.env` (gitignored, never deployed; the key is internal-only,
unlike the public `VITE_*` vars).

**Hidden fields (pre-filled from the app via URL params):** `build`, `trigger`
(`footer` | `after_success` | `after_failure`), `resolution`, `input_type`, `result`. A bug
report that arrives already tagged with "build 61d8e02, 1080p, loose files, failed" is worth
ten vague ones.

**Where responses land:** connect the form to **Google Sheets** (Tally -> Integrations ->
Google Sheets) in the Karaokio Workspace. No email sender needed yet; when you want to send a
newsletter later, export or pipe the email column into Resend or Buttondown.

**Integration shape (shipped):** the Tally **popup** modal. `embed.js` loads lazily on
intent (hover/focus of a feedback entry point), and every entry point keeps the hosted form
URL (`https://tally.so/r/<id>?build=...&trigger=...`) as a real-link fallback so a click
still works if the widget hasn't loaded. The CSP carries the required
`script-src` / `connect-src` / `frame-src https://tally.so` entries.

**Env var:**

```
VITE_TALLY_FORM_URL=https://tally.so/r/xxxx
```

**In-app placement (me):**

- A small persistent "Feedback" link in the footer.
- A gentle, dismissible prompt after a **successful** conversion ("Worked? What are you using
  this for?") and after a **failed** one ("That did not work. Tell us what you tried?").
- Show once per visit; dismissal (or a submit) is remembered in-memory only, so a reload
  starts fresh. Never nag; the footer link stays available either way.

## Sentry (deferred)

Start with PostHog's built-in error tracking and an alert on a failure spike. Revisit Sentry
only if you want sharper grouping/alerting. If/when you do: browser SDK only (no server),
tie the Sentry **release** to `BUILD_COMMIT`, and upload source maps in the CI build step
(that needs a Sentry **auth token** as a real CI secret, unlike the public DSN).

## Copy + CSP housekeeping (ships with the first telemetry PR)

- Drop the literal "no analytics" claim (release notes / README) so nothing is contradicted.
- Keep the true, strong claim: your karaoke **files** never leave the device (conversion is
  100% local); anonymous usage + crash data help improve the tool.
- Add a one-line privacy note (and optionally a short `/privacy`).
- Consolidate the CSP `connect-src` additions for whatever ships.

## Env var summary

```
# .env (gitignored) and Cloudflare Pages build env. All VITE_* are public by design.
VITE_POSTHOG_KEY=phc_xxx
VITE_POSTHOG_HOST=https://us.i.posthog.com
VITE_TALLY_FORM_URL=https://tally.so/r/xxxx
```

A committed `.env.example` documents these. Missing values are treated as "feature off" so the
app still builds and runs (and dev stays quiet) when keys are absent.

## Suggested sequence

1. PostHog analytics (kills the silent-usage blind spot, gives the down/failure signal).
2. Tally feedback + newsletter -> Google Sheets (the who/why/features/bugs).
3. Copy + CSP housekeeping (can fold into 1 and 2).
4. Error alerting via PostHog now; Sentry later if needed.
