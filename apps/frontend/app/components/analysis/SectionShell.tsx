/**
 * SectionShell — generic layout primitives shared across /dashboard/analysis panels.
 * SectionCard: titled card shell with optional subtitle.
 * Row: label + value line (used inside Kinh Dịch / detail panels).
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900">
      <div className="border-b border-slate-700 px-4 py-3">
        <h2 className="font-semibold text-slate-300">
          {title}
          {subtitle && (
            <span className="ml-2 text-xs font-normal text-slate-500">
              {subtitle}
            </span>
          )}
        </h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-slate-500">{label}</span>
      {value}
    </div>
  );
}
