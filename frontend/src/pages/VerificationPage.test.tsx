import { StrictMode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VerificationPage } from "./VerificationPage";
import VerifyNoticePage from "./VerifyNoticePage";
import { fetchApi } from "../lib/api";
import { ApiError } from "../lib/apiErrors";

vi.mock("../lib/api", () => ({ fetchApi: vi.fn() }));
vi.mock("../features/auth/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));
vi.mock("../features/auth/AuthPageShell", () => ({
  AuthPageShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const mockedFetch = vi.mocked(fetchApi);

beforeEach(() => mockedFetch.mockReset());
afterEach(cleanup);

// setup.ts keeps fake timers on, so let pending promises and React updates
// settle by moving the clock explicitly.
const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

async function renderVerify(path = "/verify-email/abc123") {
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/verify-email/:token" element={<VerificationPage />} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
  await flush();
}

const apiError = (code: string) =>
  new ApiError("failed", { status: 400, code });

describe("VerificationPage", () => {
  it("verifies once under StrictMode and then sends the user to login", async () => {
    let resolve: (value: unknown) => void = () => {};
    mockedFetch.mockReturnValue(new Promise((r) => (resolve = r)));
    await renderVerify();

    expect(screen.getByText("Verifying your email...")).toBeInTheDocument();
    resolve({ status: "verified" });
    await flush();

    expect(screen.getByText("Email verified!")).toBeInTheDocument();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenCalledWith(
      "/auth/verify-email/abc123/",
      expect.objectContaining({ requireAuth: false }),
    );

    for (let second = 0; second < 5; second++) await flush(1_000);
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("treats a link that was already used as success", async () => {
    mockedFetch.mockResolvedValue({ status: "already_verified" });
    await renderVerify();
    expect(screen.getByText("Already verified")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Continue to login" }),
    ).toBeInTheDocument();
  });

  it("offers a one-click resend for an expired link", async () => {
    mockedFetch
      .mockRejectedValueOnce(apiError("expired_key"))
      .mockResolvedValueOnce({ message: "A new link is on its way." });
    await renderVerify();

    expect(screen.getByText("This link has expired")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email Address")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Resend verification email" }),
    );
    await flush();

    expect(screen.getByText("A new link is on its way.")).toBeInTheDocument();
    expect(mockedFetch).toHaveBeenLastCalledWith(
      "/auth/resend-verification/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ key: "abc123" }),
      }),
    );
    expect(
      screen.getByRole("button", { name: "Send again in 60s" }),
    ).toBeDisabled();

    for (let second = 0; second < 60; second++) await flush(1_000);
    expect(
      screen.getByRole("button", { name: "Send another link" }),
    ).toBeEnabled();
  });

  it("asks for an email when the link is invalid", async () => {
    mockedFetch.mockRejectedValueOnce(apiError("invalid_key"));
    await renderVerify();
    expect(screen.getByText("This link doesn't work")).toBeInTheDocument();
    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
  });

  it("lets the user retry after a network failure", async () => {
    mockedFetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ status: "verified" });
    await renderVerify();

    expect(
      screen.getByText("We couldn't reach the server"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flush();

    expect(screen.getByText("Email verified!")).toBeInTheDocument();
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });
});

describe("VerifyNoticePage", () => {
  it("shows the address and resends to it", async () => {
    mockedFetch.mockResolvedValue({ message: "Sent." });
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: "/verify-notice", state: { email: "me@example.com" } },
        ]}
      >
        <VerifyNoticePage />
      </MemoryRouter>,
    );

    expect(screen.getByText("me@example.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Email Address")).toHaveValue(
      "me@example.com",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Resend verification email" }),
    );
    await flush();

    expect(mockedFetch).toHaveBeenCalledWith(
      "/auth/resend-verification/",
      expect.objectContaining({
        body: JSON.stringify({ email: "me@example.com" }),
      }),
    );
    expect(screen.getByText("Sent.")).toBeInTheDocument();
  });

  it("shows the error when resending fails", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("Too many requests."));
    render(
      <MemoryRouter initialEntries={["/verify-notice?email=me@example.com"]}>
        <VerifyNoticePage />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Resend verification email" }),
    );
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent("Too many requests.");
    expect(
      screen.getByRole("button", { name: "Resend verification email" }),
    ).toBeEnabled();
  });
});
