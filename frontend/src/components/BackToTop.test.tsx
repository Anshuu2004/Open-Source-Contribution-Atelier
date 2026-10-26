import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BackToTop from "./BackToTop";

describe("BackToTop", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document.body, "scrollHeight");
    Reflect.deleteProperty(document.documentElement, "scrollHeight");
    Reflect.deleteProperty(window, "scrollY");
  });

  it("only appears after scrolling on a page tall enough to scroll", () => {
    let pageHeight = 600;
    let onResize: ResizeObserverCallback | undefined;

    Object.defineProperty(document.body, "scrollHeight", {
      configurable: true,
      get: () => pageHeight,
    });
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      get: () => pageHeight,
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 350,
    });
    vi.stubGlobal("innerHeight", 600);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          onResize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );

    render(<BackToTop />);
    expect(screen.queryByRole("button", { name: "Back to Top" })).toBeNull();

    pageHeight = 900;
    act(() => onResize?.([], {} as ResizeObserver));
    expect(screen.getByRole("button", { name: "Back to Top" })).toBeVisible();

    pageHeight = 600;
    act(() => onResize?.([], {} as ResizeObserver));
    expect(screen.queryByRole("button", { name: "Back to Top" })).toBeNull();
  });
});
