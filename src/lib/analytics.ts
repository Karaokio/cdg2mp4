import posthog from "posthog-js";
import { APP_NAME, BUILD_COMMIT } from "./buildInfo";

// PostHog product analytics. Off unless a publishable project key is configured,
// so dev, local builds, and tests stay silent. The key is a client-side key by
// design (baked into the bundle); there is nothing secret here.
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";

let enabled = false;

/** Initialise PostHog once, only when a key is present. Safe to call anywhere. */
export function initAnalytics(): void {
  if (enabled || !KEY || typeof window === "undefined") return;
  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: "identified_only", // anonymous tool; never call identify
    autocapture: false, // only the named events below, keeps the data clean + quota low
    capture_pageview: true,
    capture_pageleave: false,
    disable_session_recording: true,
    capture_exceptions: true, // auto-report uncaught errors + unhandled rejections
  });
  // Tag every event with the app name + exact build (see src/lib/buildInfo.ts).
  posthog.register({ app: APP_NAME, build: BUILD_COMMIT });
  enabled = true;
}

type Props = Record<string, string | number | boolean | undefined>;

/** Capture an event. No-ops when analytics is disabled. */
export function track(event: string, props?: Props): void {
  if (!enabled) return;
  posthog.capture(event, props);
}

/** Report a caught error (e.g. from the React error boundary). No-ops when disabled. */
export function captureException(error: unknown, props?: Props): void {
  if (!enabled) return;
  posthog.captureException(error, props);
}

export type InputType = "zip" | "pair"; // a .zip, or a loose .cdg + .mp3 file pair

export const trackConversionStarted = (p: { input_type: InputType; resolution: string }) =>
  track("conversion_started", p);

export const trackConversionSucceeded = (p: {
  input_type: InputType;
  resolution: string;
  duration_ms: number;
  output_mb_bucket: string;
  file_name?: string; // the input filename (file contents never leave the device)
}) => track("conversion_succeeded", p);

export const trackConversionFailed = (p: {
  input_type: InputType;
  resolution: string;
  stage: string;
  reason: string;
  file_name?: string;
}) => track("conversion_failed", p);

/** The input filename (base name, no extension), trimmed and length-capped. */
export function fileName(baseName: string | undefined): string | undefined {
  const name = baseName?.trim();
  return name ? name.slice(0, 120) : undefined;
}

/** Coarse size buckets so an exact (potentially identifying) file size is never stored. */
export function mbBucket(bytes: number): string {
  const mb = bytes / 1048576;
  if (mb < 5) return "<5";
  if (mb < 20) return "5-20";
  if (mb < 50) return "20-50";
  return "50+";
}

/** Map an error message to a low-cardinality reason code (messages are generic, no PII). */
export function classifyError(message: string): string {
  if (/already in progress/i.test(message)) return "busy";
  if (/load the converter/i.test(message)) return "load_failed";
  if (/exit code/i.test(message)) return "ffmpeg_error";
  if (/empty file/i.test(message)) return "empty_output";
  if (/zip|find a/i.test(message)) return "bad_zip";
  if (/Drop a karaoke|matching/i.test(message)) return "bad_input";
  return "unknown";
}
