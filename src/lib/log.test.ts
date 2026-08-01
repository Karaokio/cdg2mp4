import { describe, it, expect, vi, afterEach } from "vitest";
import { log, logError, mb, secs } from "./log";

afterEach(() => vi.restoreAllMocks());

describe("log", () => {
  it("prefixes the app name so the trace is greppable in a shared console", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    log("hello");
    expect(info.mock.calls[0][0]).toContain("[cdg2mp4]");
    expect(info.mock.calls[0][0]).toContain("hello");
  });

  it("omits keys with no value rather than printing undefined", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    log("done", { pipeline: "webcodecs", audio: undefined });
    expect(info.mock.calls[0].at(-1)).toEqual({ pipeline: "webcodecs" });
  });

  it("passes no data argument at all when nothing is left", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    log("done", { audio: undefined });
    expect(info.mock.calls[0]).toHaveLength(3); // format + two styles
  });

  it("never throws when the console is broken", () => {
    vi.spyOn(console, "info").mockImplementation(() => {
      throw new Error("no console");
    });
    expect(() => log("hello")).not.toThrow();
  });
});

describe("logError", () => {
  it("surfaces the underlying cause, which is the diagnosable part", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logError("failed", new Error("worker died"));
    expect(warn.mock.calls[0].at(-1)).toBe("Error: worker died");
  });
});

describe("formatting", () => {
  it("reports sizes and durations at human precision", () => {
    expect(mb(6.1 * 1048576)).toBe("6.1 MB");
    expect(secs(15_040)).toBe("15.0s");
  });
});
