import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useClipboard } from "./useClipboard";

function mockExecCommand(result: boolean) {
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue(result),
  });
}

describe("useClipboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, "execCommand");
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("reports success and resets", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    const { result } = renderHook(() => useClipboard({ resetAfterMs: 1000 }));

    await act(async () => {
      await result.current.copy("git status");
    });
    expect(result.current.status).toBe("success");

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.status).toBe("idle");
  });

  it("reports error state", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi
          .fn()
          .mockRejectedValue(new DOMException("Denied", "NotAllowedError")),
      },
    });
    mockExecCommand(false);

    const { result } = renderHook(() => useClipboard());

    await act(async () => {
      await result.current.copy("git status");
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Clipboard permission was denied.");
  });

  it("uses the fallback when the Clipboard API denies permission", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi
          .fn()
          .mockRejectedValue(new DOMException("Denied", "NotAllowedError")),
      },
    });
    mockExecCommand(true);
    const { result } = renderHook(() => useClipboard({ resetAfterMs: 0 }));
    let copyResult: Awaited<ReturnType<typeof result.current.copy>> | undefined;

    await act(async () => {
      copyResult = await result.current.copy("fallback text");
    });

    expect(copyResult).toEqual({ ok: true, method: "exec-command" });
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(result.current.status).toBe("success");
    expect(result.current.error).toBeNull();
  });

  it("uses the execCommand fallback when the Clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    mockExecCommand(true);

    const { result } = renderHook(() => useClipboard({ resetAfterMs: 0 }));
    let copyResult: Awaited<ReturnType<typeof result.current.copy>> | undefined;

    await act(async () => {
      copyResult = await result.current.copy("fallback text");
    });

    expect(copyResult).toEqual({ ok: true, method: "exec-command" });
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(result.current.status).toBe("success");
    expect(result.current.error).toBeNull();
  });

  it("rejects empty text without calling the Clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const { result } = renderHook(() => useClipboard({ resetAfterMs: 0 }));

    await act(async () => {
      await result.current.copy("");
    });

    expect(writeText).not.toHaveBeenCalled();
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("There is no text to copy.");
  });

  it("passes long text through without truncation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const longText = "copy this ".repeat(6000);
    const { result } = renderHook(() => useClipboard({ resetAfterMs: 0 }));

    await act(async () => {
      await result.current.copy(longText);
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(longText);
    expect(result.current.status).toBe("success");
  });

  it("clears an error after the configured timeout", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi
          .fn()
          .mockRejectedValue(new DOMException("Denied", "NotAllowedError")),
      },
    });
    mockExecCommand(false);
    const { result } = renderHook(() => useClipboard({ resetAfterMs: 500 }));

    await act(async () => {
      await result.current.copy("private text");
    });

    expect(result.current.status).toBe("error");
    act(() => vi.advanceTimersByTime(499));
    expect(result.current.status).toBe("error");
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("resets from the latest of several quick copies", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { result } = renderHook(() => useClipboard({ resetAfterMs: 1000 }));

    await act(async () => {
      await result.current.copy("first");
    });
    act(() => vi.advanceTimersByTime(750));
    await act(async () => {
      await result.current.copy("second");
    });

    act(() => vi.advanceTimersByTime(250));
    expect(result.current.status).toBe("success");
    act(() => vi.advanceTimersByTime(750));
    expect(result.current.status).toBe("idle");
    expect(writeText).toHaveBeenNthCalledWith(1, "first");
    expect(writeText).toHaveBeenNthCalledWith(2, "second");
  });

  it("clears the timer on unmount", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    const { result, unmount } = renderHook(() =>
      useClipboard({ resetAfterMs: 5000 }),
    );

    await act(async () => {
      await result.current.copy("git status");
    });
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
