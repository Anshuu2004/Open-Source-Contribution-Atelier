import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "./api";

export interface ActivityBreakdown {
  reading: number;
  quizzes: number;
  code_submissions: number;
}

export interface ActivityDay {
  date: string; // YYYY-MM-DD
  count: number;
  breakdown: ActivityBreakdown;
}

export const CALENDAR_WEEKS = 20;

/** Format a Date as YYYY-MM-DD using its local calendar day. */
export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Parse YYYY-MM-DD as a local date, so no timezone shift moves it to another day. */
export function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return toDateKey(date) === key ? date : null;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export function formatDateLabel(key: string): string {
  const date = parseDateKey(key);
  if (!date) return key;
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "2 lessons, 1 quiz" style summary; falls back to the plain count. */
export function describeActivity(day: ActivityDay): string {
  const parts: string[] = [];
  const { reading, quizzes, code_submissions } = day.breakdown;
  if (reading) parts.push(plural(reading, "lesson", "lessons"));
  if (quizzes) parts.push(plural(quizzes, "quiz", "quizzes"));
  if (code_submissions) {
    parts.push(plural(code_submissions, "code submission", "code submissions"));
  }
  if (parts.length) return parts.join(", ");
  return day.count > 0 ? plural(day.count, "activity", "activities") : "No activity";
}

/** Heat level 0-4, scaled to the busiest day in the window. */
export function activityLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  const ratio = count / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

export interface CalendarCell {
  date: string;
  count: number;
  day: ActivityDay | null;
  future: boolean;
}

/**
 * Build week columns (Sunday first) covering the last `weeks` weeks up to and
 * including `today`. Days after today are marked `future` and left empty.
 */
export function buildCalendar(
  days: ActivityDay[],
  today: Date,
  weeks = CALENDAR_WEEKS,
): CalendarCell[][] {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const start = addDays(today, -today.getDay() - (weeks - 1) * 7);
  const todayKey = toDateKey(today);
  const columns: CalendarCell[][] = [];

  for (let week = 0; week < weeks; week++) {
    const column: CalendarCell[] = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      const date = toDateKey(addDays(start, week * 7 + weekday));
      const day = byDate.get(date) ?? null;
      column.push({
        date,
        count: day?.count ?? 0,
        day,
        future: date > todayKey,
      });
    }
    columns.push(column);
  }

  return columns;
}

/** Most recent days with activity first. */
export function recentActivity(days: ActivityDay[], limit = 10): ActivityDay[] {
  return days
    .filter((day) => day.count > 0)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit);
}

export function useActivityHeatmap(today: Date = new Date()) {
  const start = toDateKey(addDays(today, -(CALENDAR_WEEKS * 7 + 7)));
  const end = toDateKey(today);

  return useQuery<ActivityDay[]>({
    queryKey: ["activity-heatmap", start, end],
    queryFn: () =>
      fetchApi(`/progress/heatmap/?start_date=${start}&end_date=${end}`, {
        suppressErrorToast: true,
      }),
  });
}
