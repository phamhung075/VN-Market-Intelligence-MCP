import { ClientTimestamp } from "~/components/ClientTimestamp";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";

/**
 * StalenessTag — shows how old the analysis brief is.
 * Age > 24h → amber "CŨ"; else shows timestamp.
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function StalenessTag({ updatedAt }: { updatedAt: string | null }) {
  if (!updatedAt) return null;
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  const isStale = ageMs > 24 * 60 * 60 * 1000;
  return (
    <span
      className={
        isStale
          ? "rounded border border-amber-600 bg-amber-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300"
          : "rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400"
      }
    >
      {isStale ? "CŨ" : ""}
      <ClientTimestamp iso={updatedAt} className="ml-1 font-normal normal-case tracking-normal" />
    </span>
  );
}

/**
 * BriefSection — a labelled collapsible section for one brief field.
 * label: Vietnamese label (Cơ bản / Tin tức / Giá / Tổng hợp)
 * content: prose string or null
 *
 * Extracted from dashboard.analysis.tsx (FACTORY-FRONTEND-split-dashboard-analysis) —
 * pure move, no behavior change.
 */
export function BriefSection({
  label,
  content,
  defaultOpen = false,
}: {
  label: string;
  content: string | null;
  defaultOpen?: boolean;
}) {
  if (!content) {
    return (
      <div className="rounded border border-slate-700 bg-slate-800/50 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
        <p className="mt-1 text-xs text-slate-600 italic">Chưa có dữ liệu.</p>
      </div>
    );
  }

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <div className="rounded border border-slate-700 bg-slate-800/50">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {label}
          </span>
          <span aria-hidden="true" className="text-slate-500 text-xs select-none">
            ▾
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-slate-700 px-4 py-3">
            <p className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">
              {content}
            </p>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
