import { describe, it, expect, vi, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { screen, waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { Converter } from "./Converter";

// The conversion itself is covered by ffmpeg.test.ts and e2e; here it just
// needs to resolve so the pair-completion flow can reach the "done" state.
vi.mock("@/lib/ffmpeg", () => ({
  convertCdgToMp4: vi.fn(async () => new Uint8Array([1, 2, 3])),
  cancelConversion: vi.fn(),
}));
import { convertCdgToMp4, cancelConversion } from "@/lib/ffmpeg";

const file = (name: string) => new File([new Uint8Array([1])], name);

const fileInput = (container: HTMLElement) =>
  container.querySelector('input[type="file"]') as HTMLInputElement;

beforeAll(() => {
  URL.createObjectURL ??= () => "blob:stub";
  URL.revokeObjectURL ??= () => undefined;
});

describe("Converter pair completion", () => {
  it("holds a lone mp3 and asks for the matching cdg", async () => {
    const { container } = render(<Converter />);
    await userEvent.upload(fileInput(container), file("song.mp3"));
    expect(await screen.findByText(/now add the matching/i)).toBeInTheDocument();
    expect(screen.getByText("song.mp3")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("converts once the held mp3 is joined by a cdg", async () => {
    const { container } = render(<Converter />);
    await userEvent.upload(fileInput(container), file("song.mp3"));
    await screen.findByText(/now add the matching/i);
    await userEvent.upload(fileInput(container), file("song.cdg"));
    await waitFor(() => expect(container.querySelector("video")).toBeInTheDocument());
    expect(screen.getByText("song.mp4")).toBeInTheDocument();
  });

  it("clears a held file via Start over, returning to the initial dropzone", async () => {
    const { container } = render(<Converter />);
    await userEvent.upload(fileInput(container), file("song.mp3"));
    await screen.findByText(/now add the matching/i);
    await userEvent.click(screen.getByRole("button", { name: /start over/i }));
    expect(await screen.findByText(/drag a karaoke \.zip/i)).toBeInTheDocument();
    expect(screen.queryByText("song.mp3")).not.toBeInTheDocument();
    // The held mp3 must be gone: a fresh cdg drop should hold, not convert.
    await userEvent.upload(fileInput(container), file("song.cdg"));
    expect(await screen.findByText(/now add the matching/i)).toBeInTheDocument();
    expect(container.querySelector("video")).not.toBeInTheDocument();
  });

  it("rejects unusable files, naming the extensions", async () => {
    const { container } = render(<Converter />);
    await userEvent.upload(fileInput(container), [file("notes.txt")], { applyAccept: false });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/can't convert \.txt files/i);
  });
});

describe("Converter cancel", () => {
  it("cancels an in-flight conversion back to the idle dropzone, without an error", async () => {
    let rejectConv!: (e: Error) => void;
    vi.mocked(convertCdgToMp4).mockImplementationOnce(
      () =>
        new Promise((_, rej) => {
          rejectConv = rej;
        })
    );
    // Mirror the real cancelConversion: terminating rejects the pending call.
    vi.mocked(cancelConversion).mockImplementationOnce(() =>
      rejectConv(new Error("called FFmpeg.terminate()"))
    );

    const { container } = render(<Converter />);
    await userEvent.upload(fileInput(container), [file("song.cdg"), file("song.mp3")]);
    await userEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    expect(await screen.findByText(/drag a karaoke \.zip/i)).toBeInTheDocument();
    expect(cancelConversion).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(container.querySelector("video")).not.toBeInTheDocument();
  });
});
