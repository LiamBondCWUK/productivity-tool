import type { DocHealthItem } from "../types/dashboard";

interface DocHealthTabProps {
  lastRun: string | null;
  staleDocs: DocHealthItem[];
}

export function DocHealthTab({ lastRun, staleDocs }: DocHealthTabProps) {
  const ordered = [...staleDocs].sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

  return (
    <div className="h-full p-4 overflow-y-auto">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-100">Documentation Freshness</h2>
        <p className="text-xs text-gray-400 mt-1">
          Stale docs are flagged from overnight analysis when unchanged for more than 21 days.
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Last run: {lastRun ? new Date(lastRun).toLocaleString("en-GB") : "No run yet"}
        </p>
      </div>

      {ordered.length === 0 ? (
        <div className="rounded border border-green-700/40 bg-green-900/20 p-3 text-xs text-green-300">
          No stale documentation items detected.
        </div>
      ) : (
        <div className="space-y-2">
          {ordered.map((item) => (
            <div key={item.id} className="rounded border border-gray-700/60 bg-gray-800/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-gray-100">{item.project}</p>
                <span className="text-xs px-2 py-0.5 rounded bg-yellow-600/20 text-yellow-300">
                  {item.priority}
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-1">{item.filePath}</p>
              <p className="text-xs text-gray-400 mt-1">{item.reason}</p>
              <p className="text-xs text-gray-500 mt-1">
                {item.daysSinceUpdate} days since update · last modified {item.lastModified}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
