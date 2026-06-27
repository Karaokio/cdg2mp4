import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

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
