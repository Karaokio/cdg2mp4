import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasWasmSimd, resetWasmSimdCache, isSimdCompileError } from "./wasmFeatures";

beforeEach(() => {
  vi.restoreAllMocks();
  resetWasmSimdCache();
});

describe("hasWasmSimd", () => {
  it("is true on an engine that compiles v128 (the test runner's own)", () => {
    expect(hasWasmSimd()).toBe(true);
  });

  it("is false when the engine rejects the v128 probe", () => {
    vi.spyOn(WebAssembly, "validate").mockReturnValue(false);
    expect(hasWasmSimd()).toBe(false);
  });

  it("is false, not a crash, when validate itself throws", () => {
    vi.spyOn(WebAssembly, "validate").mockImplementation(() => {
      throw new Error("no WebAssembly here");
    });
    expect(hasWasmSimd()).toBe(false);
  });

  it("memoizes, so the probe is compiled once per session", () => {
    const validate = vi.spyOn(WebAssembly, "validate").mockReturnValue(true);
    hasWasmSimd();
    hasWasmSimd();
    expect(validate).toHaveBeenCalledTimes(1);
  });
});

describe("isSimdCompileError", () => {
  // The two messages seen in production; see the module docblock.
  it.each([
    "RuntimeError: Aborted(CompileError: WebAssembly.instantiate(): Compiling function #81 failed: Wasm SIMD unsupported @+70121)",
    "RuntimeError: Aborted(CompileError: wasm validation error: at offset 70122: v128 not enabled)",
  ])("recognizes %s", (message) => {
    expect(isSimdCompileError(new Error(message))).toBe(true);
  });

  it("does not claim unrelated load failures", () => {
    expect(isSimdCompileError(new Error("worker crashed"))).toBe(false);
    expect(isSimdCompileError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isSimdCompileError(undefined)).toBe(false);
  });
});
