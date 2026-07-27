import { describe, it, expect } from "vitest";
import {
  reduce,
  initialState,
  nextQueued,
  activeItem,
  counts,
  batchEtaSeconds,
  type QueueState,
  type EnqueueInput,
} from "./queue";
import type { BatchInput } from "./inputFiles";

// The reducer never touches file contents, so a stub object is enough.
const src = (name: string): BatchInput<File> =>
  ({ type: "zip", zip: { name } as File }) as BatchInput<File>;

const input = (id: string, key = id): EnqueueInput => ({
  id,
  source: src(`${id}.zip`),
  label: id,
  dedupeKey: key,
  resolution: "1080p",
});

const enqueue = (state: QueueState, ...inputs: EnqueueInput[]) =>
  reduce(state, { type: "enqueue", inputs });

describe("queue reducer", () => {
  it("enqueues one item in single mode, two in batch mode", () => {
    const one = enqueue(initialState, input("a"));
    expect(one.mode).toBe("single");
    const two = enqueue(initialState, input("a"), input("b"));
    expect(two.mode).toBe("batch");
    expect(two.items.map((i) => i.state.phase)).toEqual(["queued", "queued"]);
  });

  it("appending to an existing queue flips single to batch", () => {
    let s = enqueue(initialState, input("a"));
    s = reduce(s, { type: "item-converting", id: "a", at: 1 });
    s = enqueue(s, input("b"));
    expect(s.mode).toBe("batch");
    expect(s.items).toHaveLength(2);
  });

  it("marks duplicate dedupeKeys as skipped, first occurrence wins", () => {
    const s = enqueue(initialState, input("a", "k1"), input("b", "k1"), input("c", "k2"));
    expect(s.items.map((i) => i.state.phase)).toEqual(["queued", "skipped", "queued"]);
  });

  it("a key completed earlier skips a later enqueue of the same key", () => {
    let s = enqueue(initialState, input("a", "k1"));
    s = reduce(s, { type: "item-converting", id: "a", at: 1 });
    s = reduce(s, {
      type: "item-done",
      id: "a",
      at: 2,
      outputName: "a.mp4",
      sizeBytes: 9,
      savedVia: "download",
      preview: null,
    });
    s = enqueue(s, input("b", "k1"), input("c", "k2"));
    // The fresh drop replaced the terminal single item, but the completed key
    // survives in completedKeys: the same song is skipped, the new one queues.
    expect(s.items.map((i) => i.state.phase)).toEqual(["skipped", "queued"]);
  });

  it("a lone fresh drop is never deduped: a single re-drop converts again", () => {
    let s = enqueue(initialState, input("a", "k1"));
    s = reduce(s, { type: "item-converting", id: "a", at: 1 });
    s = reduce(s, {
      type: "item-done",
      id: "a",
      at: 2,
      outputName: "a.mp4",
      sizeBytes: 9,
      savedVia: "preview",
      preview: null,
    });
    s = enqueue(s, input("b", "k1")); // same song, deliberate single re-drop
    expect(s.items).toHaveLength(1);
    expect(s.items[0].state.phase).toBe("queued");
  });

  it("a failed item's key is NOT claimed, so re-dropping it queues again", () => {
    let s = enqueue(initialState, input("a", "k1"));
    s = reduce(s, { type: "item-converting", id: "a", at: 1 });
    s = reduce(s, { type: "item-failed", id: "a", at: 2, message: "boom", reason: "unknown" });
    s = enqueue(s, input("b", "k1"));
    // Single-mode replace dropped the failed item; the re-drop queues fresh.
    expect(s.items).toHaveLength(1);
    expect(s.items[0].state.phase).toBe("queued");
  });

  it("single mode: a fresh drop after a terminal item replaces it", () => {
    let s = enqueue(initialState, input("a"));
    s = reduce(s, { type: "item-converting", id: "a", at: 1 });
    s = reduce(s, {
      type: "item-done",
      id: "a",
      at: 2,
      outputName: "a.mp4",
      sizeBytes: 9,
      savedVia: "preview",
      preview: { url: "blob:a", name: "a.mp4" },
    });
    s = enqueue(s, input("b"));
    expect(s.items).toHaveLength(1);
    expect(s.items[0].id).toBe("b");
    expect(s.mode).toBe("single");
  });

  it("progress updates only apply while converting", () => {
    let s = enqueue(initialState, input("a"));
    s = reduce(s, { type: "item-progress", id: "a", progress: 0.5, eta: 10 });
    expect(s.items[0].state.phase).toBe("queued"); // ignored before converting
    s = reduce(s, { type: "item-converting", id: "a", at: 1 });
    s = reduce(s, { type: "item-progress", id: "a", progress: 0.5, eta: 10 });
    expect(s.items[0].state).toMatchObject({
      phase: "converting",
      progress: 0.5,
      stage: "convert",
    });
  });

  it("retry moves a terminal item to the tail as queued", () => {
    let s = enqueue(initialState, input("a"), input("b"));
    s = reduce(s, { type: "item-converting", id: "a", at: 1 });
    s = reduce(s, { type: "item-failed", id: "a", at: 2, message: "x", reason: "unknown" });
    s = reduce(s, { type: "retry", id: "a" });
    expect(s.items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(s.items[1].state.phase).toBe("queued");
  });

  it("retry is a no-op on a non-terminal item", () => {
    let s = enqueue(initialState, input("a"), input("b"));
    s = reduce(s, { type: "item-converting", id: "a", at: 1 });
    const before = s;
    s = reduce(s, { type: "retry", id: "a" });
    expect(s).toBe(before);
  });

  it("cancel-queued flips only queued items", () => {
    let s = enqueue(initialState, input("a"), input("b"), input("c"));
    s = reduce(s, { type: "item-converting", id: "a", at: 1 });
    s = reduce(s, { type: "cancel-queued" });
    expect(s.items.map((i) => i.state.phase)).toEqual(["converting", "cancelled", "cancelled"]);
  });

  it("item-done installs the new preview", () => {
    let s = enqueue(initialState, input("a"), input("b"));
    s = reduce(s, { type: "item-converting", id: "a", at: 1 });
    s = reduce(s, {
      type: "item-done",
      id: "a",
      at: 2,
      outputName: "a.mp4",
      sizeBytes: 9,
      savedVia: "download",
      preview: { url: "blob:a", name: "a.mp4" },
    });
    expect(s.preview).toEqual({ url: "blob:a", name: "a.mp4", itemId: "a" });
  });
});

describe("queue selectors", () => {
  it("nextQueued and activeItem track the run head", () => {
    let s = enqueue(initialState, input("a"), input("b"));
    expect(nextQueued(s)?.id).toBe("a");
    s = reduce(s, { type: "item-converting", id: "a", at: 1 });
    expect(activeItem(s)?.id).toBe("a");
    expect(nextQueued(s)?.id).toBe("b");
  });

  it("counts tallies phases", () => {
    const s = enqueue(initialState, input("a"), input("b", "a")); // b duplicates a
    expect(counts(s)).toMatchObject({ total: 2, queued: 1, skipped: 1 });
  });

  it("batchEtaSeconds is 0 with no completions, then mean x remaining", () => {
    let s = enqueue(initialState, input("a"), input("b"), input("c"));
    expect(batchEtaSeconds(s)).toBe(0);
    s = reduce(s, { type: "item-converting", id: "a", at: 0 });
    s = reduce(s, {
      type: "item-done",
      id: "a",
      at: 60_000, // 60s per song
      outputName: "a.mp4",
      sizeBytes: 9,
      savedVia: "download",
      preview: null,
    });
    // Two items left (b queued, none converting): 2 x 60s.
    expect(batchEtaSeconds(s)).toBe(120);
  });
});
