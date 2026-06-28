import { describe, it, expect, beforeAll } from "vitest";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { installDomGuard } from "./domGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Renders a text node next to a stable element. Toggling `withText` makes React
// remove that text node on re-render — the operation page-translation breaks.
function View({ withText }: { withText: boolean }) {
  return (
    <p>
      {withText ? "translated text" : null}
      <span>keep</span>
    </p>
  );
}

describe("domGuard: page-translation scenario", () => {
  beforeAll(() => installDomGuard());

  it("does not crash into the error boundary when a translated text node is removed", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    let root!: Root;

    await React.act(async () => {
      root = createRoot(el);
      root.render(
        <ErrorBoundary>
          <View withText={true} />
        </ErrorBoundary>
      );
    });

    // Simulate what the browser translator does: move React's rendered text node out
    // from under its <p> (here, into a detached <font>), changing its parentNode.
    const para = el.querySelector("p")!;
    const textNode = para.firstChild!;
    expect(textNode.nodeType).toBe(Node.TEXT_NODE);
    document.createElement("font").appendChild(textNode);

    // Re-render so React tries to remove that (now-moved) text node from <p>. Without
    // the guard this throws NotFoundError during commit and trips the error boundary.
    await React.act(async () => {
      root.render(
        <ErrorBoundary>
          <View withText={false} />
        </ErrorBoundary>
      );
    });

    expect(el.textContent).not.toContain("Something went wrong");
    expect(el.querySelector("span")?.textContent).toBe("keep");
  });
});
