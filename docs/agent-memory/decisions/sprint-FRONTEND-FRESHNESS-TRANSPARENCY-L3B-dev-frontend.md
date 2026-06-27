---
sprint: FRONTEND-FRESHNESS-TRANSPARENCY
task: TASK-FFT-L3B
agent: dev-frontend
date: 2026-06-28
---

# Decision: generatedAt over date-only asOf for FreshnessBadge

**Context:** Coverage map lists `asOf` as the data_asof field for weekly routes (corporate-events, fed-rates, financials, officers, reputation, shareholders). But `asOf` in these loaders is a date-only string like "2026-06-27" (from YYYY-MM-DD database columns). When passed to `new Date()`, this is parsed as midnight UTC — displaying as "07:00:00" in VN timezone, which is misleading.

**Decision:** Use `generatedAt` (ISO timestamp, always present in LoaderData) for FreshnessBadge on these routes. `generatedAt` is the API response generation time and accurately represents data freshness for the badge display. Added `generatedAt` to useLoaderData destructuring for the 6 routes that hadn't already extracted it.

**Kept:** Existing `asOf` text display ("Dữ liệu tính đến: {asOf.slice(0,10)}") alongside the badge — this shows data coverage date which is semantically distinct from freshness.

# Decision: bctc-inspect raw proxy skip

**Context:** `dashboard.bctc-inspect.tsx` returns `new Response(htmlBody, ...)` with no React component. Cannot inject FreshnessBadge.

**Decision:** Skip wiring. Flagged in handoff as `SKIPPED_RAW_PROXY`. Coverage map `l3b_status = "SKIPPED_RAW_PROXY"`.

# Decision: market-summaries dual-mode badge

**Context:** `MarketSummariesPage` dispatches to `ListView` or `DetailView` sub-components (React hook rules require hooks in each branch).

**Decision:** Added `useFreshnessRevalidator("daily")` + FreshnessBadge to both ListView (in PageHeader actions) and DetailView (as `actions` prop). DetailView destructures `generatedAt` from its `data` prop (the detail mode type includes it).

# Decision: EC-8 unconditional badge

**Context:** Original sector-rotation code: `{!tradingDate && generatedAt && <span>time</span>}`. The condition `!tradingDate` suppressed the timestamp when tradingDate was present.

**Decision:** Replace with unconditional `<FreshnessBadge dataAsof={generatedAt ?? null} slaTierKey="realtime" />`. FreshnessBadge handles null gracefully (gray "Chưa có dữ liệu" badge). The `tradingDate` display is kept separately as session metadata, not a freshness indicator.
