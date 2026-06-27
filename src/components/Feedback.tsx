import * as React from "react";
import {
  feedbackEnabled,
  feedbackDismissed,
  openFeedback,
  FEEDBACK_DISMISSED_KEY,
} from "@/lib/feedback";

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

/** Small "Share feedback" button for the footer. Opens the Tally popup. */
export function FeedbackLink() {
  if (!feedbackEnabled) return null;
  return (
    <button
      type="button"
      onClick={() => void openFeedback({ trigger: "footer" })}
      className="inline-flex items-center gap-1 rounded-sm text-caption text-text-muted transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
    >
      <ChatIcon />
      Share feedback
    </button>
  );
}

/** A gentle, dismissible nudge shown after a conversion. Opens the popup with context. */
export function FeedbackPrompt({
  result,
  resolution,
  input_type,
}: {
  result: "success" | "failure";
  resolution?: string;
  input_type?: string;
}) {
  const [dismissed, setDismissed] = React.useState(feedbackDismissed);
  if (!feedbackEnabled || dismissed) return null;

  const trigger = result === "success" ? "after_success" : "after_failure";
  const message =
    result === "success"
      ? "How'd it go? Tell us what you're using cdg2mp4 for."
      : "That didn't work. Tell us what you tried?";

  const dismiss = () => {
    try {
      localStorage.setItem(FEEDBACK_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="flex items-center justify-center gap-2 text-sm text-text-muted">
      <button
        type="button"
        onClick={() => void openFeedback({ trigger, result, resolution, input_type })}
        className="rounded-sm underline transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
      >
        {message}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="rounded-sm p-0.5 leading-none transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
      >
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
      </button>
    </div>
  );
}
