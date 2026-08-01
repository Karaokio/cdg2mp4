# I deleted ffmpeg from my karaoke converter and it got 11x faster

My CDG to MP4 converter has run on ffmpeg.wasm since I rebuilt it. That is the real FFmpeg, compiled to WebAssembly, downloaded into your browser, doing the transcode on your own machine so your files never touch a server. It works. It is also a 31MB download and, on a three minute song, close to three minutes of waiting.

Worse, for some people it never worked at all.

## The 16 sessions that never had a chance

When I put analytics on the tool, I found a stubborn group of failures. Out of 136 conversion sessions, 16 never succeeded. Not "failed once and retried", never succeeded.

They clustered. Every Chrome 109 session on Windows: zero successes, eight failures. Every Firefox 115 session: zero out of three. Those are the last browser versions you can run on Windows 7 and 8.1, which means old PCs.

The cause turned out to be one line in how `@ffmpeg/core` ships. It is built with SIMD, and browsers disable WebAssembly SIMD on CPUs without SSE4.1, an instruction set Intel added in 2007. So the core fails to compile before it ever reads the user's file. No retry helps. No other browser helps. The machine cannot run it.

I shipped an honest error message for that, which told those users the truth and gave them an ffmpeg command to run locally. It was better than a lie. It was still a dead end.

## The browser already has an encoder

I had been ignoring the obvious. Every modern browser already ships an H.264 encoder, sitting behind an API called WebCodecs, usually hardware accelerated. It has nothing to do with WebAssembly, so the SIMD problem does not apply, and there is nothing to download because it is part of the browser you already opened.

So the new pipeline has no ffmpeg in it at all:

- `cdgraphics`, a JavaScript CD+G renderer, draws each frame to a canvas
- the canvas gets scaled up with nearest-neighbour, keeping the pixel art crisp
- `VideoEncoder` encodes H.264 natively
- `mediabunny` muxes it into an MP4

ffmpeg.wasm is still there as the fallback, for Firefox before 130, Safari before 16.4, and anything where the H.264 config gets rejected. The app checks and picks. Most people will never see the wasm path again.

## The numbers

Same song, same machine, same 1080p output. A 188 second track:

| | time | size |
|---|---|---|
| WebCodecs | 15.0s | 6.1 MB |
| ffmpeg.wasm | 171.6s | 4.7 MB |

Eleven times faster, and that is on a fast laptop where ffmpeg.wasm behaves well. On a slower machine I saw the native path take 51 seconds, which is still a different category of experience from sitting through three minutes.

The file is about 30% bigger. I measured that carefully and decided to keep it, because the native output is slightly *higher* quality than the old one against a lossless reference. x264 has better rate control than the browser's encoder, and matching its file size means giving up more quality than it does. I would rather ship the better picture.

## The bug I only found because I was chasing file size

At first the gap was much worse: not 30% bigger, over three times bigger. I spent a while poking at bitrates and keyframe intervals and getting nowhere, which is usually the sign that you are measuring the wrong thing.

I finally decoded a single frame and counted the colours in it. The source frame has 5 colours. Flat pixel art, one background, some text. ffmpeg's output had 2,317, which is normal compression noise. Mine had **31,461**.

That is not a compression problem. That is a rendering problem.

CD+G lets a title declare its background colour transparent, and I was drawing each frame onto the canvas with `drawImage`, which composites by default. So nothing a transparent pixel covered ever got erased. Every lyric line was still sitting there under the next one, three minutes of accumulated text, and the encoder was faithfully spending bits on the smear.

The fix is one line: set the canvas to `copy` instead of blending. Average per-pixel error against a lossless render went from 38 (out of 255) to 0.61. File size dropped 24% as a side effect.

I only noticed because I was chasing bytes. Nobody had complained, and I had watched the output play back without seeing it. That is a good argument for measuring things you think are fine.

## Fidelity, because I did not want to guess

The whole plan rests on a JavaScript renderer matching ffmpeg's CD+G decoder. So I rendered a real karaoke rip both ways and compared them pixel by pixel: 97% of frames came out bit for bit identical, and every frame that differed was off by less than 0.1% of its pixels, always a fraction of one 6x12 tile where a lyric highlight landed on either side of a sampling boundary.

Getting there taught me something about ffmpeg I did not know. Its `fps` filter rounds to nearest, so `-r 30` samples the *middle* of each frame's display interval, not the start. My first attempt sampled the start and matched 27% of frames. One packet of correction took it to 97%.

## What you actually see

Nothing, ideally. Drop a zip, get a video, faster. The footer credits whichever engine is doing the work on your device. If you open the console, the converter now narrates itself:

```
[cdg2mp4] pipeline: webcodecs · native H.264 encoder, nothing to download
[cdg2mp4] converting TRKD1502.zip at 1080p (1440x1080)
[cdg2mp4] 5646 frames at 30fps · 188.2s of audio, 187.0s of graphics
[cdg2mp4] done in 51.3s · 5.3 MB, 3.6x realtime
```

And if the new pipeline ever fails on your machine, the error screen offers you the old one. One click, same files. I did not want a settings toggle asking people to choose between "WebCodecs" and "ffmpeg", because that is not a question anyone should have to answer to convert a karaoke track. But I did not want to strand anyone either.

The 8 Chrome 109 sessions are the ones I am watching. Those machines have WebCodecs. They will fall back to a software H.264 encoder, which is native code and does not care about SSE4.1, so it should work. Should. I do not own a 2006 PC, so I will find out from the data.

Go convert something and sing badly. That is what it is for.

[ Try it at **cdg2mp4.com** ]

<!--
EDITOR NOTES (delete before publishing):
- Numbers: 15.0s / 171.6s / 6.1 MB / 4.7 MB are same-machine (M-series laptop, Chromium 149)
  on TRKD1502, a 188s rip. The 51.3s / 5.3 MB figures are a real run on a different, slower
  machine in branded Chrome, which is why they differ. Do not mix the two into one comparison.
- The 136 sessions / 16 failures / Chrome 109 / Firefox 115 numbers are from the PostHog
  data behind issue #78. Refresh before publishing if the window has moved.
- "over three times bigger" was 15.9 MB pre-fix at the 2s keyframe default. Left vague on
  purpose since the keyframe interval also changed in the same stretch of work.
- Link targets to add: issue #78, the #77 SIMD post if that ever got written, MDN VideoEncoder,
  cdgraphics and mediabunny on npm.
- Suggested tags: karaoke, webcodecs, ffmpeg, browsers, side projects, CDG.
-->
