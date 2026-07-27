import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const sampleZip = fileURLToPath(new URL("../test/files/sample.zip", import.meta.url));
const sampleCdg = fileURLToPath(new URL("../test/files/sample.cdg", import.meta.url));
const sampleMp3 = fileURLToPath(new URL("../test/files/sample.mp3", import.meta.url));

test("converts a karaoke zip into a downloadable MP4", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /karaoke video converter/i })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(sampleZip);

  await expect(page.locator("video")).toBeVisible({ timeout: 90_000 });

  const download = page.locator("a[download]");
  await expect(download).toHaveAttribute("download", /\.mp4$/);
});

test("converts a loose .cdg + .mp3 pair", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles([sampleCdg, sampleMp3]);
  await expect(page.locator("video")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("link", { name: /download mp4/i })).toBeVisible();
});

test("completes a pair dropped one file at a time", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(sampleMp3);
  await expect(page.getByText(/now add the matching/i)).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(sampleCdg);
  await expect(page.locator("video")).toBeVisible({ timeout: 90_000 });
});

test("cancels an in-flight conversion and recovers", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(sampleZip);
  await page.getByRole("button", { name: /cancel/i }).click();
  await expect(page.getByText(/drag a karaoke \.zip/i)).toBeVisible();

  // The terminated worker must not poison the next run: convert again fully.
  await page.locator('input[type="file"]').setInputFiles(sampleZip);
  await expect(page.locator("video")).toBeVisible({ timeout: 90_000 });
});

test("works offline after the first conversion", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);

  // First conversion online — this caches the ffmpeg core.
  await page.locator('input[type="file"]').setInputFiles(sampleZip);
  await expect(page.locator("video")).toBeVisible({ timeout: 90_000 });

  // Go offline, reload, and convert again purely from cache.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: /karaoke video converter/i })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(sampleZip);
  await expect(page.locator("video")).toBeVisible({ timeout: 90_000 });

  await context.setOffline(false);
});

test("converts a batch (zip + loose pair) sequentially with auto-download", async ({ page }) => {
  await page.goto("/");
  // sample.zip contains sample.cdg/.mp3, so rename the loose pair to avoid
  // tripping duplicate detection; this batch is two distinct songs.
  const [cdg, mp3] = await Promise.all([readFile(sampleCdg), readFile(sampleMp3)]);
  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));

  await page.locator('input[type="file"]').setInputFiles([
    { name: "sample.zip", mimeType: "application/zip", buffer: await readFile(sampleZip) },
    { name: "second.cdg", mimeType: "application/octet-stream", buffer: cdg },
    { name: "second.mp3", mimeType: "audio/mpeg", buffer: mp3 },
  ]);

  await expect(page.getByTestId("queue")).toBeVisible();
  await expect(page.getByTestId("queue-row")).toHaveCount(2);
  await expect(page.getByText(/batch finished: 2 saved/i)).toBeVisible({ timeout: 180_000 });
  expect(downloads).toEqual(["sample.mp4", "second.mp4"]);

  // The latest finished item stays previewable.
  await expect(page.locator("video")).toBeVisible();
});

test("a duplicate re-drop is skipped, not converted twice", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(sampleZip);
  await expect(page.locator("video")).toBeVisible({ timeout: 90_000 });

  // Same zip again plus a renamed second song: the zip should skip.
  const [cdg, mp3] = await Promise.all([readFile(sampleCdg), readFile(sampleMp3)]);
  await page.locator('input[type="file"]').setInputFiles([
    { name: "sample.zip", mimeType: "application/zip", buffer: await readFile(sampleZip) },
    { name: "again.cdg", mimeType: "application/octet-stream", buffer: cdg },
    { name: "again.mp3", mimeType: "audio/mpeg", buffer: mp3 },
  ]);

  await expect(page.getByText(/already converted this session/i)).toBeVisible();
  await expect(page.getByText(/batch finished: 1 saved, 0 failed, 1 skipped/i)).toBeVisible({
    timeout: 90_000,
  });
});
