import {
  describeActivity,
  formatDateLabel,
  recentActivity,
  useActivityHeatmap,
} from "../lib/activity";

export function RecentActivity() {
  const { data, isLoading, error, refetch } = useActivityHeatmap();

  if (isLoading) {
    return (
      <div role="status" aria-live="polite" className="p-4 text-sm">
        Loading recent activity...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div role="alert" className="p-4 text-sm">
        <p>Could not load your recent activity.</p>
        <button type="button" onClick={() => refetch()} className="mt-2 underline">
          Try again
        </button>
      </div>
    );
  }

  const items = recentActivity(data);

  if (items.length === 0) {
    return (
      <div className="p-4 text-sm">
        <h3 className="font-bold">Recent Activity</h3>
        <p className="mt-2">
          No activity yet. Finish a lesson or a quiz and it will show up here.
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="recent-activity-title" className="p-4">
      <h3 id="recent-activity-title" className="font-bold">
        Recent Activity
      </h3>
      <ul className="mt-3 space-y-2 text-sm">
        {items.map((day) => (
          <li key={day.date} className="flex justify-between gap-4">
            <span>{formatDateLabel(day.date)}</span>
            <span>{describeActivity(day)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
