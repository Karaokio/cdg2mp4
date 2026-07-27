import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./ffmpeg", () => ({
  convertCdgToMp4: vi.fn(async () => new Uint8Array([1, 2, 3])),
  cancelConversion: vi.fn(),
  recycleFFmpeg: vi.fn(),
}));

import { convertCdgToMp4, cancelConversion, recycleFFmpeg } from "./ffmpeg";
import {
  enqueueFiles,
  getState,
  cancelItem,
  cancelAll,
  retryItem,
  setSaveTarget,
  __resetForTests,
} from "./batchRunner";
import type { SaveTarget } from "./saveTarget";

// A tiny but valid-enough input: pairFromFiles only checks non-emptiness.
const file = (name: string) => new File([new Uint8Array([1, 2])], name);

const flush = () => new Promise((r) => setTimeout(r, 0));
const untilDrained = async () => {
  for (let i = 0; i < 300 && getState().running; i++) await flush();
};

beforeEach(() => {
  __resetForTests();
  vi.mocked(convertCdgToMp4).mockClear();
  vi.mocked(convertCdgToMp4).mockImplementation(async () => new Uint8Array([1, 2, 3]));
  vi.mocked(cancelConversion).mockReset();
  vi.mocked(recycleFFmpeg).mockClear();
  URL.createObjectURL ??= () => "blob:stub";
  URL.revokeObjectURL ??= () => undefined;
});

afterEach(() => {
  __resetForTests();
});

