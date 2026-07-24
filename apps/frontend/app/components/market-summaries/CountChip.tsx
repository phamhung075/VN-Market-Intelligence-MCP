/**
 * Count chip — icon label + count. /dashboard/market-summaries.
 * FACTORY-FRONTEND-split-market-summaries: extracted verbatim from the route file.
 */
export function CountChip({
  label,
  count,
  colorClass = "text-slate-400",
}: {
  label: string;
  count: number;
  colorClass?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-medium ${colorClass}`}
    >
      {label}:{" "}
      <span className="font-bold text-slate-200">{count}</span>
    </span>
  );
}
