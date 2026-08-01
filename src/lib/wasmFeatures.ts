/**
 * Wasm SIMD support detection.
 *
 * @ffmpeg/core 0.12.x ships a SIMD-enabled (v128) wasm. Browsers running on a
 * CPU without SSE4.1 disable Wasm SIMD in the engine, so the core fails to
 * compile before it ever reads the user's files:
 *
 *   Chrome:  CompileError: Compiling function #81 failed: Wasm SIMD unsupported
 *   Firefox: CompileError: wasm validation error: v128 not enabled
 *
 * PostHog shows this is terminal, not transient: every Chrome 109 and Firefox
 * 115 session (the last versions supported on Windows 7/8.1, i.e. pre-SSE4.1
 * era hardware) failed at load and none ever succeeded. Retrying or switching
 * browsers cannot help, so the generic "try a different browser" copy is
 * actively misleading and needs its own message.
 */

// The standard feature-probe module: a function returning v128, whose body is
// `i32.const 0; i8x16.splat; i8x16.popcnt`. Validation fails outright when the
// engine has SIMD disabled, which is what we are detecting.
const SIMD_PROBE = Uint8Array.of(
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, 0x03,
  0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0xfd, 0x62, 0x0b
);

let cached: boolean | null = null;

/** Whether this engine can compile SIMD (v128) wasm. Memoized; never throws. */
export function hasWasmSimd(): boolean {
  if (cached !== null) return cached;
  try {
    cached = WebAssembly.validate(SIMD_PROBE);
  } catch {
    cached = false;
  }
  return cached;
}

/** Test seam: drop the memoized result. */
export function resetWasmSimdCache(): void {
  cached = null;
}

/**
 * Whether an underlying load error is the engine refusing SIMD. Backstop for
 * the case where `validate` passes but instantiating the real core still trips
 * the engine's SIMD gate, so both paths surface the same message.
 */
export function isSimdCompileError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /SIMD unsupported|v128 not enabled/i.test(message);
}

/** User-facing copy for an unsupported-SIMD device. Shared by both paths. */
export const SIMD_UNSUPPORTED_MESSAGE =
  "This device's processor is missing the SIMD support the converter needs. " +
  "That is usually an older PC; retrying or switching browsers will not help. " +
  "Try converting on a newer computer.";
