# Task Report: IND-P1-FRONTEND-GAUGE-CARDS
date: 2026-06-30
sprint: MARKET-INDICATOR-DEPTH-P0
outcome: APPROVED

## Test Results

| File | Tests | Result |
|---|---|---|
| ind-p1-frontend-gauge-cards.test.ts | 45 | PASS |
| ind-p1-indicator-gauges-nav.test.tsx | 13 | PASS |
| FE-HEADER-SSOT-top-nav.test.tsx (edited) | 26 | PASS |
| task17-page19-news-buzz-nav.test.tsx (edited) | 15 | PASS |
| Full suite | 1918 pass / 2 fail | 2 pre-existing QUE-TOOLTIP failures (commit d7167c0a, unrelated to this task) |

- TypeScript: 0 errors (`bun tsc --noEmit`)
- mock-guard: PASS (exit 0)

## DDD Compliance: PASS

- `api.indicator-gauges.tsx`: interface layer only — `proxyUpstream` call, no domain/infra imports
- `dashboard.indicator-gauges.tsx`: interface layer — `safeFetch` via `~/lib/api/fetchUtils`, no domain/infra imports

## Security: PASS

- `process.env`: present but this is the established project-wide pattern for frontend Remix routes (not a Bun server). Non-blocking.
- No hardcoded credentials, no secrets, no SQL (frontend HTTP only)

## Live E2E

- `GET http://localhost:3001/dashboard/indicator-gauges` → HTTP 200
- `GET http://localhost:3001/api/indicator-gauges` → `{"error":"Not found","path":"/api/indicator-gauges"}` (mcp-server endpoint not yet deployed — expected)
- Page HTML: 6 card titles present, 17 "Chưa có dữ liệu" honest-NULL markers rendered

## Coverage-Map Card↔Row Mapping

| Card | Coverage-map row element |
|---|---|
| Card 1 — Biến Động Thị Trường | rv_20d_percentile + vol_regime (volatility gauge) |
| Card 2 — Tâm Lý Tin Tức | news_sentiment_z + history_quality (sentiment gauge) |
| Card 3 — Độ Rộng Thị Trường | breadth_z_score.value (breadth gauge) |
| Card 4 — Dòng Vốn Khối Ngoại | foreign_outflow_z_5d + market_saturation_pct (foreign room gauge) |
| Card 5 — OMO Tịnh Thanh Khoản | omo_net_outstanding_bn_vnd + policy_refi_rate_pct (liquidity gauges) |
| Card 6 — Lãi Suất Tái Cấp Vốn | omo_net_outstanding_bn_vnd + policy_refi_rate_pct (liquidity gauges) |

**6 cards vs 5 rows: INTENTIONAL.** Cards 5 + 6 are two UI cards derived from a single `liquidity` API section. The coverage-map l3b_note on row 5 explicitly states "2 cards from 1 liquidity section". Zero cards lack coverage-map provenance.

## DoD Decision: Upstream Endpoint Not Deployed

The proxy `GET /api/indicator-gauges` returns `{"error":"Not found"}` because `mcp-server :3000/api/indicator-gauges` is not yet deployed.

**Decision: DoD SATISFIED.** Rationale:
1. Task zone is `apps/frontend` only — a frontend-layer task.
2. The proxy route doc comment says "Expected response shape (when mcp-server endpoint is deployed)" — explicitly forward-looking.
3. The coverage-map marks all 5 rows `status: "GAP"` with `fix: "IND-P1-DEV-MCP-SERVER: add GET /api/indicator-gauges endpoint"` — the backend endpoint is a tracked future task.
4. The backend endpoint is a separate task: `IND-P1-MCP-PROXY-INDICATORS` in BACKLOG.
5. The task's own review_note (in orch-state) explicitly states "CRITICAL DEPENDENCY: mcp-server /api/indicator-gauges endpoint not yet deployed — frontend gracefully renders honest-NULL on 404/502."
6. Honest-NULL rendering is the spec-compliant behavior when upstream is absent (no fabrication).

**Follow-up task required:** `IND-P1-MCP-PROXY-INDICATORS` (already in BACKLOG) must implement `GET /api/indicator-gauges` in mcp-server aggregating the 5 P0 tools.

## Issues Found

None blocking.

## Commits Shipped

- `0c724d58` — feat(IND-P1-FRONTEND-GAUGE-CARDS): 6 P0 indicator gauge cards + nav entry
- `1ce9a777` — chore(IND-P1-FRONTEND-GAUGE-CARDS): coverage-map +5 rows + orch-state → REVIEW
