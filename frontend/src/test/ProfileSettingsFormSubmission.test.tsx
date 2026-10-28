import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileSettingsForm } from "../features/auth/ProfileSettingsForm";

const mocks = vi.hoisted(() => ({
  fetchApi: vi.fn(),
  checkUser: vi.fn(),
  addToast: vi.fn(),
  user: { email: "test@example.com", username: "testuser" },
}));

vi.mock("../lib/api", () => ({ fetchApi: mocks.fetchApi }));
vi.mock("../features/auth/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user, checkUser: mocks.checkUser }),
}));
vi.mock("../features/ui/ToastContext", () => ({
  useToast: () => ({ addToast: mocks.addToast }),
}));
vi.mock("../components/ui/AvatarUploadDropzone", () => ({
  AvatarUploadDropzone: () => null,
}));
vi.mock("../components/ui/CoverUploadDropzone", () => ({
  CoverUploadDropzone: () => null,
}));
vi.mock("../hooks/useWebPush", () => ({
  useWebPush: () => ({ isSupported: false }),
}));
vi.mock("../hooks/useUnsavedChanges", () => ({
  useUnsavedChanges: () => ({ isBlocked: false }),
}));
vi.mock("../components/ui/UnsavedChangesDialog", () => ({
  UnsavedChangesDialog: () => null,
}));

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function submitTwice() {
  const form = screen
    .getByRole("button", { name: "Save Settings" })
    .closest("form")!;
  // Both validations can finish before React renders the disabled button.
  fireEvent.submit(form);
  fireEvent.submit(form);
}

describe("profile save submissions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.fetchApi.mockResolvedValue([]);
    mocks.checkUser.mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it("sends one PUT for rapid submissions and keeps the pending button disabled", async () => {
    const save = deferred();
    mocks.fetchApi.mockImplementation((path, options) =>
      options?.method === "PUT" ? save.promise : Promise.resolve([]),
    );
    render(<ProfileSettingsForm />);
    submitTwice();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Updating..." }),
      ).toBeDisabled(),
    );
    const puts = mocks.fetchApi.mock.calls.filter(
      ([, options]) => options?.method === "PUT",
    );
    expect(puts).toHaveLength(1);
    expect(puts[0][0]).toBe("/auth/me/");
    await act(async () => save.resolve());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save Settings" }),
      ).toBeEnabled(),
    );
    expect(mocks.checkUser).toHaveBeenCalledTimes(1);
    expect(mocks.addToast).toHaveBeenCalledWith(
      "Profile settings updated successfully!",
      "success",
    );
  });

  it("keeps the guard until the updated user has been refreshed", async () => {
    const refresh = deferred();
    mocks.checkUser.mockReturnValue(refresh.promise);
    render(<ProfileSettingsForm />);
    fireEvent.submit(
      screen.getByRole("button", { name: "Save Settings" }).closest("form")!,
    );
    await waitFor(() => expect(mocks.checkUser).toHaveBeenCalledTimes(1));
    const pendingButton = screen.getByRole("button", { name: "Updating..." });
    fireEvent.submit(pendingButton.closest("form")!);
    await act(async () => {});
    expect(
      mocks.fetchApi.mock.calls.filter(
        ([, options]) => options?.method === "PUT",
      ),
    ).toHaveLength(1);
    expect(pendingButton).toBeDisabled();
    await act(async () => refresh.resolve());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save Settings" }),
      ).toBeEnabled(),
    );
  });

  it("releases the guard after an API failure so the user can retry", async () => {
    const save = deferred();
    mocks.fetchApi.mockImplementation((path, options) =>
      options?.method === "PUT" ? save.promise : Promise.resolve([]),
    );
    render(<ProfileSettingsForm />);
    fireEvent.submit(
      screen.getByRole("button", { name: "Save Settings" }).closest("form")!,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Updating..." }),
      ).toBeDisabled(),
    );
    await act(async () => save.reject(new Error("Please try again")));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save Settings" }),
      ).toBeEnabled(),
    );
    expect(mocks.addToast).toHaveBeenCalledWith("Please try again", "error");
    mocks.fetchApi.mockResolvedValue([]);
    fireEvent.submit(
      screen.getByRole("button", { name: "Save Settings" }).closest("form")!,
    );
    await waitFor(() => expect(mocks.checkUser).toHaveBeenCalledTimes(1));
    expect(
      mocks.fetchApi.mock.calls.filter(
        ([, options]) => options?.method === "PUT",
      ),
    ).toHaveLength(2);
  });
});
