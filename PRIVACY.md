# Privacy

cdg2mp4 converts karaoke files **entirely in your browser**. Your **file contents are never
uploaded** anywhere, there is no backend, and there is no account. To improve the tool we
collect a small amount of anonymous usage data and any feedback you choose to send.

## What we collect

**Anonymous product analytics** (via [PostHog](https://posthog.com), US region)

- Conversion events: started / succeeded / failed, with properties like the chosen
  resolution, input type (zip vs. file pair), how long it took, and a coarse output-size
  bucket.
- The **filenames** involved (the `.zip` / `.cdg` / `.mp3` you drop in, and the resulting
  `.mp4`), which are metadata about the files, never their contents.
- A few app interactions: download, save/remove offline, install, update.
- Standard analytics context (approximate location from IP, browser/device, referrer). We do
  not ask for your name or set you up with an account. Known bot/headless traffic is filtered
  out.

**Feedback you submit** (via [Tally](https://tally.so))

- Only what you type into the feedback form, plus the build and context (e.g. whether a
  conversion succeeded) it was sent from. Email is optional and only used to reply or send
  updates if you provide it. Submissions land in a private spreadsheet.

## What we do **not** collect

- The contents of your `.cdg`, `.mp3`, `.zip`, or the resulting `.mp4`. Conversion is 100%
  local; those bytes never leave your device.
- Exact file sizes (only coarse buckets).
- Any account or login information (there is no account).

## Notes

- The feedback form opens as an **in-page popup loaded from Tally** (`tally.so`); clicking
  "Share feedback" loads Tally's widget script into the page. If it can't load (for example
  with an ad/tracking blocker, or offline), the form opens as a normal page instead.
- Analytics and feedback are **off in development** and only active when their keys are
  configured for the deployed site.
- We use third-party processors (PostHog, Tally, and the email tool a newsletter may use).
  Your feedback email, if provided, may be stored there.

Questions? Reach us via any of the links in the app footer.
