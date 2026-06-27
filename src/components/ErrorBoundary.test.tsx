import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): React.ReactNode {
  throw new Error("boom");
}

async function render(node: React.ReactNode): Promise<HTMLElement> {
  const el = document.createElement("div");
  await React.act(async () => {
    createRoot(el).render(node);
  });
  return el;
}

describe("ErrorBoundary", () => {
  it("renders children when there is no error", async () => {
    const el = await render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>
    );
    expect(el.textContent).toContain("all good");
  });

  it("shows the fallback when a child throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const el = await render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(el.textContent).toContain("Something went wrong");
    spy.mockRestore();
  });
});
