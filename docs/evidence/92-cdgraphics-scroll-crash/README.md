# #92: native pipeline crash on rips that scroll by a fine offset

Evidence for [issue #92](https://github.com/Karaokio/cdg2mp4/issues/92) and the fix in
`patches/cdgraphics+7.0.0.patch`. Everything here was captured on 2026-08-18 against build
065db03 (2.4.7) before the fix and the same tree with the patch applied after it.

## What the bug is

A CD+G file is a stream of small drawing commands. One of them, Scroll Preset / Scroll Copy,
can shift the whole 300x216 picture by a fine offset of up to 5 pixels sideways and 11 down.
`cdgraphics` (the decoder the fast WebCodecs pipeline uses) applies that shift by reading
each pixel from `pixels[(x + hOffset) + (y + vOffset) * 300]`. On the last rows and columns
that index runs past the end of the buffer, the read returns `undefined`, and the next line,
`const [r, g, b] = this.clut[undefined]`, throws
`TypeError: undefined is not iterable (cannot read property Symbol(Symbol.iterator))`. The
conversion stops with that message a few seconds in.

The pixels involved are in the border a real player never shows, so reading the nearest
in-range pixel instead loses nothing visible. Rips that set a border colour take a different
code path for those rows and never hit it, which is why most files were unaffected. ffmpeg's
own CD+G decoder handles the offset, which is why the same files converted on the fallback.

## Files

| File                            | What it shows                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0-posthog-failures.txt`        | The PostHog events: 13 native failures with a `TypeError` from 2 users, 2026-08-03 to 2026-08-16. Only the two after 2.4.6 carry the message, which is what made this diagnosable. The same user's same file ("MUD - TIGER FEET") fails on both 2026-08-03 and 2026-08-16.                                  |
| `1-unit-test-before.txt`        | `src/lib/webcodecs/cdgraphics.test.ts` on unpatched `cdgraphics@7.0.0`: 4 of 5 cases throw the exact production message. The one that passes is the case with a border colour set, matching the diagnosis.                                                                                                |
| `2-e2e-before-*`                | Branded Chrome against the unpatched preview build, converting `test/files/sample-scroll.cdg` + `sample.mp3` on `/?pipeline=webcodecs`: the UI shows the same alert users saw, 183 ms after the drop. Console log included; note the poster render also fails ("no cover art: undefined is not iterable"). |
| `3-unit-test-after.txt`         | The same 5 unit cases on the patched library: all pass.                                                                                                                                                                                                                                                    |
| `4-e2e-after-*`                 | Same browser run against the patched build: 8.13 s video, 1440x1080, cover art found. `4-e2e-after-frame-4s.png` is a frame from the output; the colour bars sit 4 rows higher than in `sample.cdg`, which is the scroll offset being applied.                                                              |
| `5-e2e-test-after.txt`          | The new Playwright test ("converts a rip that scrolls by a fine offset without a border colour") passing.                                                                                                                                                                                                  |
| `6-npm-ci-applies-patch.txt`    | A clean `npm ci` runs `postinstall` and applies the patch, so CI and Cloudflare Pages get the fixed library without any extra step.                                                                                                                                                                         |

## The fixture

`test/files/sample-scroll.cdg` is `sample.cdg` with two packets changed: the Border Preset
(packet 1) becomes the Memory Preset, and packet 2 becomes a Scroll Preset with a 4-row
vertical offset. The rip therefore never sets a border colour and scrolls immediately, the
same combination the field failures need. Three bytes differ from `sample.cdg`.

## The fix

`patches/cdgraphics+7.0.0.patch` changes one line in `renderFrame`, clamping the read to the
buffer edge:

```js
const E = Math.min(D + this.hOffset, this.WIDTH - 1),
  O = Math.min(c + this.vOffset, this.HEIGHT - 1),
  d = E + O * this.WIDTH;
```

`patch-package` applies it from `postinstall`. Bumping `cdgraphics` past 7.0.0 fails the
install until the patch is regenerated or removed.
