import { describe, it, expect, beforeAll } from "vitest";
import { installDomGuard } from "./domGuard";

describe("installDomGuard", () => {
  beforeAll(() => installDomGuard());

  it("no-ops instead of throwing when removing a node that isn't a child", () => {
    const parent = document.createElement("div");
    const orphan = document.createElement("span");
    expect(() => parent.removeChild(orphan)).not.toThrow();
    expect(parent.removeChild(orphan)).toBe(orphan);
  });

  it("still removes a real child", () => {
    const parent = document.createElement("div");
    const child = document.createElement("span");
    parent.appendChild(child);
    parent.removeChild(child);
    expect(parent.contains(child)).toBe(false);
  });

  it("no-ops insertBefore when the reference node isn't a child", () => {
    const parent = document.createElement("div");
    const node = document.createElement("span");
    const strayRef = document.createElement("b");
    expect(() => parent.insertBefore(node, strayRef)).not.toThrow();
  });

  it("still inserts before a real reference child", () => {
    const parent = document.createElement("div");
    const ref = document.createElement("b");
    const node = document.createElement("span");
    parent.appendChild(ref);
    parent.insertBefore(node, ref);
    expect(parent.firstChild).toBe(node);
  });
});
