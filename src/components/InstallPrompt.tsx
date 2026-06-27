import * as React from "react";
import { cn } from "@/lib/utils";

// Not in the DOM lib types yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true);

const isIOS = () =>
  typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

// Touch devices have a "home screen"; desktops "install an app".
const touchLabel = () =>
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
    ? "Add to Home Screen"
    : "Install app";

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </svg>
);

const pill =
  "inline-flex items-center gap-sm rounded-pill border px-md py-[6px] text-sm font-medium shadow-subtle transition-colors";

export function InstallPrompt() {
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = React.useState(isStandalone);
  const [showIosHint, setShowIosHint] = React.useState(false);
  const [label, setLabel] = React.useState(touchLabel);

  React.useEffect(() => {
    setLabel(touchLabel());
    const onPrompt = (e: Event) => {
      e.preventDefault(); // suppress the mini-infobar; we drive install from our button
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  // Chromium / Android / desktop Chrome: real one-tap install.
  if (deferred) {
    const install = async () => {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null); // a prompt can only be used once
    };
    return (
      <button
        type="button"
        onClick={install}
        className={cn(pill, "border-border bg-surface text-text hover:border-brand hover:text-brand")}
      >
        <HomeIcon />
        {label}
      </button>
    );
  }

  // iOS Safari fires no install event, but users can add to the home screen by hand.
  if (isIOS()) {
    return (
      <span className="relative inline-flex">
        <button
          type="button"
          onClick={() => setShowIosHint((v) => !v)}
          className={cn(pill, "border-border bg-surface text-text hover:border-brand hover:text-brand")}
        >
          <HomeIcon />
          Add to Home Screen
        </button>
        {showIosHint && (
          <span className="absolute bottom-full left-1/2 mb-sm w-[230px] -translate-x-1/2 rounded-md border border-border bg-surface px-md py-sm text-sm text-text-muted shadow-medium">
            In Safari, tap the Share button, then choose <span className="font-medium text-text">Add to Home Screen</span>.
          </span>
        )}
      </span>
    );
  }

  // Other browsers (e.g. Firefox/desktop Safari): no install path, show nothing.
  return null;
}
