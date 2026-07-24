/**
 * Section header. /dashboard/market-summaries.
 * FACTORY-FRONTEND-split-market-summaries: extracted verbatim from the route file.
 */
export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-bold text-slate-100 mb-3">{children}</h2>
  );
}
