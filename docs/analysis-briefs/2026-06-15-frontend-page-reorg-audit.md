<!-- size-justification: generated read-only audit artifact (33 routes × 7 clusters × 8 opportunities) — data feeding a PO sprint, not hand-maintained source. 120L cap N/A. Produced by read-only Explore audit 2026-06-15T20:08Z; router-persisted pending PO scoping. NO code modified. -->

# Frontend Page-Resemblance & Reorganization Audit — 2026-06-15

> **Status:** READ-ONLY audit. No source files modified. Awaiting PO sprint-scoping (PO is single board-writer; this brief is the scoping input).
> **Trigger:** user — "on frontend many pages resemble each other, need merge to categories and organize better."
> **Frontend root:** `apps/frontend` · routes `apps/frontend/app/routes` · layout `dashboard.tsx` (Remix + TS + Tailwind + shadcn/ui).
> **Scale:** 33 dashboard routes · ~17.8K LOC · ~5.1K LOC (29%) removable across the opportunities below.

## Resemblance clusters (7)

| # | Cluster | Member pages | Shared shape | Merge effort |
|---|---|---|---|---|
| 1 | Simple table/screener | financials, officers, shareholders, reputation, services, quality-audit | loader→flat table; striped rows; status badges; `?? "—"` | M / risk L |
| 2 | Card-grid "Top N" rankings | foreign-flow, conviction-history, prediction-claims, sector-rotation, sector-cascade, kinh-dich-signals, news-buzz | summary chips + top bullish/bearish (buy/sell) cards + direction badges | M / risk M |
| 3 | Collapsible/accordion | orchestration, quality-audit | `<Collapsible>` + chevron rotation + count badges | S / risk L |
| 4 | Code-selector (list+detail) | officers, shareholders | `?code=` selector chips + detail table (JSX identical) | S / risk L |
| 5 | Leaderboard ranking | reputation, news-buzz | summary grid + sorted leaderboard + severity badges | S / risk L |
| 6 | Large multi-section (domain) | analysis (1845L), orchestration (997L), market-summaries (999L) | section headers + ticker selector + empty states — **logic orthogonal, DO NOT merge** | — |
| 7 | Content/prose cards | _index, intel, news | article card + sentiment/type/agent badge pills + `<ClientTimestamp>` | S / risk L |

## Proposed taxonomy (6 categories)

- **MARKET-SIGNALS** — analysis, kinh-dich-signals, kinh-dich-reference, sector-cascade, sector-rotation, conviction-history, technical
- **MACRO-CONTEXT** — _index, intel (MERGE→_index), macro, global-markets, fed-rates, market-summaries
- **EQUITIES-FUNDAMENTALS** — financials, officers, shareholders, bctc, bctc-eval (+ :reportId), bctc-inspect
- **NEWS-SENTIMENT** — news, news-buzz, corporate-events, reputation
- **DATA-OPS** — alerts, prediction-claims, foreign-flow
- **SYSTEM-HEALTH** — services, fetch, db, vps, orchestration, quality-audit, agm-plan-actual

Realize via Remix route groups `dashboard.(market-signals)/…` — folder organization only, **no URL change**.

## Merge / extract opportunities (priority-ordered)

| P | Opportunity | Pages | Effort | Risk | Savings |
|---|---|---|---|---|---|
| P0 | Merge `dashboard.intel` → `dashboard._index` (exact dup; same `/api/market-digest`, view toggle) | 2 | S 1h | L | 225L |
| P1 | Extract `<ScreenerTable>` (configurable columns/renderers) | 5 | M 3h | M | 800L |
| P1 | Extract `<SummaryGrid>` + `<LeaderboardCard>` + `<DirectionBadge>` | 8 | M 4h | M | 1.2K L |
| P1 | `lib/api/loader-utils.ts` `safeFetch<T>(url,parser)` (kills loader boilerplate) | all 33 | M 4.5h | L | 2K L |
| P2 | Extract `<CodeSelector>` + `<DetailPanel>` | 2 | S 1.5h | L | 500L |
| P2 | Extract `<ContentCard>` + sentiment/type/agent badge components | 3 | S 1.5h | L | 200L |
| P3 | Extract `<CollapsibleSection>` | 2 | S 1h | L | 150L |
| P3 | Route-group folder refactor (org only, no URL change) | all | S 1h | L | 0 |

## Scoping recommendation (for PO)

No API-contract, route-URL, or behavior changes — pure internal consolidation, so existing tests should stay green untouched. Suggested two waves:
- **Wave 1 (P0+P1):** merge intel→_index, extract ScreenerTable, SummaryGrid/LeaderboardCard, loader-utils → ~1.5K LOC removed first pass.
- **Wave 2 (P2+P3):** CodeSelector/DetailPanel, ContentCard/badges, CollapsibleSection, route-group folders + unit tests on extracted components.

**/goal alignment:** generic shared components (one `<ScreenerTable>` serving all entities) directly serve /goal#2 (same fix across all pages, no per-page special-casing); extraction must preserve every served metric (no destructuring-default masking — verify each migrated cell renders real loader data, not a placeholder).

**Routing:** owner = `po` → chain `ba → architect → pm → dev-frontend → qa`. Blocked only on the in-flight BCTC P0 sprint freeing a PO turn (single board-writer; WIP≤2).
