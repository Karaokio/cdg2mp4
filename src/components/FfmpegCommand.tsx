import * as React from "react";
import { Button } from "@/components/ui";
import { RESOLUTIONS, type ResKey } from "@/lib/format";
import { track } from "@/lib/analytics";

/** Filenames to substitute into the command; placeholders fill any gaps. */
export type CommandNames = { cdg?: string; mp3?: string };

/** Each command parameter with a plain-language explanation. */
const EXPLAIN: [flag: string, what: string][] = [
  ["-i song.cdg", "the graphics input; ffmpeg reads CDG karaoke files natively"],
  ["-i song.mp3", "the audio input"],
  ["-r 30", "output frame rate: 30 frames per second"],
  [
    "-vf scale=…:flags=neighbor",
    "upscale the low-res CDG picture with nearest-neighbor, keeping the pixel art crisp instead of blurry; the size follows the quality picker above",
  ],
  ["-c:v libx264", "encode the video as H.264, playable everywhere"],
  ["-pix_fmt yuv420p", "the pixel format Safari and QuickTime require"],
  ["-c:a aac -b:a 192k", "re-encode the audio to AAC at 192 kbps"],
  ["-shortest", "stop when the shorter of the two inputs ends"],
  ["song.mp4", "the output file"],
];

/**
 * A collapsed disclosure for advanced users: the equivalent ffmpeg command to
 * run the conversion locally. Uses the user's real filenames and selected
 * resolution when known. Differences from the in-browser command are
 * deliberate: no -preset veryfast (that is a wasm speed concession) and an
 * explicit -b:a 192k (local users likely care about audio quality).
 */
export function FfmpegCommand({ resolution, names }: { resolution: ResKey; names?: CommandNames }) {
  const [copied, setCopied] = React.useState(false);
  const size = RESOLUTIONS[resolution].replace("x", ":");
  const cdg = names?.cdg ?? "song.cdg";
  const mp3 = names?.mp3 ?? "song.mp3";
  const out = cdg.replace(/\.cdg$/i, ".mp4");
  const cmd = `ffmpeg -i "${cdg}" -i "${mp3}" -r 30 -vf "scale=${size}:flags=neighbor" -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest "${out}"`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      track("command_copied", {
        resolution,
        real_names: Boolean(names?.cdg ?? names?.mp3),
      });
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable; the text is still selectable */
    }
  };

  return (
    <details
      className="text-sm text-text-muted"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open)
          track("command_disclosure_opened", { resolution });
      }}
    >
      <summary className="cursor-pointer list-none text-center underline decoration-dotted underline-offset-4 hover:text-text">
        Prefer the command line?
      </summary>
      <div className="mt-md flex flex-col gap-sm text-left">
        <p>
          This site uses ffmpeg compiled for your browser. The same conversion on your own machine:
        </p>
        <div className="flex items-center gap-sm">
          <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words rounded-[3px] bg-background-sunken px-md py-sm font-mono text-xs leading-relaxed text-brand-label">
            <code>{cmd}</code>
          </pre>
          <Button variant="secondary" type="button" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <details
          onToggle={(e) => {
            if ((e.target as HTMLDetailsElement).open) track("command_explain_opened");
          }}
        >
          <summary className="cursor-pointer list-none text-xs underline decoration-dotted underline-offset-4 hover:text-text">
            Explain the command
          </summary>
          <dl className="mt-sm grid grid-cols-[auto_1fr] gap-x-md gap-y-[6px] text-xs">
            {EXPLAIN.map(([flag, what]) => (
              <React.Fragment key={flag}>
                <dt className="font-mono whitespace-nowrap">{flag}</dt>
                <dd>{what}</dd>
              </React.Fragment>
            ))}
          </dl>
        </details>

        <div className="mt-sm flex flex-col gap-[2px] text-xs">
          <p>
            Install{" "}
            <a
              href="https://ffmpeg.org/download.html"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-text"
            >
              ffmpeg
            </a>{" "}
            first to run the command:
          </p>
          <ul className="flex list-disc flex-col gap-[2px] pl-xl">
            <li>
              <code className="font-mono">brew install ffmpeg</code> on Mac
            </li>
            <li>
              <code className="font-mono">winget install ffmpeg</code> on Windows
            </li>
          </ul>
          <p className="mt-sm">
            Converting a .zip? Extract it first to get the separate{" "}
            <code className="font-mono">.cdg</code> and <code className="font-mono">.mp3</code>{" "}
            files the command needs.
          </p>
          <p className="mt-sm">
            Need more help? Email{" "}
            <a href="mailto:support@karaokio.com" className="underline hover:text-text">
              support@karaokio.com
            </a>
            .
          </p>
        </div>
      </div>
    </details>
  );
}
