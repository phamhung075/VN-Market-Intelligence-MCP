/**
 * NarrativePanel — "Narrative" section of /dashboard/orchestration:
 * current_sprint, watch_items, open_sprints, last_closed.
 *
 * Extracted verbatim from dashboard.orchestration.tsx (FACTORY-FRONTEND-split-orchestration).
 */
import type { Narrative } from "~/domain/orchestration/types";

export function NarrativePanel({ narrative }: { narrative: Narrative | undefined }) {
  if (!narrative) {
    return <p className="text-sm text-slate-500">No narrative available.</p>;
  }

  const watchItems = narrative.watch_items ?? [];
  const openSprints = narrative.open_sprints ?? [];

  return (
    <div className="space-y-4 text-sm">
      {narrative.current_sprint && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Current Sprint
          </h3>
          <p className="text-slate-300 leading-relaxed text-xs">{narrative.current_sprint}</p>
        </div>
      )}

      {watchItems.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Watch Items
          </h3>
          <ul className="space-y-1.5">
            {watchItems.map((item, idx) => (
              <li key={idx} className="flex gap-2 text-xs text-slate-300">
                <span className="mt-0.5 text-amber-500 flex-shrink-0">&#9654;</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {openSprints.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Open Sprints
          </h3>
          <ul className="space-y-1">
            {openSprints.map((sprint, idx) => (
              <li key={idx} className="text-xs text-slate-400">
                {sprint}
              </li>
            ))}
          </ul>
        </div>
      )}

      {narrative.last_closed && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Last Closed
          </h3>
          <p className="text-xs text-slate-500">{narrative.last_closed}</p>
        </div>
      )}
    </div>
  );
}
