import { describe, it, expect } from "vitest";
import { setConverting, isConverting, subscribeConverting } from "./converting";

describe("converting signal", () => {
  it("reflects the current flag", () => {
    expect(isConverting()).toBe(false);
    setConverting(true);
    expect(isConverting()).toBe(true);
    setConverting(false);
    expect(isConverting()).toBe(false);
  });

  it("notifies subscribers only on actual changes, and not after unsubscribe", () => {
    let calls = 0;
    const unsubscribe = subscribeConverting(() => {
      calls += 1;
    });
    setConverting(true); // change -> notify
    setConverting(true); // no change -> no notify
    setConverting(false); // change -> notify
    unsubscribe();
    setConverting(true); // unsubscribed -> no notify
    expect(calls).toBe(2);
    setConverting(false); // reset shared state
  });
});
