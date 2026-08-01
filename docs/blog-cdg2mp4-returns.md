# The CDG to MP4 converter is back, and this time it can't break

Back in 2019 I put up a little open-source tool that turned karaoke CDG files into MP4 videos. You uploaded a CDG zip, a server unzipped it, ran ffmpeg on it, stashed the result on Amazon S3, and handed you back a video. It was held together with a free-tier queue and a lot of optimism. It worked, mostly.

Then it didn't.

Some AWS billing and storage thing went sideways, the conversions started failing, and I was busy with everything else karaoke. Fixing it meant logging back into a console I'd half-forgotten, untangling S3 permissions, and babysitting a worker queue that existed only to run one command. So I did the responsible adult thing and... took the whole tool down. Sorry to everyone who emailed about it. You were right, it was useful, and it was gone.

Here's the part that finally bugged me enough to fix it.

## The whole backend existed to run one command

When I actually looked at the old code, the entire stack (the web server, the background queue, the S3 bucket, the Heroku add-ons) was there to do exactly one thing:

```
ffmpeg -i song.cdg -i song.mp3 ... song.mp4
```

That's it. One ffmpeg call, wrapped in a small mountain of infrastructure that could break, run up a bill, or hit a free-tier limit. Every piece that could fail was a piece I had to maintain. And the thing that did the real work, ffmpeg, didn't need any of it.

So I deleted all of it.

## The new version runs entirely in your browser

The converter is back, and it now runs 100% on your own device using [ffmpeg.wasm](https://ffmpegwasm.netlify.app/), which is a real build of ffmpeg compiled to WebAssembly. When you drop a file in, your browser does the conversion. Nothing uploads. There is no server, no S3, no queue, and no bill for me to forget about.

A few nice things fall out of that:

- **Your files stay with you.** They never get sent anywhere, because there is nowhere to send them.
- **It works offline.** Once the page loads, you can pull the network cable and it still converts.
- **It can't go down the way the old one did.** It's just a static page. There's no backend to break.
- **It's free, for real, forever.** No compute for me to pay for means nothing to ration.

## How to use it

1. Drag in a karaoke `.zip`, or a matching `.cdg` and `.mp3` together.
2. Pick a quality. It goes up to 1080p now, and the CDG art is scaled with a crisp, blocky upscale instead of a blurry one, which honestly looks better for this kind of retro pixel graphics.
3. Watch the progress bar. It shows a live estimate of how long is left so you're not just staring at a spinner.
4. Preview the video right there, then download it.

A typical song takes about a minute, a little longer at 1080p. The first conversion is a touch slower because your browser downloads the converter once (it's cached after that).

## A couple of honest notes

The converter is around 30 MB the first time, since it's a full ffmpeg. After the first run it's cached, so it's instant to load and genuinely works offline. Speed depends on your device, because the work is happening on your machine now instead of mine. That's the trade, and for this tool it's a good one.

It's still open source, and because it's now just static files, anyone can host their own copy in about two minutes.

The old version taught me a lesson I keep relearning: the simplest thing that works is the thing that's still working years later. This one has almost nothing to break, which is exactly how I want it.

Go convert something and sing badly. That's what it's for.

[ Try it at **cdg2mp4.com** ]

<!--
EDITOR NOTES (delete before publishing):
- Confirm the live URL. "cdg2mp4.com" is what the old code pointed at, but the new build
  is not deployed yet (PR #10 is still open). Swap in the real deploy URL.
- The AWS outage explanation is intentionally light/self-deprecating to match the old post.
  To avoid naming AWS, change "Some AWS billing and storage thing" to "some hosting thing".
- "Back in 2019" matches the original post date rather than guessing the tool's exact age.
- Suggested tags: karaoke, CDG, open source, webassembly, ffmpeg.
-->
