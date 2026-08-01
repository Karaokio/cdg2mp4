/// <reference lib="webworker" />
/**
 * Worker wrapper around the native pipeline.
 *
 * One worker per conversion, spawned and killed by src/lib/webcodecs.ts. That
 * keeps this file to a single request/response: there is no cancel message,
 * because terminating the worker is both instant and complete, and no state to
 * reset between runs, because there is never a second run.
 */

import { encodeCdgToMp4 } from "./encode";

export type WorkerRequest = {
  cdg: Uint8Array;
  mp3: Uint8Array;
  size: string;
};

export type WorkerResponse =
  | { type: "progress"; ratio: number }
  | { type: "audio-codec"; codec: "aac" | "mp3" }
  // `poster` is the title screen when the rip has one, for the player to show
  // instead of a black frame 0. It is already embedded in `buffer` as cover art;
  // this copy saves the main thread demuxing it back out.
  | { type: "done"; buffer: ArrayBuffer; poster: ArrayBuffer | null; posterType: string }
  | { type: "error"; message: string; name: string };

const post = (message: WorkerResponse, transfer?: Transferable[]) =>
  transfer ? self.postMessage(message, transfer) : self.postMessage(message);

// A view's backing buffer may be larger than the view, and transferring it would
// hand over bytes that are not ours. Slice unless the view already owns all of it.
const toTransferable = (view: Uint8Array): ArrayBuffer =>
  view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
    ? (view.buffer as ArrayBuffer)
    : (view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { cdg, mp3, size } = event.data;
  try {
    // Report at most once per output frame; the main thread throttles paints.
    const { buffer, poster } = await encodeCdgToMp4(
      cdg,
      mp3,
      size,
      (ratio) => post({ type: "progress", ratio }),
      (codec) => post({ type: "audio-codec", codec })
    );
    // The poster's bytes are a standalone buffer, so transfer rather than copy.
    const image = poster ? toTransferable(poster.data) : null;
    post(
      { type: "done", buffer, poster: image, posterType: poster?.mimeType ?? "" },
      image ? [buffer, image] : [buffer]
    );
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    post({ type: "error", message: error.message, name: error.name });
  }
};
