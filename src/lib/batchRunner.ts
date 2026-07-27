// The batch store and its sequential runner. Module-scope (the converting.ts /
// ffmpeg.ts idiom) so the loop survives React re-renders and StrictMode's
// double effects: the loop is only ever started from user actions (enqueue /
// retry), never from an effect, and `running` plus ffmpeg's own busy flag make
// it single-flight.

import { convertCdgToMp4, cancelConversion, recycleFFmpeg } from "./ffmpeg";
import { extractPairFromZip, pairFromFiles, ZipPairError } from "./zip";
import { resolutionToSize, type ResKey } from "./format";
import { setConverting } from "./converting";
import { classifyBatch, inputLabel, type BatchInput, type Held } from "./inputFiles";
import {
  reduce,
  initialState,
  nextQueued,
  activeItem,
  counts,
  type QueueState,
  type Action,
  type EnqueueInput,
  type SavedVia,
} from "./queue";
import { autoDownloadTarget, type SaveTarget } from "./saveTarget";
import {
  trackConversionStarted,
  trackConversionSucceeded,
  trackConversionFailed,
  trackConversionCancelled,
  trackBatchStarted,
  trackBatchCompleted,
  trackBatchCancelled,
  track,
  classifyError,
  errorDetail,
  cdgSongSeconds,
  fileName,
  mbBucket,
  type InputType,
} from "./analytics";

let state: QueueState = initialState;
const listeners = new Set<() => void>();
let saveTarget: SaveTarget = autoDownloadTarget();
// The one item whose cancellation was requested (vs a failure), and whether a
// Stop batch swept everything.
let cancelRequestedId: string | null = null;
// Conversions since the last worker recycle; reset the wasm high-water mark
// every RECYCLE_EVERY items (memory only grows within an instance).
let sinceRecycle = 0;
const RECYCLE_EVERY = 10;

export function getState(): QueueState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function dispatch(action: Action): void {
  state = reduce(state, action);
  listeners.forEach((l) => l());
}

const read = async (f: File) => new Uint8Array(await f.arrayBuffer());

const inputType = (source: BatchInput<File>): InputType => source.type;

const inputNames = (source: BatchInput<File>) =>
  source.type === "zip"
    ? { zip_name: fileName(source.zip.name) }
    : { cdg_name: fileName(source.cdg.name), mp3_name: fileName(source.mp3.name) };

const inputSize = (source: BatchInput<File>) =>
  source.type === "zip" ? source.zip.size : source.cdg.size + source.mp3.size;

/** Session dedupe key: expected output stem + input byte size. Two discs can
 * both ship a "Track01"; the size check keeps them distinct. */
const dedupeKey = (source: BatchInput<File>) =>
  `${inputLabel(source).toLowerCase()}|${inputSize(source)}`;

export function setSaveTarget(target: SaveTarget): void {
  saveTarget = target;
  track("save_target_selected", { kind: target.kind });
  notifyOnly();
}

export function getSaveTarget(): SaveTarget {
  return saveTarget;
}

// Some UI (the save-target chip) reads module state outside the reducer.
function notifyOnly(): void {
  listeners.forEach((l) => l());
}

/** Classify a drop and feed it to the queue. Returns what the UI must surface
 * (leftovers / rejects) — enqueueing itself needs no further attention. */
export function enqueueFiles(
  files: File[],
  held: Held<File> | null,
  resolution: ResKey
): ReturnType<typeof classifyBatch<File>> {
  const classified = classifyBatch(files, held);
  if (classified.items.length > 0) {
    const inputs: EnqueueInput[] = classified.items.map((source) => ({
      id: crypto.randomUUID(),
      source,
      label: inputLabel(source),
      dedupeKey: dedupeKey(source),
      resolution,
    }));
    dispatch({ type: "enqueue", inputs });
    void ensureRunning(classified);
  }
  return classified;
}

export function retryItem(id: string): void {
  const item = state.items.find((it) => it.id === id);
  if (!item) return;
  track("batch_item_retried", {
    batch_id: state.batchId ?? undefined,
    from_phase: item.state.phase,
  });
  dispatch({ type: "retry", id });
  void ensureRunning();
}

/** Cancel one item: a queued row just flips; the converting row kills the worker. */
export function cancelItem(id: string): void {
  const item = state.items.find((it) => it.id === id);
  if (!item) return;
  if (item.state.phase === "queued") {
    dispatch({ type: "item-cancelled", id, at: Date.now() });
  } else if (item.state.phase === "converting") {
    cancelRequestedId = id;
    cancelConversion();
  }
}

/** Stop batch: clear the queue, then kill the in-flight item. */
export function cancelAll(): void {
  const c = counts(state);
  trackBatchCancelled({
    batch_id: state.batchId ?? "none",
    done_count: c.done,
    remaining_count: c.queued + c.converting,
  });
  dispatch({ type: "cancel-queued" });
  const active = activeItem(state);
  if (active) cancelItem(active.id);
}

/** Back to the empty dropzone ("Convert another" / clear finished batch). */
export function resetQueue(): void {
  if (state.preview) URL.revokeObjectURL(state.preview.url);
  dispatch({ type: "reset" }); // keeps the session's dedupe memory
}

/** Test hook: also restores the default save target. */
export function __resetForTests(): void {
  state = initialState;
  saveTarget = autoDownloadTarget();
  cancelRequestedId = null;
  sinceRecycle = 0;
  listeners.clear();
}

