// Where finished MP4s go in batch mode. Two implementations: per-item
// auto-download (works everywhere), and File System Access directory writes
// (Chromium only) which stream to disk and keep memory flat at any batch size.

export interface SaveTarget {
  readonly kind: "download" | "directory";
  /** Persist one output. Resolving means the bytes may be released. */
  save(name: string, blob: Blob): Promise<void>;
}

// Minimal ambient typing: showDirectoryPicker isn't in lib.dom for all targets.
type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (opts?: {
    mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
};

export const supportsDirectorySave = (): boolean =>
  typeof window !== "undefined" && "showDirectoryPicker" in window;

/** Trigger a browser download and revoke the URL once the download owns it. */
export function autoDownloadTarget(): SaveTarget {
  return {
    kind: "download",
    async save(name, blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.rel = "noopener";
      a.click();
      // Immediate revoke races the download start in some browsers; the
      // download keeps its own reference once it has begun.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
  };
}

/**
 * Ask the user for a folder (must be called from a user gesture). Returns null
 * if they dismiss the picker. The readwrite grant persists for the session, so
 * later saves need no further gesture.
 */
export async function pickDirectoryTarget(): Promise<SaveTarget | null> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) return null;
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await picker.call(window, { mode: "readwrite" });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null; // user dismissed
    throw e;
  }
  return {
    kind: "directory",
    async save(name, blob) {
      const file = await dir.getFileHandle(name, { create: true });
      const writable = await file.createWritable();
      await writable.write(blob);
      await writable.close();
    },
  };
}
