# Credits and licences

cdg2mp4 converts karaoke files in your browser. It does that with other people's
work. This page lists what that work is, who wrote it, and the terms it comes
under.

Two of the licences below carry obligations we have to meet, not just courtesy:
the ffmpeg core is GPL, and mediabunny is MPL. Both are named as such, linked to
their upstream source, and shipped unmodified. Where to get that source is in
each entry.

## The conversion

Whichever converter runs on your device (see the footer, or the browser
console), these are the parts doing the work.

### Native pipeline

| Component                                                                  | Licence     | What it does                                                                                                                                 |
| -------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [cdgraphics](https://github.com/bhj/cdgraphics)                            | ISC         | Renders CD+G graphics to a canvas. By [bhj](https://github.com/bhj), also the author of [Karaoke Eternal](https://www.karaoke-eternal.com/). |
| [mediabunny](https://github.com/Vanilagy/mediabunny)                       | **MPL-2.0** | Muxes the MP4 and drives the WebCodecs encoders. By [Vanilagy](https://github.com/Vanilagy).                                                 |
| [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder) | n/a         | Your browser's own H.264 encoder. Part of the browser, not something we ship.                                                                |

mediabunny is covered by the [Mozilla Public License 2.0](https://www.mozilla.org/en-US/MPL/2.0/).
We ship it unmodified. Its source is at
[github.com/Vanilagy/mediabunny](https://github.com/Vanilagy/mediabunny) and on
[npm](https://www.npmjs.com/package/mediabunny); the exact version we bundle is
pinned in [package.json](package.json).

### Fallback pipeline

| Component                                                   | Licence                                | What it does                                                                                                                                          |
| ----------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ffmpeg.wasm](https://ffmpegwasm.netlify.app/)              | MIT (`@ffmpeg/ffmpeg`, `@ffmpeg/util`) | The browser wrapper around the core.                                                                                                                  |
| [`@ffmpeg/core`](https://github.com/ffmpegwasm/ffmpeg.wasm) | **GPL-2.0-or-later**                   | FFmpeg compiled to WebAssembly, including [x264](https://www.videolan.org/developers/x264.html), which is why the whole core is GPL rather than LGPL. |

The core we serve from `/ffmpeg/<version>/` is the unmodified published build of
`@ffmpeg/core`, gzipped so it fits the host's file size limit and decompressed
in your browser. It is covered by the
[GNU General Public License v2 or later](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
Its corresponding source is at
[github.com/ffmpegwasm/ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm),
which builds on [FFmpeg](https://ffmpeg.org/) and
[x264](https://code.videolan.org/videolan/x264); the exact version is pinned in
[package.json](package.json).

## Everything else

| Component                                            | Licence                   | What it does                                             |
| ---------------------------------------------------- | ------------------------- | -------------------------------------------------------- |
| [fflate](https://github.com/101arrowz/fflate)        | MIT                       | Unzips the karaoke `.zip` in the browser.                |
| [React](https://react.dev/)                          | MIT                       | UI.                                                      |
| [Vite](https://vite.dev/)                            | MIT                       | Build.                                                   |
| [Tailwind CSS](https://tailwindcss.com/)             | MIT                       | Styling.                                                 |
| [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) | MIT                       | Offline support and installability.                      |
| [Radix UI](https://www.radix-ui.com/)                | MIT                       | Accessible UI primitives.                                |
| [PostHog](https://posthog.com/)                      | Apache-2.0 (`posthog-js`) | Anonymous usage analytics. See [PRIVACY.md](PRIVACY.md). |

Fonts: [Unbounded](https://fonts.google.com/specimen/Unbounded),
[Saira Semi Condensed](https://fonts.google.com/specimen/Saira+Semi+Condensed),
[Hanken Grotesk](https://fonts.google.com/specimen/Hanken+Grotesk) and
[Geist Mono](https://vercel.com/font), all under the
[SIL Open Font License](https://openfontlicense.org/), self-hosted via
[Fontsource](https://fontsource.org/).

## The format

CD+G is a 1980s CD subcode format with no official public specification. The
renderers everyone uses, including this one, descend from
[Jim Bumgardner's CD+G Revealed](http://jbum.com/cdg_revealed.html), which
reverse-engineered and documented it.

## This project

cdg2mp4 itself is by [Karaokio](https://karaokio.com). Source at
[github.com/Karaokio/cdg2mp4](https://github.com/Karaokio/cdg2mp4).

If we have got an attribution wrong or missed one, please
[open an issue](https://github.com/Karaokio/cdg2mp4/issues) and we will fix it.
