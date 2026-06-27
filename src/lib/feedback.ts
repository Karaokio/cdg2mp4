import { BUILD_COMMIT } from "./buildInfo";
import { track } from "./analytics";

// Tally feedback popup. Off unless a form URL is configured (so dev/local/tests
// stay quiet). The widget script is loaded lazily on first use, not up front.
const FORM_URL = import.meta.env.VITE_TALLY_FORM_URL;
export const feedbackEnabled = !!FORM_URL;
const FORM_ID = FORM_URL ? FORM_URL.replace(/\/+$/, "").split("/").pop()! : "";

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
  if (window.Tally) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = EMBED_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null; // let a later click retry
      reject(new Error("Tally widget failed to load"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export type FeedbackTrigger = "footer" | "after_success" | "after_failure";

export type FeedbackContext = {
  trigger: FeedbackTrigger;
  resolution?: string;
  input_type?: string;
  result?: string;
};

function hiddenFields(ctx: FeedbackContext): Record<string, string> {
  const f: Record<string, string> = { build: BUILD_COMMIT, trigger: ctx.trigger };
  if (ctx.resolution) f.resolution = ctx.resolution;
  if (ctx.input_type) f.input_type = ctx.input_type;
  if (ctx.result) f.result = ctx.result;
  return f;
}

// If the widget can't load (blocked/offline), fall back to the hosted form; Tally
// reads the same hidden fields from the URL query string.
function openInNewTab(ctx: FeedbackContext): void {
  const u = new URL(FORM_URL!);
  for (const [k, v] of Object.entries(hiddenFields(ctx))) u.searchParams.set(k, v);
  window.open(u.toString(), "_blank", "noopener");
}

function markDismissed(): void {
  try {
    localStorage.setItem(FEEDBACK_DISMISSED_KEY, "1");
  } catch {
    /* private mode / storage disabled: ignore */
  }
}

/** Open the Tally feedback popup (falls back to a new tab if the widget is blocked). */
export async function openFeedback(ctx: FeedbackContext): Promise<void> {
  if (!feedbackEnabled) return;
  track("feedback_opened", { trigger: ctx.trigger });
  try {
    await loadTally();
  } catch {
    openInNewTab(ctx);
    return;
  }
  window.Tally!.openPopup(FORM_ID, {
    layout: "modal",
    width: 600,
    emoji: { text: "🎶", animation: "wave" },
    autoClose: 2000,
    doNotShowAfterSubmit: true,
    hiddenFields: hiddenFields(ctx),
    onSubmit: () => {
      markDismissed(); // stop nudging once they've told us something
      track("feedback_submitted", { trigger: ctx.trigger });
    },
  });
}

export function feedbackDismissed(): boolean {
  try {
    return localStorage.getItem(FEEDBACK_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}