async function ensureRunning(classified?: ReturnType<typeof classifyBatch<File>>): Promise<void> {
  if (state.running) return;
  const batchId = crypto.randomUUID();
  dispatch({ type: "run-started", batchId, at: Date.now() });
  const startedAt = Date.now();
  if (state.mode === "batch") {
    const c = counts(state);
    trackBatchStarted({
      batch_id: batchId,
      item_count: c.total,
      zip_count: state.items.filter((it) => it.source.type === "zip").length,
      pair_count: state.items.filter((it) => it.source.type === "pair").length,
      leftover_count: classified?.leftovers.length ?? 0,
      duplicate_count: c.skipped,
      resolution: state.items[0]?.resolution ?? "1080p",
    });
  }
  setConverting(true); // hold SW auto-update reloads for the whole drain
  try {
    let item;
    while ((item = nextQueued(state))) {
      await runItem(item.id, batchId);
      if (++sinceRecycle >= RECYCLE_EVERY) {
        recycleFFmpeg();
        sinceRecycle = 0;
      }
    }
  } finally {
    setConverting(false);
    const c = counts(state);
    if (state.mode === "batch") {
      trackBatchCompleted({
        batch_id: batchId,
        item_count: c.total,
        done_count: c.done,
        failed_count: c.failed,
        cancelled_count: c.cancelled,
        skipped_count: c.skipped,
        duration_ms: Date.now() - startedAt,
        save_target: saveTarget.kind,
      });
    }
    dispatch({ type: "run-drained" });
  }
}

/** Convert one item. Never throws — every outcome lands in the reducer. */
async function runItem(id: string, batchId: string): Promise<void> {
  const item = state.items.find((it) => it.id === id);
  if (!item) return;
  const batch = state.mode === "batch";
  const batchProps = batch
    ? { batch_id: batchId, batch_index: item.batchIndex, batch_size: state.items.length }
    : {};
  const names = inputNames(item.source);
  const type = inputType(item.source);
  const t0 = Date.now();
  let stage = "read";
  let convertStartedAt: number | null = null;
  let lastProgress = 0;
  let outputName: string | undefined;

  dispatch({ type: "item-converting", id, at: t0 });
  trackConversionStarted({
    input_type: type,
    resolution: item.resolution,
    ...names,
    ...batchProps,
  });
  try {
    const pair =
      item.source.type === "zip"
        ? extractPairFromZip(await read(item.source.zip))
        : pairFromFiles(
            await read(item.source.cdg),
            await read(item.source.mp3),
            item.source.cdg.name
          );
    outputName = fileName(`${pair.baseName}.mp4`);

    // Second duplicate check for zips: the real stem lives inside the archive,
    // so a renamed copy of an already-converted zip is caught here. Batch only,
    // like enqueue-time dedupe: a lone re-drop is a deliberate re-conversion.
    const realKey = `${pair.baseName.toLowerCase()}|${inputSize(item.source)}`;
    if (batch && item.source.type === "zip" && state.completedKeys.has(realKey)) {
      dispatch({ type: "item-skipped", id, duplicateOf: realKey });
      track("batch_item_skipped_duplicate", { batch_id: batchId, output_name: outputName });
      return;
    }

    const songSeconds = cdgSongSeconds(pair.cdg.byteLength);
    stage = "load";
    dispatch({ type: "item-stage", id, stage: "load" });
    const mp4 = await convertCdgToMp4(pair.cdg, pair.mp3, {
      size: resolutionToSize(item.resolution),
      onProgress: (r) => {
        stage = "convert";
        lastProgress = r;
        if (convertStartedAt == null) convertStartedAt = Date.now();
        const elapsed = (Date.now() - convertStartedAt) / 1000;
        const eta = r > 0.03 && elapsed > 1.5 ? (elapsed * (1 - r)) / r : 0;
        dispatch({ type: "item-progress", id, progress: r, eta });
      },
    });

    const blob = new Blob([mp4 as BlobPart], { type: "video/mp4" });
    const name = `${pair.baseName}.mp4`;
    let savedVia: SavedVia = "preview";
    if (batch) {
      await saveTarget.save(name, blob);
      savedVia = saveTarget.kind;
    }
    // One retained output only: revoke the previous preview before swapping.
    if (state.preview) URL.revokeObjectURL(state.preview.url);
    dispatch({
      type: "item-done",
      id,
      at: Date.now(),
      outputName: name,
      sizeBytes: blob.size,
      savedVia,
      preview: { url: URL.createObjectURL(blob), name },
      extraKey: item.source.type === "zip" ? realKey : undefined,
    });
    trackConversionSucceeded({
      input_type: type,
      resolution: item.resolution,
      duration_ms: Date.now() - t0,
      song_seconds: songSeconds,
      output_mb_bucket: mbBucket(blob.size),
      ...names,
      output_name: outputName,
      ...batchProps,
    });
  } catch (e) {
    if (cancelRequestedId === id) {
      cancelRequestedId = null;
      dispatch({ type: "item-cancelled", id, at: Date.now() });
      trackConversionCancelled({
        input_type: type,
        resolution: item.resolution,
        stage,
        progress_pct: Math.round(lastProgress * 100),
        duration_ms: Date.now() - t0,
        ...names,
        ...batchProps,
      });
      return;
    }
    const message = e instanceof Error ? e.message : String(e);
    dispatch({ type: "item-failed", id, at: Date.now(), message, reason: classifyError(message) });
    trackConversionFailed({
      input_type: type,
      resolution: item.resolution,
      stage,
      reason: classifyError(message),
      ...errorDetail(e),
      zip_extensions: e instanceof ZipPairError ? e.extensions?.join(",") : undefined,
      ...names,
      output_name: outputName,
      ...batchProps,
    });
  }
}
