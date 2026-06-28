import * as React from "react";
import {
  feedbackEnabled,
  isFeedbackDismissed,
  dismissFeedback,
  hostedUrl,
  preloadTally,
  tallyReady,
  openPopup,
  type FeedbackContext,
} from "@/lib/feedback";
import { track } from "@/lib/analytics";

const ChatIcon = () => (
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
    <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8 8.38 8.38 0 0 1 8.5-8.5A8.38 8.38 0 0 1 21 11.5z" />
  </svg>
);

const CloseIcon = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const OfflineNote = () => (
  <span
    role="status"
    className="absolute left-1/2 top-full z-20 mt-sm w-[220px] -translate-x-1/2 rounded-md border border-border bg-surface px-md py-sm text-caption leading-snug text-text-muted shadow-medium"
  >
    Feedback needs an internet connection.
  </span>
);

// Shared trigger behavior: the element is a real link (the popup-block-proof floor); when
// the widget is ready we intercept and open the modal instead. Offline clicks are stopped
// with a hint rather than opening a doomed tab.
function useFeedbackTrigger(ctx: FeedbackContext, onSubmitted?: () => void) {
  const [offline, setOffline] = React.useState(false);

  React.useEffect(() => {
    if (!offline) return;
    const t = window.setTimeout(() => setOffline(false), 5000);
    return () => window.clearTimeout(t);
  }, [offline]);

  const onClick = (e: React.MouseEvent) => {
    track("feedback_opened", { trigger: ctx.trigger });
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      e.preventDefault();
      setOffline(true);
      return;
    }
    if (tallyReady()) {
      e.preventDefault();
      openPopup(ctx, onSubmitted);
    } else {
      // Not warmed yet: let the link open the hosted form this time, and start loading
      // the widget so the next click gets the in-page modal.
      preloadTally();
    }
  };

  const anchor = {
    href: hostedUrl(ctx),
    target: "_blank" as const,
    rel: "noopener noreferrer",
    onPointerEnter: preloadTally,
    onFocus: preloadTally,
    onClick,
  };

  return { anchor, offline };
}

/** Small "Share feedback" entry point in the footer. */
export function FeedbackLink() {
  const { anchor, offline } = useFeedbackTrigger({ trigger: "footer" });
  if (!feedbackEnabled) return null;
  return (
    <span className="relative inline-flex">
      <a
        {...anchor}
        className="inline-flex items-center gap-1 rounded-sm text-caption text-text-muted transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
      >
        <ChatIcon />
        Share feedback
      </a>
      {offline && <OfflineNote />}
    </span>
  );
}

/** A gentle, dismissible nudge shown after a conversion. */
export function FeedbackPrompt({
  result,
  resolution,
  input_type,
}: {
  result: "success" | "failure";
  resolution?: string;
  input_type?: string;
}) {
  const [dismissed, setDismissed] = React.useState(isFeedbackDismissed);
  const trigger = result === "success" ? "after_success" : "after_failure";
  // Submitting via the popup hides the live nudge too (not just on the next visit).
  const { anchor, offline } = useFeedbackTrigger({ trigger, result, resolution, input_type }, () =>
    setDismissed(true)
  );

  if (!feedbackEnabled || dismissed) return null;

  const message =
    result === "success"
      ? "How'd it go? Tell us what you're using cdg2mp4 for."
      : "That didn't work. Tell us what you tried?";

  const dismiss = () => {
    dismissFeedback();
    setDismissed(true);
  };

  return (
    <div className="relative flex items-center justify-center gap-2 text-sm text-text-muted">
      <a
        {...anchor}
        className="rounded-sm underline transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
      >
        {message}
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="rounded-sm p-0.5 leading-none transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
      >
        <CloseIcon />
      </button>
      {offline && <OfflineNote />}
    </div>
  );
}
