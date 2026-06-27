import * as React from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Tooltip } from "@/components/ui";
import { cn } from "@/lib/utils";

// The heavy ffmpeg core is runtime-cached under this name (see vite.config.ts).
const base = import.meta.env.BASE_URL;
const CORE_URLS = [`${base}ffmpeg/ffmpeg-core.js`, `${base}ffmpeg/ffmpeg-core.wasm`];
const CORE_CACHE = "ffmpeg-core";
const CORE_WASM = CORE_URLS[1];

async function isCoreCached(): Promise<boolean> {
  if (!("caches" in window)) return false;
  try {
    const cache = await caches.open(CORE_CACHE);
    return !!(await cache.match(CORE_WASM));
  } catch {
    return false;
  }
}

// The service worker writes to the cache slightly after the fetch resolves, so
// poll briefly instead of checking once (which races and misses).
async function waitForCached(timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await isCoreCached()) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  </svg>
);

const Dot = ({ className, pulse }: { className: string; pulse?: boolean }) => (
  <span
    className={cn(
      "inline-block h-2 w-2 shrink-0 rounded-full",
      className,
      pulse && "[animation:breathe_2s_ease-in-out_infinite]"
    )}
  />
);

export function OfflineStatus() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const supported =
    typeof navigator !== "undefined" && "serviceWorker" in navigator && "caches" in window;

  const [cached, setCached] = React.useState(false);
  const [preparing, setPreparing] = React.useState(false);

  const refresh = React.useCallback(async () => setCached(await isCoreCached()), []);

  React.useEffect(() => {
    if (!supported) return;
    void refresh();
    // The core also gets cached as a side effect of the first conversion, so
    // poll to reflect that without the user doing anything.
    const id = window.setInterval(refresh, 4000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [supported, refresh]);

  if (!supported) return null;

  const downloadForOffline = async () => {
    setPreparing(true);
    try {
      // Same-origin fetches flow through the service worker and populate the cache.
      await Promise.all(CORE_URLS.map((u) => fetch(u, { cache: "reload" })));
      // Stay on "Saving…" until the cache actually reflects it, then flip to green.
      setCached(await waitForCached(8000));
    } catch {
      /* leave state as-is; the pill will simply stay on "Save for offline" */
    } finally {
      setPreparing(false);
    }
  };

  const clearOffline = async () => {
    await caches.delete(CORE_CACHE);
    await refresh();
  };

  const pill = "inline-flex min-h-[34px] items-center gap-sm rounded-pill border border-border bg-surface px-md text-sm shadow-subtle";

  // Update available: amber, tap to reload into the new version.
  if (needRefresh) {
    return (
      <Tooltip label="A newer version of the app is ready. Tap to reload into it.">
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className={cn(pill, "font-medium text-text transition-colors hover:border-brand")}
        >
          <Dot className="bg-spotlight" pulse />
          Update ready, tap to reload
        </button>
      </Tooltip>
    );
  }

  if (preparing) {
    return (
      <span className={cn(pill, "text-text-muted")}>
        <Dot className="bg-spotlight" pulse />
        Saving for offline…
      </span>
    );
  }

  // Cached: green, fully usable offline. Offer to reclaim the space.
  if (cached) {
    return (
      <span className={cn(pill, "text-text")}>
        <Dot className="bg-success" />
        <span className="font-medium">Available offline</span>
        <Tooltip label="Delete the saved converter and free ~30 MB. You can save it again anytime.">
          <button
            type="button"
            onClick={clearOffline}
            className="inline-flex items-center gap-1 rounded-pill border border-border px-2 py-0.5 text-text-muted transition-colors hover:border-brand hover:text-brand"
          >
            <TrashIcon />
            Remove
          </button>
        </Tooltip>
      </span>
    );
  }

  // Not cached yet: invite the user to make it offline-ready.
  return (
    <Tooltip label="Download the converter (~30 MB) so it works offline next time">
      <button
        type="button"
        onClick={downloadForOffline}
        className={cn(pill, "text-text-muted transition-colors hover:border-brand hover:text-text")}
      >
        <Dot className="bg-text-muted/50" />
        Save for offline
      </button>
    </Tooltip>
  );
}
