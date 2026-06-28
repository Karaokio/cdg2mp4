// A tiny shared signal for "is a conversion running right now". The Converter sets
// it; the service-worker auto-update (OfflineStatus) reads it so it can hold off on
// reloading the page until the app is idle (a reload mid-conversion would throw the
// work away).
let converting = false;
const listeners = new Set<() => void>();

export function setConverting(value: boolean): void {
  if (value === converting) return;
  converting = value;
  listeners.forEach((l) => l());
}

export function isConverting(): boolean {
  return converting;
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function subscribeConverting(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
