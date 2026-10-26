import { useRef, useState } from "react";
import {
  activityLevel,
  buildCalendar,
  describeActivity,
  formatDateLabel,
  useActivityHeatmap,
  type CalendarCell,
} from "../lib/activity";
import { useStreak } from "../hooks/useStreak";

const LEVEL_CLASSES = [
  "bg-gray-200 dark:bg-gray-700",
  "bg-green-200",
  "bg-green-400",
  "bg-green-600",
  "bg-green-800",
];

function cellLabel(cell: CalendarCell): string {
  if (!cell.day) return `${formatDateLabel(cell.date)}: No activity`;
  return `${formatDateLabel(cell.date)}: ${describeActivity(cell.day)}`;
}

export function StreakCalendar() {
  const { data, isLoading, error, refetch } = useActivityHeatmap();
  const { streakData } = useStreak();
  const [active, setActive] = useState<[number, number]>([0, 0]);
  const cellRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  if (isLoading) {
    return (
      <div role="status" aria-live="polite" className="p-4 text-sm">
        Loading your streak calendar...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div role="alert" className="p-4 text-sm">
        <p>Could not load your streak calendar.</p>
        <button type="button" onClick={() => refetch()} className="mt-2 underline">
          Try again
        </button>
      </div>
    );
  }

  const columns = buildCalendar(data, new Date());
  const max = Math.max(0, ...data.map((day) => day.count));

  // Roving tabindex: one tab stop for the whole grid, arrow keys move inside it.
  const focusCell = (week: number, weekday: number) => {
    const cell = columns[week]?.[weekday];
    if (!cell || cell.future) return;
    setActive([week, weekday]);
    cellRefs.current[`${week}-${weekday}`]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, week: number, weekday: number) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [week - 1, weekday],
      ArrowRight: [week + 1, weekday],
      ArrowUp: [week, weekday - 1],
      ArrowDown: [week, weekday + 1],
    };
    const target = moves[event.key];
    if (!target) return;
    event.preventDefault();
    focusCell(target[0], target[1]);
  };

  return (
    <section aria-labelledby="streak-calendar-title" className="p-4">
      <h3 id="streak-calendar-title" className="font-bold">
        Streak Calendar
      </h3>
      {streakData && (
        <p className="mt-1 text-sm">
          Current streak: {streakData.current_streak}{" "}
          {streakData.current_streak === 1 ? "day" : "days"} (best:{" "}
          {streakData.highest_streak})
        </p>
      )}
      <div
        role="group"
        aria-label="Daily activity over the last 20 weeks"
        className="mt-3 flex gap-1 overflow-x-auto"
      >
        {columns.map((column, week) => (
          <div key={column[0].date} className="flex flex-col gap-1">
            {column.map((cell, weekday) =>
              cell.future ? (
                <span key={cell.date} aria-hidden="true" className="h-3 w-3" />
              ) : (
                <button
                  key={cell.date}
                  type="button"
                  ref={(node) => {
                    cellRefs.current[`${week}-${weekday}`] = node;
                  }}
                  tabIndex={active[0] === week && active[1] === weekday ? 0 : -1}
                  aria-label={cellLabel(cell)}
                  title={cellLabel(cell)}
                  onFocus={() => setActive([week, weekday])}
                  onKeyDown={(event) => onKeyDown(event, week, weekday)}
                  className={`h-3 w-3 rounded-sm ${LEVEL_CLASSES[activityLevel(cell.count, max)]}`}
                />
              ),
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
