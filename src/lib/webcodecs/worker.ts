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
  | { type: "done"; buffer: ArrayBuffer }
  | { type: "error"; message: string; name: string };

const post = (message: WorkerResponse, transfer?: Transferable[]) =>
  transfer ? self.postMessage(message, transfer) : self.postMessage(message);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { cdg, mp3, size } = event.data;
  try {
    // Report at most once per output frame; the main thread throttles paints.
    const buffer = await encodeCdgToMp4(cdg, mp3, size, (ratio) =>
      post({ type: "progress", ratio })
    );
    post({ type: "done", buffer }, [buffer]);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    post({ type: "error", message: error.message, name: error.name });
  }
};
