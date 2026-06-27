import * as React from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
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
    } catch {
      /* leave state as-is; the pill will simply stay on "Save for offline" */
    } finally {
      setPreparing(false);
      await refresh();
    }
  };

  const clearOffline = async () => {
    await caches.delete(CORE_CACHE);
    await refresh();
  };

  const pill = "inline-flex items-center gap-sm rounded-pill border border-border bg-surface px-md py-[6px] text-sm shadow-subtle";

  // Update available: amber, tap to reload into the new version.
  if (needRefresh) {
    return (
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className={cn(pill, "font-medium text-text transition-colors hover:border-brand")}
      >
        <Dot className="bg-spotlight" pulse />
        Update ready, tap to reload
      </button>
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
        <button
          type="button"
          onClick={clearOffline}
          title="Remove the cached converter (~30 MB)"
          className="ml-xs rounded-sm px-1 text-text-muted underline-offset-2 hover:text-brand hover:underline"
        >
          Clear
        </button>
      </span>
    );
  }

  // Not cached yet: invite the user to make it offline-ready.
  return (
    <button
      type="button"
      onClick={downloadForOffline}
      title="Download the converter (~30 MB) so it works offline next time"
      className={cn(pill, "text-text-muted transition-colors hover:border-brand hover:text-text")}
    >
      <Dot className="bg-text-muted/50" />
      Save for offline
    </button>
  );
}
