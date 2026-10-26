import { describe, expect, it } from "vitest";
import {
  activityLevel,
  buildCalendar,
  describeActivity,
  parseDateKey,
  recentActivity,
  toDateKey,
  type ActivityDay,
} from "../activity";

const day = (date: string, reading = 0, quizzes = 0, code = 0): ActivityDay => ({
  date,
  count: reading + quizzes + code,
  breakdown: { reading, quizzes, code_submissions: code },
});

describe("activity helpers", () => {
  it("round-trips date keys without shifting the day", () => {
    expect(toDateKey(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(toDateKey(parseDateKey("2026-12-31")!)).toBe("2026-12-31");
    expect(parseDateKey("2026-02-30")).toBeNull();
    expect(parseDateKey("not a date")).toBeNull();
  });

  it("describes a day from its breakdown", () => {
    expect(describeActivity(day("2026-03-01", 2, 1, 1))).toBe(
      "2 lessons, 1 quiz, 1 code submission",
    );
    expect(describeActivity({ date: "2026-03-02", count: 1, breakdown: { reading: 0, quizzes: 0, code_submissions: 0 } })).toBe("1 activity");
    expect(describeActivity(day("2026-03-03"))).toBe("No activity");
  });

  it("scales levels to the busiest day", () => {
    expect(activityLevel(0, 8)).toBe(0);
    expect(activityLevel(1, 8)).toBe(1);
    expect(activityLevel(4, 8)).toBe(2);
    expect(activityLevel(5, 8)).toBe(3);
    expect(activityLevel(8, 8)).toBe(4);
    expect(activityLevel(3, 0)).toBe(0);
  });

  it("lists recent activity newest first and skips empty days", () => {
    const result = recentActivity(
      [day("2026-03-01", 1), day("2026-03-05", 0, 2), day("2026-03-03"), day("2026-03-04", 1)],
      2,
    );
    expect(result.map((d) => d.date)).toEqual(["2026-03-05", "2026-03-04"]);
  });

  it("builds Sunday-first week columns ending with the current week", () => {
    // Wednesday 2026-03-11
    const today = new Date(2026, 2, 11);
    const columns = buildCalendar([day("2026-03-11", 1), day("2026-03-08", 2)], today, 3);

    expect(columns).toHaveLength(3);
    expect(columns.every((column) => column.length === 7)).toBe(true);

    const last = columns[2];
    expect(last[0].date).toBe("2026-03-08"); // Sunday
    expect(last[0].count).toBe(2);
    expect(last[3].date).toBe("2026-03-11");
    expect(last[3].count).toBe(1);
    expect(last[3].future).toBe(false);
    expect(last[4].future).toBe(true); // Thursday is after today
    expect(columns[0][0].date).toBe("2026-02-22");
  });

  it("handles month and year boundaries and empty data", () => {
    const columns = buildCalendar([], new Date(2026, 0, 1), 2);
    expect(columns[1][0].date).toBe("2025-12-28");
    expect(columns[1][4].date).toBe("2026-01-01");
    expect(columns.flat().every((cell) => cell.count === 0)).toBe(true);
  });
});