describe("batchRunner", () => {
  it("converts queued items sequentially, in order", async () => {
    const order: string[] = [];
    vi.mocked(convertCdgToMp4).mockImplementation(async () => {
      order.push("run");
      return new Uint8Array([1]);
    });
    // Auto-download would touch the DOM; use a no-op target.
    setSaveTarget({ kind: "download", save: async () => {} } as SaveTarget);
    enqueueFiles([file("a.cdg"), file("a.mp3"), file("b.cdg"), file("b.mp3")], null, "480p");
    await untilDrained();
    const s = getState();
    expect(s.items.map((i) => i.state.phase)).toEqual(["done", "done"]);
    expect(order).toHaveLength(2);
    expect(s.mode).toBe("batch");
  });

  it("continues past a failing item", async () => {
    vi.mocked(convertCdgToMp4)
      .mockImplementationOnce(async () => {
        throw new Error("The converter failed (ffmpeg exit code 1).");
      })
      .mockImplementationOnce(async () => new Uint8Array([1]));
    setSaveTarget({ kind: "download", save: async () => {} } as SaveTarget);
    enqueueFiles([file("a.cdg"), file("a.mp3"), file("b.cdg"), file("b.mp3")], null, "480p");
    await untilDrained();
    const phases = getState().items.map((i) => i.state.phase);
    expect(phases).toEqual(["failed", "done"]);
    const failed = getState().items[0].state;
    expect(failed.phase === "failed" && failed.reason).toBe("ffmpeg_error");
  });

  it("appends mid-run and the same drain picks the new item up", async () => {
    let release!: () => void;
    vi.mocked(convertCdgToMp4).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(new Uint8Array([1]));
        })
    );
    setSaveTarget({ kind: "download", save: async () => {} } as SaveTarget);
    enqueueFiles([file("a.cdg"), file("a.mp3")], null, "480p");
    await flush();
    expect(getState().running).toBe(true);
    enqueueFiles([file("b.cdg"), file("b.mp3")], null, "480p");
    expect(getState().items).toHaveLength(2);
    release();
    await untilDrained();
    expect(getState().items.map((i) => i.state.phase)).toEqual(["done", "done"]);
    expect(getState().running).toBe(false);
  });

  it("marks duplicates skipped at enqueue (same name and size)", async () => {
    setSaveTarget({ kind: "download", save: async () => {} } as SaveTarget);
    enqueueFiles(
      [file("a.cdg"), file("a.mp3"), file("a.cdg"), file("a.mp3")],
      null,
      "480p"
      // Same drop dedupes by stem+kind first (classifyBatch), so make two drops:
    );
    enqueueFiles([file("a.cdg"), file("a.mp3")], null, "480p");
    await untilDrained();
    const phases = getState().items.map((i) => i.state.phase);
    expect(phases).toContain("skipped");
  });

  it("cancelling the active item marks it cancelled, not failed, and continues", async () => {
    let rejectRun!: (e: Error) => void;
    vi.mocked(convertCdgToMp4)
      .mockImplementationOnce(
        () =>
          new Promise((_, rej) => {
            rejectRun = rej;
          })
      )
      .mockImplementationOnce(async () => new Uint8Array([1]));
    vi.mocked(cancelConversion).mockImplementation(() =>
      rejectRun(new Error("called FFmpeg.terminate()"))
    );
    setSaveTarget({ kind: "download", save: async () => {} } as SaveTarget);
    enqueueFiles([file("a.cdg"), file("a.mp3"), file("b.cdg"), file("b.mp3")], null, "480p");
    await flush();
    const active = getState().items.find((i) => i.state.phase === "converting");
    expect(active).toBeDefined();
    cancelItem(active!.id);
    await untilDrained();
    expect(getState().items.map((i) => i.state.phase)).toEqual(["cancelled", "done"]);
  });

  it("cancelAll clears queued items and stops the drain", async () => {
    let rejectRun!: (e: Error) => void;
    vi.mocked(convertCdgToMp4).mockImplementationOnce(
      () =>
        new Promise((_, rej) => {
          rejectRun = rej;
        })
    );
    vi.mocked(cancelConversion).mockImplementation(() =>
      rejectRun(new Error("called FFmpeg.terminate()"))
    );
    setSaveTarget({ kind: "download", save: async () => {} } as SaveTarget);
    enqueueFiles(
      [file("a.cdg"), file("a.mp3"), file("b.cdg"), file("b.mp3"), file("c.cdg"), file("c.mp3")],
      null,
      "480p"
    );
    await flush();
    cancelAll();
    await untilDrained();
    expect(getState().items.map((i) => i.state.phase)).toEqual([
      "cancelled",
      "cancelled",
      "cancelled",
    ]);
    expect(vi.mocked(convertCdgToMp4)).toHaveBeenCalledTimes(1);
  });

  it("retry re-runs a failed item", async () => {
    vi.mocked(convertCdgToMp4)
      .mockImplementationOnce(async () => {
        throw new Error("The converter failed (ffmpeg exit code 1).");
      })
      .mockImplementation(async () => new Uint8Array([1]));
    setSaveTarget({ kind: "download", save: async () => {} } as SaveTarget);
    enqueueFiles([file("a.cdg"), file("a.mp3"), file("b.cdg"), file("b.mp3")], null, "480p");
    await untilDrained();
    const failedId = getState().items.find((i) => i.state.phase === "failed")!.id;
    retryItem(failedId);
    await untilDrained();
    expect(getState().items.every((i) => i.state.phase === "done")).toBe(true);
  });

  it("saves each finished item through the active SaveTarget in batch mode", async () => {
    const saved: string[] = [];
    setSaveTarget({
      kind: "directory",
      save: async (name) => {
        saved.push(name);
      },
    } as SaveTarget);
    enqueueFiles([file("a.cdg"), file("a.mp3"), file("b.cdg"), file("b.mp3")], null, "480p");
    await untilDrained();
    expect(saved).toEqual(["a.mp4", "b.mp4"]);
    const first = getState().items[0].state;
    expect(first.phase === "done" && first.savedVia).toBe("directory");
  });

  it("does not auto-save in single mode (preview only, like today)", async () => {
    const saved: string[] = [];
    setSaveTarget({
      kind: "download",
      save: async (name) => {
        saved.push(name);
      },
    } as SaveTarget);
    enqueueFiles([file("a.cdg"), file("a.mp3")], null, "480p");
    await untilDrained();
    expect(saved).toEqual([]);
    const s = getState();
    expect(s.mode).toBe("single");
    const st = s.items[0].state;
    expect(st.phase === "done" && st.savedVia).toBe("preview");
    expect(s.preview?.name).toBe("a.mp4");
  });

  it("recycles the worker after every 10 conversions", async () => {
    setSaveTarget({ kind: "download", save: async () => {} } as SaveTarget);
    const files: File[] = [];
    for (let i = 0; i < 11; i++) files.push(file(`s${i}.cdg`), file(`s${i}.mp3`));
    enqueueFiles(files, null, "480p");
    await untilDrained();
    expect(getState().items.filter((i) => i.state.phase === "done")).toHaveLength(11);
    expect(vi.mocked(recycleFFmpeg)).toHaveBeenCalledTimes(1);
  });

  it("never runs two loops for one queue (enqueue is reentrant-safe)", async () => {
    let concurrent = 0;
    let peak = 0;
    vi.mocked(convertCdgToMp4).mockImplementation(async () => {
      concurrent++;
      peak = Math.max(peak, concurrent);
      await flush();
      concurrent--;
      return new Uint8Array([1]);
    });
    setSaveTarget({ kind: "download", save: async () => {} } as SaveTarget);
    enqueueFiles([file("a.cdg"), file("a.mp3")], null, "480p");
    enqueueFiles([file("b.cdg"), file("b.mp3")], null, "480p");
    enqueueFiles([file("c.cdg"), file("c.mp3")], null, "480p");
    await untilDrained();
    expect(peak).toBe(1);
    expect(getState().items.every((i) => i.state.phase === "done")).toBe(true);
  });
});
