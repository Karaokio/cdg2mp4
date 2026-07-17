import { Converter } from "@/components/Converter";
import { OfflineStatus } from "@/components/OfflineStatus";
import { InstallPrompt } from "@/components/InstallPrompt";
import { SocialLinks } from "@/components/SocialLinks";
import { BuildInfo } from "@/components/BuildInfo";
import { FeedbackLink } from "@/components/Feedback";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Label } from "@/components/ui";
import { track } from "@/lib/analytics";

const MailIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </svg>
);

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
            Turn a CDG+MP3 karaoke file into a shareable MP4 video,
            <br />
            right in your browser.
          </p>
        </header>

        <div className="relative">
          {/* Corner of the card, on the Quality picker row. */}
          <ThemeToggle className="absolute right-[var(--card-padding)] top-[var(--card-padding)] z-10" />
          <Converter />
        </div>

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
          <div className="flex items-center gap-3">
            <FeedbackLink />
            <a
              className="inline-flex items-center gap-1 text-caption text-text-muted transition-colors hover:text-brand"
              href="mailto:support@karaokio.com"
              onClick={() => track("email_clicked", { trigger: "footer" })}
            >
              <MailIcon />
              Email Us
            </a>
            <a
              className="text-caption text-text-muted underline-offset-2 transition-colors hover:text-brand hover:underline"
              href="https://github.com/Karaokio/cdg2mp4/blob/main/PRIVACY.md"
              target="_blank"
              rel="noreferrer"
            >
              Privacy
            </a>
          </div>
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
          <BuildInfo />
        </footer>
      </main>
    </div>
  );
}
