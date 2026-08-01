import { describe, it, expect, afterEach, vi } from "vitest";
import { pipelineOverride, selectPipeline, resetPipelineAnnouncement } from "./convert";
import { resetWebCodecsSupportCache } from "./webcodecs";

const setSearch = (search: string) => {
  window.history.replaceState(null, "", `/${search}`);
};

afterEach(() => {
  setSearch("");
  resetWebCodecsSupportCache();
  resetPipelineAnnouncement();
  vi.restoreAllMocks();
});

describe("pipelineOverride", () => {
  it("is null without the query parameter", () => {
    expect(pipelineOverride()).toBeNull();
  });

  it("reads a known pipeline name", () => {
    setSearch("?pipeline=ffmpeg");
    expect(pipelineOverride()).toBe("ffmpeg");
    setSearch("?pipeline=webcodecs");
    expect(pipelineOverride()).toBe("webcodecs");
  });

  it("ignores anything else rather than picking a broken pipeline", () => {
    setSearch("?pipeline=magic");
    expect(pipelineOverride()).toBeNull();
  });
});

describe("selectPipeline", () => {
  it("falls back to ffmpeg.wasm without WebCodecs support", async () => {
    expect(await selectPipeline("1440x1080")).toBe("ffmpeg");
  });

  it("honours the override even where detection would say otherwise", async () => {
    setSearch("?pipeline=webcodecs");
    expect(await selectPipeline("1440x1080")).toBe("webcodecs");
  });
});

describe("pipeline announcement", () => {
  // The dropzone copy, the offline pill and the conversion itself all ask which
  // pipeline is in play. Announcing per call would print the same line three
  // times before anyone drops a file.
  it("logs a given decision once, however many callers ask", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await selectPipeline("1440x1080");
    await selectPipeline("1440x1080");
    await selectPipeline("960x720");
    expect(info).toHaveBeenCalledTimes(1);
  });

  it("says which pipeline, and why", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await selectPipeline("1440x1080");
    expect(info.mock.calls[0][0]).toMatch(/ffmpeg\.wasm/);
  });
});
