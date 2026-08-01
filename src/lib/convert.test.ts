import { describe, it, expect, afterEach } from "vitest";
import { pipelineOverride, selectPipeline } from "./convert";
import { resetWebCodecsSupportCache } from "./webcodecs";

const setSearch = (search: string) => {
  window.history.replaceState(null, "", `/${search}`);
};

afterEach(() => {
  setSearch("");
  resetWebCodecsSupportCache();
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
