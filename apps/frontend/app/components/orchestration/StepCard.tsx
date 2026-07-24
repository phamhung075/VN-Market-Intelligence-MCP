/**
 * StepCard — renders a single decision-journal StepDto entry.
 * F3: AC-F3-9. No dangerouslySetInnerHTML (AC-F3-12).
 *
 * Extracted verbatim from dashboard.orchestration.tsx (FACTORY-FRONTEND-split-orchestration).
 */
import { ClientTimestamp } from "~/components/ClientTimestamp";
import type { StepDto } from "~/domain/orchestration/types";

export function StepCard({ step }: { step: StepDto }) {
  return (
    <div
      className="border-l-2 border-slate-600 pl-3 pb-1"
      style={{ overflowWrap: "break-word" }}
    >
      {/* Header: step_id · agent_id */}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold text-slate-200">
          {step.step_id}
        </span>
        <span className="text-slate-600">·</span>
        <span className="text-xs text-slate-400">{step.agent_id}</span>
        <span className="text-slate-600">·</span>
        <ClientTimestamp iso={step.timestamp} className="text-xs text-slate-500" />
      </div>

      {/* what_done */}
      <div className="mb-1 text-xs">
        <span className="font-medium text-slate-400">What was done: </span>
        <span className="text-slate-300">{step.what_done}</span>
      </div>

      {/* what_considered — bullet list */}
      {step.what_considered.length > 0 && (
        <div className="mb-1 text-xs">
          <span className="font-medium text-slate-400">What was considered:</span>
          <ul className="mt-0.5 space-y-0.5 pl-4">
            {step.what_considered.map((item, idx) => (
              <li key={idx} className="flex gap-1.5 text-slate-400">
                <span className="flex-shrink-0 text-slate-600">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* why_decision */}
      <div className="mb-1 text-xs">
        <span className="font-medium text-slate-400">Why this decision: </span>
        <span className="text-slate-300">{step.why_decision}</span>
      </div>

      {/* why_change */}
      <div className="text-xs">
        <span className="font-medium text-slate-400">Why it changed: </span>
        <span className="text-slate-300">{step.why_change}</span>
      </div>
    </div>
  );
}
