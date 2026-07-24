/**
 * SignalQueuePanel — "Signal Queue" section of /dashboard/orchestration:
 * severity-coloured rows from signal_queue.rows.
 *
 * Extracted verbatim from dashboard.orchestration.tsx (FACTORY-FRONTEND-split-orchestration).
 * severityClasses/SeverityBadge are colocated here — this is their only
 * consumer, so no shared module is needed (unlike taskStatusClasses, which
 * is shared by two sibling files).
 */
import { ClientTimestamp } from "~/components/ClientTimestamp";
import type { SignalQueue } from "~/domain/orchestration/types";

type SeverityLevel = "CRITICAL" | "HIGH" | "MED" | "LOW" | "INFO" | string;

function severityClasses(severity: SeverityLevel): string {
  switch (severity) {
    case "CRITICAL":
      return "bg-red-900 text-red-300 border-red-700";
    case "HIGH":
      return "bg-orange-900 text-orange-300 border-orange-700";
    case "MED":
      return "bg-yellow-900 text-yellow-300 border-yellow-700";
    case "LOW":
      return "bg-slate-700 text-slate-300 border-slate-600";
    case "INFO":
      return "bg-blue-900 text-blue-300 border-blue-700";
    default:
      return "bg-slate-700 text-slate-400 border-slate-600";
  }
}

function SeverityBadge({ severity }: { severity: SeverityLevel }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide ${severityClasses(severity)}`}
    >
      {severity}
    </span>
  );
}

export function SignalQueuePanel({ queue }: { queue: SignalQueue | undefined }) {
  const rows = queue?.rows ?? [];

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No signals in queue.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700 bg-slate-900">
            <th className="px-3 py-2 text-left font-medium text-slate-400">Time</th>
            <th className="px-3 py-2 text-left font-medium text-slate-400">From → To</th>
            <th className="px-3 py-2 text-left font-medium text-slate-400">Severity</th>
            <th className="px-3 py-2 text-left font-medium text-slate-400">Status</th>
            <th className="px-3 py-2 text-left font-medium text-slate-400">Summary</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={row.id}
              className={`border-b border-slate-700 last:border-0 ${
                idx % 2 === 0 ? "bg-slate-800" : "bg-slate-850"
              }`}
            >
              <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                <ClientTimestamp iso={row.ts} className="text-slate-400" />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className="text-slate-300">{row.from}</span>
                <span className="mx-1 text-slate-600">→</span>
                <span className="text-slate-300">{row.to}</span>
              </td>
              <td className="px-3 py-2">
                <SeverityBadge severity={row.severity} />
              </td>
              <td className="px-3 py-2 text-slate-400">{row.status}</td>
              <td className="px-3 py-2 text-slate-200 max-w-xs">{row.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
