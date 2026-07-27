// The batch queue's state and pure transitions. No DOM, no ffmpeg, no
// analytics — the runner (batchRunner.ts) owns those side effects and drives
// this reducer. Testable with plain objects, like inputFiles.ts.

import type { BatchInput } from "./inputFiles";
import type { ResKey } from "./format";

export type ConvertStage = "read" | "load" | "convert";

export type ItemState =
  | { phase: "queued" }
  | { phase: "converting"; stage: ConvertStage; progress: number; eta: number }
  | { phase: "done"; outputName: string; sizeBytes: number; savedVia: SavedVia }
  | { phase: "failed"; message: string; reason: string }
  | { phase: "cancelled" }
  | { phase: "skipped"; duplicateOf: string };

/** How a finished item's bytes left memory (or didn't, in single mode). */
export type SavedVia = "download" | "directory" | "preview";

export interface QueueItem {
  id: string;
  source: BatchInput<File>;
  /** Display stem (zip filename stem, or the cdg's). */
  label: string;
  /** Session-scoped duplicate key: output stem + input size. */
  dedupeKey: string;
  resolution: ResKey;
  state: ItemState;
  batchIndex: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface QueueState {
  items: QueueItem[];
  /** "single" renders today's UI; "batch" (2+ items ever) shows queue chrome. */
  mode: "single" | "batch";
  /** The one retained output (last finished), for preview. */
  preview: { url: string; name: string; itemId: string } | null;
  /** Dedupe keys of everything finished this session. Survives queue clears so
   * "already converted this session" means the session, not the current list. */
  completedKeys: ReadonlySet<string>;
  running: boolean;
  batchId: string | null;
  batchStartedAt: number | null;
}

export const initialState: QueueState = {
  items: [],
  mode: "single",
  preview: null,
  completedKeys: new Set(),
  running: false,
  batchId: null,
  batchStartedAt: null,
};

export type EnqueueInput = {
  id: string;
  source: BatchInput<File>;
  label: string;
  dedupeKey: string;
  resolution: ResKey;
};

export type Action =
  | { type: "enqueue"; inputs: EnqueueInput[] }
  | { type: "run-started"; batchId: string; at: number }
  | { type: "run-drained" }
  | { type: "item-converting"; id: string; at: number }
  | { type: "item-stage"; id: string; stage: ConvertStage }
  | { type: "item-progress"; id: string; progress: number; eta: number }
  | {
      type: "item-done";
      id: string;
      at: number;
      outputName: string;
      sizeBytes: number;
      savedVia: SavedVia;
      preview: { url: string; name: string } | null;
      /** A second dedupe key to claim (a zip's real inner stem). */
      extraKey?: string;
    }
  | { type: "item-skipped"; id: string; duplicateOf: string }
  | { type: "item-failed"; id: string; at: number; message: string; reason: string }
  | { type: "item-cancelled"; id: string; at: number }
  | { type: "retry"; id: string }
  | { type: "cancel-queued" }
  | { type: "reset" };

const terminal = (s: ItemState) => !(s.phase === "queued" || s.phase === "converting");

/** Duplicate keys already claimed: completed this session, in flight, or queued. */
function claimedKeys(state: Pick<QueueState, "items" | "completedKeys">): Set<string> {
  const keys = new Set<string>(state.completedKeys);
  for (const it of state.items) {
    if (!terminal(it.state)) keys.add(it.dedupeKey);
  }
  return keys;
}

function patch(items: QueueItem[], id: string, up: (it: QueueItem) => QueueItem): QueueItem[] {
  return items.map((it) => (it.id === id ? up(it) : it));
}

export function reduce(state: QueueState, action: Action): QueueState {
  switch (action.type) {
    case "enqueue": {
      // In single mode a fresh drop replaces a finished (terminal) item, the
      // way today's "drop again after done" starts over. Batch mode appends.
      const base =
        state.mode === "single" && state.items.every((it) => terminal(it.state))
          ? {
              ...initialState,
              preview: state.preview,
              completedKeys: state.completedKeys,
              running: state.running,
            }
          : state;
      const keys = claimedKeys(base);
      // A lone fresh drop is a deliberate re-conversion: dedupe protects
      // batches from accidental repeats, it must not veto a single-song drop.
      const dedupeApplies = base.items.length > 0 || action.inputs.length > 1;
      const nextIndex = base.items.length;
      const added = action.inputs.map((input, i): QueueItem => {
        const dupe = dedupeApplies && keys.has(input.dedupeKey);
        if (!dupe) keys.add(input.dedupeKey);
        return {
          id: input.id,
          source: input.source,
          label: input.label,
          dedupeKey: input.dedupeKey,
          resolution: input.resolution,
          state: dupe ? { phase: "skipped", duplicateOf: input.dedupeKey } : { phase: "queued" },
          batchIndex: nextIndex + i,
        };
      });
      const items = [...base.items, ...added];
      return {
        ...base,
        items,
        mode: items.length >= 2 ? "batch" : base.mode,
      };
    }
    case "run-started":
      return { ...state, running: true, batchId: action.batchId, batchStartedAt: action.at };
    case "run-drained":
      return { ...state, running: false };
    case "item-converting":
      return {
        ...state,
        items: patch(state.items, action.id, (it) => ({
          ...it,
          state: { phase: "converting", stage: "read", progress: 0, eta: 0 },
          startedAt: action.at,
        })),
      };
    case "item-stage":
      return {
        ...state,
        items: patch(state.items, action.id, (it) =>
          it.state.phase === "converting"
            ? { ...it, state: { ...it.state, stage: action.stage } }
            : it
        ),
      };
    case "item-progress":
      return {
        ...state,
        items: patch(state.items, action.id, (it) =>
          it.state.phase === "converting"
            ? {
                ...it,
                state: {
                  phase: "converting",
                  stage: "convert",
                  progress: action.progress,
                  eta: action.eta,
                },
              }
            : it
        ),
      };
    case "item-done": {
      const done = state.items.find((it) => it.id === action.id);
      const items = patch(state.items, action.id, (it) => ({
        ...it,
        state: {
          phase: "done" as const,
          outputName: action.outputName,
          sizeBytes: action.sizeBytes,
          savedVia: action.savedVia,
        },
        finishedAt: action.at,
      }));
      let completedKeys = state.completedKeys;
      if (done) {
        const next = new Set(completedKeys).add(done.dedupeKey);
        if (action.extraKey) next.add(action.extraKey);
        completedKeys = next;
      }
      return {
        ...state,
        items,
        completedKeys,
        preview: action.preview ? { ...action.preview, itemId: action.id } : state.preview,
      };
    }
    case "item-skipped":
      return {
        ...state,
        items: patch(state.items, action.id, (it) => ({
          ...it,
          state: { phase: "skipped", duplicateOf: action.duplicateOf },
        })),
      };
    case "item-failed":
      return {
        ...state,
        items: patch(state.items, action.id, (it) => ({
          ...it,
          state: { phase: "failed", message: action.message, reason: action.reason },
          finishedAt: action.at,
        })),
      };
    case "item-cancelled":
      return {
        ...state,
        items: patch(state.items, action.id, (it) => ({
          ...it,
          state: { phase: "cancelled" },
          finishedAt: action.at,
        })),
      };
    case "retry": {
      // Reset to queued and move to the tail so it runs after current work.
      const item = state.items.find((it) => it.id === action.id);
      if (!item || !terminal(item.state)) return state;
      const rest = state.items.filter((it) => it.id !== action.id);
      return {
        ...state,
        items: [
          ...rest,
          { ...item, state: { phase: "queued" }, startedAt: undefined, finishedAt: undefined },
        ],
      };
    }
    case "cancel-queued":
      return {
        ...state,
        items: state.items.map((it) =>
          it.state.phase === "queued" ? { ...it, state: { phase: "cancelled" } } : it
        ),
      };
    case "reset":
      // The dedupe memory is the session's, not the queue's: it survives Clear.
      return { ...initialState, completedKeys: state.completedKeys };
  }
}

// ---- Selectors (pure) ----

export const nextQueued = (state: QueueState): QueueItem | undefined =>
  state.items.find((it) => it.state.phase === "queued");

export const activeItem = (state: QueueState): QueueItem | undefined =>
  state.items.find((it) => it.state.phase === "converting");

export interface Counts {
  total: number;
  queued: number;
  converting: number;
  done: number;
  failed: number;
  cancelled: number;
  skipped: number;
}

export function counts(state: QueueState): Counts {
  const c: Counts = {
    total: state.items.length,
    queued: 0,
    converting: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
  };
  for (const it of state.items) c[it.state.phase] += 1;
  return c;
}

/**
 * Batch seconds remaining: mean wall time of completed items x items still
 * waiting, plus the active item's own estimate. 0 until one item has finished
 * (no basis for a number yet — the UI hides it).
 */
export function batchEtaSeconds(state: QueueState): number {
  const done = state.items.filter(
    (it) => it.state.phase === "done" && it.startedAt != null && it.finishedAt != null
  );
  if (done.length === 0) return 0;
  const mean =
    done.reduce((sum, it) => sum + ((it.finishedAt ?? 0) - (it.startedAt ?? 0)), 0) /
    done.length /
    1000;
  const queued = state.items.filter((it) => it.state.phase === "queued").length;
  const active = activeItem(state);
  const activeLeft =
    active?.state.phase === "converting" && active.state.eta > 0 ? active.state.eta : mean / 2;
  return queued * mean + (active ? activeLeft : 0);
}
