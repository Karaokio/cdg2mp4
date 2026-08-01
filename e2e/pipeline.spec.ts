import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const sampleZip = fileURLToPath(new URL("../test/files/sample.zip", import.meta.url));

/** Run a conversion and return the output MP4's size plus the video's metadata. */
async function convert(page: Page, url: string) {
  await page.goto(url);
  const t0 = Date.now();
  await page.locator('input[type="file"]').setInputFiles(sampleZip);
  const video = page.locator("video");
  await expect(video).toBeVisible({ timeout: 90_000 });
  const elapsedMs = Date.now() - t0;

  // Read the produced MP4 back through the blob URL the player is using, and
  // let the browser's own demuxer report what it found. A file that decodes to
  // the right duration and dimensions is the thing we actually care about.
  const info = await video.evaluate(async (el: HTMLVideoElement) => {
    const bytes = (await (await fetch(el.src)).arrayBuffer()).byteLength;
    if (el.readyState < 1) {
      await new Promise((r) => el.addEventListener("loadedmetadata", r, { once: true }));
    }
    return {
      bytes,
      duration: el.duration,
      width: el.videoWidth,
      height: el.videoHeight,
    };
  });
  return { ...info, elapsedMs };
}

// The sample is a ~7.8s CDG against a ~8.2s MP3, so the output must run to the
// audio's length (the tpad/-shortest behaviour from #64/#69), not the graphics'.
const AUDIO_SECONDS = 8.2;

test.describe("conversion pipelines", () => {
  test("webcodecs and ffmpeg.wasm agree on the output", async ({ page }) => {
    const native = await convert(page, "/?pipeline=webcodecs");
    const wasm = await convert(page, "/?pipeline=ffmpeg");

    for (const [name, out] of [
      ["webcodecs", native],
      ["ffmpeg", wasm],
    ] as const) {
      expect(out.bytes, `${name} produced a non-trivial file`).toBeGreaterThan(10_000);
      expect(out.width, `${name} width`).toBe(1440);
      expect(out.height, `${name} height`).toBe(1080);
      expect(out.duration, `${name} duration`).toBeGreaterThan(AUDIO_SECONDS - 0.5);
      expect(out.duration, `${name} duration`).toBeLessThan(AUDIO_SECONDS + 0.5);
    }

    // Not an assertion, just the number the issue asks for.
    console.log(
      `webcodecs: ${native.elapsedMs}ms, ${native.bytes} bytes\n` +
        `ffmpeg:    ${wasm.elapsedMs}ms, ${wasm.bytes} bytes`
    );
  });

  test("defaults to the native pipeline in a WebCodecs browser", async ({ page }) => {
    await page.goto("/");
    const supported = await page.evaluate(() => typeof VideoEncoder !== "undefined");
    expect(supported).toBe(true);
    // The wasm-only copy is the tell: it is rendered only when ffmpeg is chosen.
    await expect(page.getByText(/while the converter downloads/i)).toHaveCount(0);
  });

  test("does not offer a converter download the native pipeline never uses", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/available offline/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /save for offline/i })).toHaveCount(0);

    // Forcing the wasm pipeline brings the download offer back, since that
    // device does need the core cached to work offline.
    await page.goto("/?pipeline=ffmpeg");
    await expect(page.getByRole("button", { name: /save for offline/i })).toBeVisible();
  });
});
