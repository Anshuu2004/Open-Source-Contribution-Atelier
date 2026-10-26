import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecentActivity } from "../RecentActivity";
import { StreakCalendar } from "../StreakCalendar";
import { addDays, toDateKey } from "../../lib/activity";

const fetchApi = vi.fn();

vi.mock("../../lib/api", () => ({
  fetchApi: (...args: unknown[]) => fetchApi(...args),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const today = new Date();
const yesterday = toDateKey(addDays(today, -1));
const lastWeek = toDateKey(addDays(today, -7));

function respond(heatmap: unknown) {
  fetchApi.mockImplementation((endpoint: string) => {
    if (endpoint.startsWith("/progress/heatmap/")) {
      return heatmap instanceof Error ? Promise.reject(heatmap) : Promise.resolve(heatmap);
    }
    return Promise.resolve({ current_streak: 3, highest_streak: 9 });
  });
}

describe("RecentActivity", () => {
  beforeEach(() => {
    fetchApi.mockReset();
  });

  it("shows a loading state first", () => {
    fetchApi.mockReturnValue(new Promise(() => {}));
    renderWithClient(<RecentActivity />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading recent activity");
  });

  it("lists the newest active days with a readable summary", async () => {
    respond([
      { date: lastWeek, count: 1, breakdown: { reading: 1, quizzes: 0, code_submissions: 0 } },
      { date: yesterday, count: 3, breakdown: { reading: 2, quizzes: 1, code_submissions: 0 } },
    ]);
    renderWithClient(<RecentActivity />);

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("2 lessons, 1 quiz");
    expect(items[1]).toHaveTextContent("1 lesson");
  });

  it("shows an empty state when there is no activity", async () => {
    respond([]);
    renderWithClient(<RecentActivity />);
    expect(await screen.findByText(/No activity yet/)).toBeInTheDocument();
  });

  it("shows an error with a retry button", async () => {
    respond(new Error("boom"));
    renderWithClient(<RecentActivity />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("StreakCalendar", () => {
  beforeEach(() => {
    fetchApi.mockReset();
  });

  it("labels each day for assistive technology", async () => {
    respond([
      { date: yesterday, count: 2, breakdown: { reading: 1, quizzes: 1, code_submissions: 0 } },
    ]);
    renderWithClient(<StreakCalendar />);

    const group = await screen.findByRole("group", { name: /Daily activity/ });
    const buttons = group.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(100);

    const labelled = Array.from(buttons).find((b) =>
      b.getAttribute("aria-label")?.includes("1 lesson, 1 quiz"),
    );
    expect(labelled).toBeDefined();
    expect(await screen.findByText(/Current streak: 3 days/)).toBeInTheDocument();
  });

  it("keeps a single tab stop and moves with the arrow keys", async () => {
    respond([]);
    renderWithClient(<StreakCalendar />);

    const group = await screen.findByRole("group", { name: /Daily activity/ });
    const buttons = Array.from(group.querySelectorAll("button"));
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);

    const first = buttons[0];
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });

    await waitFor(() => expect(document.activeElement).toBe(buttons[1]));
    expect(buttons.filter((b) => b.tabIndex === 0)).toEqual([buttons[1]]);
  });

  it("shows an error state when the request fails", async () => {
    respond(new Error("boom"));
    renderWithClient(<StreakCalendar />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
  });
});
