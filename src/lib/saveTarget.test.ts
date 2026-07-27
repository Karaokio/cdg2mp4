import { describe, it, expect, vi, beforeEach } from "vitest";
import { autoDownloadTarget, pickDirectoryTarget, supportsDirectorySave } from "./saveTarget";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("autoDownloadTarget", () => {
  it("clicks a download anchor and revokes the URL later", async () => {
    vi.useFakeTimers();
    const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await autoDownloadTarget().save("song.mp4", new Blob([new Uint8Array([1])]));

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).not.toHaveBeenCalled(); // not before the download owns it
    vi.advanceTimersByTime(10_000);
    expect(revokeSpy).toHaveBeenCalledWith("blob:x");
  });
});

describe("pickDirectoryTarget", () => {
  type PickerWindow = Window & { showDirectoryPicker?: () => Promise<unknown> };

  it("returns null when the user dismisses the picker", async () => {
    (window as PickerWindow).showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(new DOMException("dismissed", "AbortError"));
    expect(await pickDirectoryTarget()).toBeNull();
    delete (window as PickerWindow).showDirectoryPicker;
  });

  it("writes through the chosen directory handle", async () => {
    const close = vi.fn();
    const write = vi.fn();
    const dir = {
      getFileHandle: vi.fn().mockResolvedValue({
        createWritable: vi.fn().mockResolvedValue({ write, close }),
      }),
    };
    (window as PickerWindow).showDirectoryPicker = vi.fn().mockResolvedValue(dir);

    const target = await pickDirectoryTarget();
    expect(target?.kind).toBe("directory");
    const blob = new Blob([new Uint8Array([1])]);
    await target!.save("song.mp4", blob);

    expect(dir.getFileHandle).toHaveBeenCalledWith("song.mp4", { create: true });
    expect(write).toHaveBeenCalledWith(blob);
    expect(close).toHaveBeenCalled();
    delete (window as PickerWindow).showDirectoryPicker;
  });

  it("supportsDirectorySave reflects the picker's presence", () => {
    expect(supportsDirectorySave()).toBe(false);
    (window as PickerWindow).showDirectoryPicker = vi.fn();
    expect(supportsDirectorySave()).toBe(true);
    delete (window as PickerWindow).showDirectoryPicker;
  });
});
