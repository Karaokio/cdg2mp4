import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const sampleZip = fileURLToPath(new URL("../test/files/sample.zip", import.meta.url));
const keyedCdg = fileURLToPath(new URL("../test/files/sample-key.cdg", import.meta.url));
const sampleMp3 = fileURLToPath(new URL("../test/files/sample.mp3", import.meta.url));

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

/**
 * Whether this browser can actually run the native pipeline.
 *
 * Not every Chromium can: builds without proprietary codecs have `VideoEncoder`
 * and no H.264 encoder behind it, which is exactly the case the routing exists
 * for. CI installs Playwright's own Chromium rather than branded Chrome, so the
 * tests below have to ask rather than assume, or they fail on the very
 * configuration they are meant to tolerate.
 */
async function nativeAvailable(page: Page): Promise<boolean> {
  await page.goto("/");
  return page.evaluate(async () => {
    if (typeof VideoEncoder === "undefined") return false;
    try {
      const { supported } = await VideoEncoder.isConfigSupported({
        codec: "avc1.640028",
        width: 1440,
        height: 1080,
      });
      return !!supported;
    } catch {
      return false;
    }
  });
}

test.describe("conversion pipelines", () => {
  test("webcodecs and ffmpeg.wasm agree on the output", async ({ page }) => {
    test.skip(!(await nativeAvailable(page)), "no H.264 encoder in this browser");
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

  // Whichever way this browser goes, the copy has to match it: the "converter
  // downloads" line is true only for the wasm path.
  test("routes to the pipeline this browser can actually run", async ({ page }) => {
    const native = await nativeAvailable(page);
    const downloadNote = page.getByText(/while the converter downloads/i);
    await expect(downloadNote).toHaveCount(native ? 0 : 1);
  });

  // A CD+G title can declare its background color transparent. Rendering it by
  // drawing each frame onto the previous one then never erases anything those
  // transparent pixels cover, so every mark ever drawn accumulates. Real rips
  // smear their lyrics; sample-key.cdg makes it unmissable by sweeping a single
  // white block across the screen and erasing it to the transparent color, so a
  // compositing renderer paints a trail the full width instead.
  test("erases through a transparent background instead of compositing over it", async ({
    page,
  }) => {
    test.skip(!(await nativeAvailable(page)), "no H.264 encoder in this browser");
    await page.goto("/?pipeline=webcodecs");
    await page.locator('input[type="file"]').setInputFiles([keyedCdg, sampleMp3]);
    const video = page.locator("video");
    await expect(video).toBeVisible({ timeout: 90_000 });

    // Count white pixels across the row the block sweeps along, near the end of
    // the sweep. One block is ~2/50 of the row's width; a trail is most of it.
    const whiteFraction = await video.evaluate(async (el: HTMLVideoElement) => {
      el.pause();
      await new Promise((r) => {
        if (el.readyState >= 2) return r(null);
        el.addEventListener("loadeddata", r, { once: true });
      });
      el.currentTime = 6.5;
      await new Promise((r) => el.addEventListener("seeked", r, { once: true }));

      const canvas = document.createElement("canvas");
      canvas.width = el.videoWidth;
      canvas.height = el.videoHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(el, 0, 0);
      // Rows 8-9 of 18 tile-rows, sampled mid-band.
      const y = Math.round(canvas.height * (8.5 / 18));
      const { data } = ctx.getImageData(0, y, canvas.width, 1);
      let white = 0;
      for (let x = 0; x < canvas.width; x++) {
        const [r, g, b] = [data[x * 4], data[x * 4 + 1], data[x * 4 + 2]];
        if (r > 200 && g > 200 && b > 200) white++;
      }
      return white / canvas.width;
    });

    // The sweeping block covers about 4% of the row. Compositing would leave a
    // trail over most of it, so anything past a quarter is the bug.
    expect(whiteFraction).toBeLessThan(0.25);
  });

  test("does not offer a converter download the native pipeline never uses", async ({ page }) => {
    test.skip(!(await nativeAvailable(page)), "this browser does need the wasm core");
    await page.goto("/");
    await expect(page.getByText(/available offline/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /save for offline/i })).toHaveCount(0);

    // Forcing the wasm pipeline brings the download offer back, since that
    // device does need the core cached to work offline.
    await page.goto("/?pipeline=ffmpeg");
    await expect(page.getByRole("button", { name: /save for offline/i })).toBeVisible();
  });
});
