
import React from "react";
import { render, screen, cleanup, act } from "@testing-library/react";
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";
import { logger } from "../../lib/logger";
import * as Sentry from "@sentry/react";

vi.mock("../../lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
}));

const ProblematicComponent = () => {
  throw new Error("Test render error");
};

describe("ErrorBoundary", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.clearAllMocks();

    // Mock page navigation methods for testing.
    // @ts-expect-error - Replace location with a test mock.
    delete window.location;

    window.location = {
      ...originalLocation,
      reload: vi.fn(),
      assign: vi.fn(),
    } as any;
  });

  afterEach(() => {
    cleanup();
    window.location = originalLocation as any;
    vi.restoreAllMocks();
  });

  it("renders children normally when there is no error", () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Hello World</div>
      </ErrorBoundary>,
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(
      screen.queryByText("Something went wrong"),
    ).not.toBeInTheDocument();
  });

  it("renders the default fallback and reports the error", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblematicComponent />
      </ErrorBoundary>,
    );

    expect(
      screen.getByText("Something went wrong"),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/An unexpected error occurred/i),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/Test render error/i),
    ).toBeInTheDocument();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.any(Error),
      expect.any(Object),
    );

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          componentStack: expect.anything(),
        }),
      }),
    );

    consoleErrorSpy.mockRestore();
  });

  it("renders a custom fallback when one is provided", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const customFallback = (
      <div data-testid="custom-fallback">
        Custom Error Page
      </div>
    );

    render(
      <ErrorBoundary fallback={customFallback}>
        <ProblematicComponent />
      </ErrorBoundary>,
    );

    expect(
      screen.getByTestId("custom-fallback"),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Something went wrong"),
    ).not.toBeInTheDocument();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });

  it("shows the Try Again and Go Home buttons", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblematicComponent />
      </ErrorBoundary>,
    );

    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /go home/i }),
    ).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it("recovers when Try Again is clicked without reloading the page", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    let shouldThrow = true;

    const TemporaryErrorComponent = () => {
      if (shouldThrow) {
        throw new Error("Temporary render error");
      }

      return (
        <div data-testid="recovered-child">
          Recovered successfully
        </div>
      );
    };

    render(
      <ErrorBoundary>
        <TemporaryErrorComponent />
      </ErrorBoundary>,
    );

    expect(
      screen.getByText("Something went wrong"),
    ).toBeInTheDocument();

    // Allow the child to render successfully after the reset.
    shouldThrow = false;

    act(() => {
      screen.getByRole("button", { name: /try again/i }).click();
    });

    expect(
      screen.getByTestId("recovered-child"),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Something went wrong"),
    ).not.toBeInTheDocument();

    expect(window.location.reload).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("navigates to the home page when Go Home is clicked", () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblematicComponent />
      </ErrorBoundary>,
    );

    act(() => {
      screen.getByRole("button", { name: /go home/i }).click();
    });

    expect(window.location.assign).toHaveBeenCalledWith("/");

    consoleErrorSpy.mockRestore();
  });
});
