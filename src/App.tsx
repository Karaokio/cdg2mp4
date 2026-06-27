import { Converter } from "@/components/Converter";
import { OfflineStatus } from "@/components/OfflineStatus";
import { InstallPrompt } from "@/components/InstallPrompt";
import { SocialLinks } from "@/components/SocialLinks";
import { Label } from "@/components/ui";

export default function App() {
  return (
    <div className="min-h-full bg-background">
      <main className="mx-auto flex max-w-[720px] flex-col gap-xl px-lg py-3xl">
        <header className="text-center">
          <img src="/logo_karaokio.png" alt="Karaokio" className="mx-auto mb-lg w-[200px]" />
          <Label>CDG · MP3 → MP4</Label>
          <h1 className="mt-sm font-display text-3xl font-black tracking-tight">
            Karaoke Video Converter
          </h1>
          <p className="mx-auto mt-md max-w-[36rem] text-lg text-text-muted">
            Turn a CDG+MP3 karaoke file into a shareable MP4 video,<br />
            right in your browser.
          </p>
        </header>

        <Converter />

        <div className="flex flex-wrap items-center justify-center gap-sm">
          <OfflineStatus />
          <InstallPrompt />
        </div>

        <footer className="flex flex-col items-center gap-md text-center text-sm text-text-muted">
          <p>
            Runs entirely in your browser · works offline · powered by{" "}
            <a
              className="text-brand-label underline"
              href="https://ffmpegwasm.netlify.app/"
              target="_blank"
              rel="noreferrer"
            >
              ffmpeg.wasm
            </a>
          </p>
          <SocialLinks />
          <p className="text-caption text-text-muted">
            built by the robots at{" "}
            <a
              className="underline transition-colors hover:text-brand"
              href="https://lilrobo.xyz"
              target="_blank"
              rel="noreferrer"
            >
              lilrobo.xyz
            </a>{" "}
            in sunny san diego
          </p>
        </footer>
      </main>
    </div>
  );
}
