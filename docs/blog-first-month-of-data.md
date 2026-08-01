# A month of finally knowing who uses my karaoke tool

For seven years, the only analytics on my CDG to MP4 converter was people emailing me when it broke. That was the whole feedback loop: silence meant it worked, an inbox full of "hey, the converter is down" meant it didn't.

When I rebuilt the tool this summer (with Claude doing most of the typing, as covered in the relaunch post), I decided to fix that too. I set up PostHog for the first time. I'd never put product analytics on anything I've built. One month in, the data has already changed what I'm building next.

## What I track, and what I don't

The rebuilt converter runs entirely in your browser. Files never upload, because there's no server to upload to. So the analytics can't see your files either. What I record is events: a conversion started, it succeeded or failed, a download happened. Each event carries the output filename (the name only, never the contents), the resolution, and how long the song was. There are no accounts; all I see is an anonymous browser ID and the coarse country your IP resolves to.

That turns out to be enough to learn a lot.

## The numbers, one month in

Since June 27:

- 111 people used the tool, from 15+ countries
- 617 conversions started, 490 succeeded
- 456 of those got downloaded, so almost nobody converts a song and walks away
- 20 people installed it as an offline app
- The average song is about 3 minutes 48 seconds

Failures are mostly people dropping the wrong files, not the converter breaking. Half of a CDG pair, a zip with no .cdg inside, that kind of thing. After years of finding out about problems via email, watching a failure counter sit near zero is a new feeling.

## Five people did most of it

I expected a long tail of one-song users. Instead, five people account for 86% of the recent conversions, and each one is working through an entire library.

- Someone in Florida converted 181 songs over a weekend: Queen, Journey, Prince, Meat Loaf, Sinatra. A whole classic-rock collection.
- A user in the UK did 60, almost all 50s and 60s oldies, with filenames tagged by the old commercial karaoke disc labels they were ripped from.
- An Australian user converted 25 tracks straight off Sound Choice discs, filenames still carrying the disc catalog numbers.
- Someone in Canada converted 18 songs and 15 of them were Teddy Swims.
- A user in Mexico worked through a Spanish-language catalog, plus a cluster in Peru that put through over 100 songs earlier in the month.

Four of the five share a pattern: they own commercial CD+G disc collections and are digitizing them for modern playback. The disc catalog codes are right there in the filenames. CD+G was how karaoke shipped for decades, those discs are sitting in binders all over the world, and nothing modern plays them.

## What to build next

Every one of those five users has duplicates in their conversion list. The same song converted two or three times. With no batch mode, they're feeding songs in one at a time and losing track of what they've already done. Someone sat through 181 individual conversions.

So that's the next feature, and I didn't need a survey or a user interview to find it. Five anonymous power users and their duplicate conversions made the case.

## On adding analytics to a hobby project

I resisted this for years, partly on privacy instinct and partly because a free tool for karaoke nerds didn't seem worth instrumenting. Both instincts were half right. The privacy concern shaped the setup (names of files, never files; countries, never identities) rather than killing it. And the small scale turned out to be the point: at 111 users, the data is five specific people digitizing five specific record collections. You can read it like a story.

If you've got a small tool in the world and no idea who uses it, instrument it. The free tier is more than enough at this scale, and finding out that your users are real people with binders full of karaoke discs beats silence.

Go convert something and sing badly. That's what it's for.

[ Try it at **cdg2mp4.com** ]

<!--
EDITOR NOTES (delete before publishing):
- Confirm the live URL before publishing.
- Data window: analytics live since 2026-06-27; numbers pulled 2026-07-27. Refresh before
  publishing if it slips.
- Locations are deliberately coarse (state/country). City-level data exists but shouldn't
  be published.
- "with Claude doing most of the typing" links best to the relaunch post; add the link.
- The Teddy Swims line is accurate (15 of 18 conversions). Kept because it's charming.
- Suggested tags: karaoke, analytics, posthog, side projects, CDG.
-->
