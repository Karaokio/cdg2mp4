import { BUILD_COMMIT } from "./buildInfo";
import { track } from "./analytics";

// Tally feedback. Off unless a form URL is configured (so dev/local/tests stay quiet).
// The widget script loads lazily on intent (hover/focus/click), not up front.
const FORM_URL = import.meta.env.VITE_TALLY_FORM_URL;
export const feedbackEnabled = !!FORM_URL;
// Robustly take the last path segment of the form URL, ignoring any query/hash.
const FORM_ID = FORM_URL ? (new URL(FORM_URL).pathname.split("/").filter(Boolean).pop() ?? "") : "";

export const FEEDBACK_DISMISSED_KEY = "cdg2mp4_feedback_dismissed";

declare global {
  interface Window {
    Tally?: {
      openPopup: (formId: string, options?: Record<string, unknown>) => void;
      closePopup: (formId: string) => void;
    };
  }
}

const EMBED_SRC = "https://tally.so/widgets/embed.js";
let scriptPromise: Promise<void> | null = null;

function loadTally(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Tally) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = EMBED_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null; // let a later attempt retry
      reject(new Error("Tally widget failed to load"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** Warm the widget ahead of a click (on hover/focus) so the modal is ready in time. */
export function preloadTally(): void {
  if (feedbackEnabled) void loadTally().catch(() => {});
}

export function tallyReady(): boolean {
  return typeof window !== "undefined" && !!window.Tally;
}

export type FeedbackTrigger = "footer" | "after_success" | "after_failure";
export type FeedbackContext = {
  trigger: FeedbackTrigger;
  resolution?: string;
  input_type?: string;
  result?: string;
};

function fields(ctx: FeedbackContext): Record<string, string> {
  const f: Record<string, string> = { build: BUILD_COMMIT, trigger: ctx.trigger };
  if (ctx.resolution) f.resolution = ctx.resolution;
  if (ctx.input_type) f.input_type = ctx.input_type;
  if (ctx.result) f.result = ctx.result;
  return f;
}

/**
 * The hosted form URL with the context as query params. Used as a real-link floor so a
 * click is never popup-blocked: when the in-page widget is ready we open the modal and
 * preventDefault; otherwise the browser just follows this link (Tally reads the same
 * fields from the query string).
 */
export function hostedUrl(ctx: FeedbackContext): string {
  if (!FORM_URL) return "#";
  const u = new URL(FORM_URL);
  for (const [k, v] of Object.entries(fields(ctx))) u.searchParams.set(k, v);
  return u.toString();
}

export function markDismissed(): void {
  try {
    localStorage.setItem(FEEDBACK_DISMISSED_KEY, "1");
  } catch {
    /* storage disabled: ignore */
  }
}

export function feedbackDismissed(): boolean {
  try {
    return localStorage.getItem(FEEDBACK_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Open the in-page Tally modal. Assumes the widget is loaded (see tallyReady). */
export function openPopup(ctx: FeedbackContext, onSubmitted?: () => void): void {
  if (!window.Tally) return;
  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.Tally.openPopup(FORM_ID, {
    layout: "modal",
    width: 600,
    emoji: reduceMotion ? undefined : { text: "🎶", animation: "wave" },
    autoClose: 2000,
    doNotShowAfterSubmit: true,
    hiddenFields: fields(ctx),
    onSubmit: () => {
      markDismissed();
      track("feedback_submitted", { trigger: ctx.trigger });
      onSubmitted?.();
    },
  });
}
