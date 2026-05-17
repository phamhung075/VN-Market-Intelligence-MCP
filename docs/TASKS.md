# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md` | **Archived Done tasks:** See `docs/TASKS_ARCHIVE.md` for complete history (1777–1896+)

---
## Backlog

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| alert-precision-488-unknowns | **MONITORING**: Post-DB-rebuild agent_signals=46 (fresh DB). HOLD until ≥550. From TNB c58 Finding #8 + bug 2874. | MEDIUM | TRACKING | — | — | — |
| fa-shape-guard-watch | **MONITORING**: Next observation = first post-restart FA live session. Auto-cure trigger: REGIME-mismatch or news-fallback → spawn 1921a-fa-shape-guard-propagate. If NEUTRAL macro_snapshot → close. | MEDIUM | TRACKING | — | — | — |
| 1907a-digest-predict-silence | **CRITICAL** (c163 update): 6+ day silence since 2026-05-11 21:38 UTC. Pattern now confirmed: ALL cowork scheduled tasks lack MCP access (digest-predict silent, market-watcher/alert-commander/qa-responder/news-scout all blocked in scheduled sessions). Root cause: MCP connector not configured in Claude Desktop scheduled task environment. **USER-ACTION**: Open Claude Desktop → verify MCP connector is enabled in scheduled task settings, OR trigger manually from Cowork web interface with MCP pre-connected. | CRITICAL | OPS | user | — | — |
| 1897b-carry | F1 USER: Docker .git/ exclude bundle + VirtioFS structural fix. PREFLIGHT cure permanent policy (1906a c89). F1 USER action (Docker .git/ exclusion) is the only structural cure. Brief: `docs/architecture-briefs/2026-05-13-headlock-recurrence-post-F2a.md`. | HIGH | URGENT-F1 | user | — | — |

---

## Todo
| 1862c-E | OPS-HIGH: SSE keepAliveTimeout fix. (a) E-config Done (commit 16ff50e1). (b) E-dashboard **USER-ACTION**: Cloudflare dashboard ingress for `/vn-market/sse` not configured → 404. User must configure Cloudflare tunnel ingress. | HIGH | OPS | user | TASK_1862c-E.md | — |
| 1922g-pharma-events-source-verify | **OBSERVE** — `pharma_events` empty. `davPharmacyJob` cron `0 6 1 * *`. Next tick = 2026-06-01 06:00 UTC. AC: check status + row count after tick. | LOW | OBSERVE | ops | — | 2026-06-01 |
| 1922i-alert-engine-records | **WONTFIX c160 (SPIKE-1933a resolved)** — alert_engine_records always 0: evaluateAlert() dead code deleted (1933b). Architecture: market.db.alerts → Alert Commander = canonical intelligence path. Go alert-engine (/evaluate) reserved for future stop-loss use case. | MEDIUM | WONTFIX | — | — | — |

---

## In Progress

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| _(empty)_ | — | — | — | — | — | — |

---

## Review

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| _(empty)_ | — | — | — | — | — | — |

---
## Done

| Task ID | Title | Priority | Type | Owner | Completed |
| 1933b-delete-evaluateAlert-dead-code | **DONE c160** — Deleted `evaluateAlert()`, `AlertEvaluateRequest`, `AlertEvaluateResponse` from `apps/mcp-server/src/infrastructure/microservices/clients.ts`. Zero callers confirmed (grep-verified). SPIKE-1933a WONTFIX: market.db.alerts → Alert Commander is canonical; Go alert-engine reserved for future stop-loss. tsc 0 errors. | MEDIUM | FIX | dev-mcp-server | 2026-05-17 |
| 1928a/1929a/1930a/1930c | **DONE c159** — 1928a extra_hosts fix (virtiofs DNS), 1929a alerts table healthy (516 rows), 1930a verdictResolutionJob rows_written=0 (1926a held), 1930c rag-service healthy (LENC not recurring). | HIGH | OPS | ops | 2026-05-17 |
| 1862c-F | **DONE c156** — SseSessionManager structured 404 + heartbeat eviction. 5/5 tests GREEN. | MEDIUM | FIX | developer | 2026-05-17 |
| 1930b-fa-ocf-extraction-bug | **DONE c157** — `get_cash_flow` OCF/NI ratio guard. `OCF_NI_RATIO_PLAUSIBILITY_LIMIT=20`. FPT (504×) + VCB (1.42e8×) suppressed. 7/7 tests GREEN, tsc 0 errors. | HIGH | FIX | dev-mcp-server | 2026-05-17 |
| 1932a-frontend-dashboard-pages | **DONE 2026-05-17 c156** — 4 dashboard pages shipped: server / fetch / vps / db. Routes under `apps/frontend/app/routes/`. Builds cleanly, fetches from API_GATEWAY_URL via existing client.ts. Commit: 5945475e. Independent of MCP gateway (frontend zone has zero MCP coupling). | HIGH | FIX | dev-frontend | — | 2026-05-17 |
| 1931a-frontend-scaffold-harden | **DONE 2026-05-17 c155** — All 5 risk flags closed. Dockerfile (Node 20 Alpine multi-stage), docker-compose frontend service (port 3001, depends_on api-gateway), npm install (757 pkgs), components.json + shadcn Button/Card/Input primitives, playwright.config.ts + smoke.spec.ts, API_GATEWAY_URL wired in client.ts + _index.tsx loader. Vitest 3/3 GREEN, tsc 0 errors. Commits: ecda4fc2 + 0e443e03. | HIGH | FIX | dev-frontend | — | 2026-05-17 |
| 1922f-bond-maturity-source-verify | **DONE 2026-05-17 c149** — AC MET. `bondMaturityPollerJob` cron `30 2 * * 0` fired 02:30 UTC. `get_bond_maturity_calendar` via MCP returned ≥1 row: NVL (Novaland, 5,000 tỷ VND, 2026-09-15, 10.5%/năm). Observational task complete. | LOW | OBSERVE | ops | 2026-05-17 |
| 1927a-manufacturing-pmi-fix | **DONE 2026-05-17 c147** — manufacturing_pmi always null: (1) Bun.serve `idleTimeout` 10s killed `/macro/external` before TE scraper completed (65s budget) — fix: `idleTimeout: 120` in `apps/macro-indicators/src/index.ts`. (2) `macroIndicatorRefreshJob.ts` never extracted PMI from external response — fix: added `parsePmiFromText()` + `parsePmiFromExternal()`, upsert now passes `parsedPmi` instead of `null`. TC6/TC7/TC8 added, 8/8 GREEN, tsc 0 errors. Commit `8d4716b7`. Docker rebuild pending (blocked by Docker DNS deadlock). | HIGH | FIX | dev-mcp-server | 2026-05-17 |
| 1926a-verdict-retry-storm | **DONE 2026-05-17 c146** — verdictResolutionJob retry storm (26 reports, MACRO_GOLD/VNH/WATCHLIST-31 repeated hourly). Fix: when `fetchHistory` or `fetchPrice` returns null, mark verdict `false_positive` with `detail:"price-fetch-failed:unresolvable"` + send ONE BUG telegram. Row excluded from next run by `verdict!=='pending'` filter. 3 new tests (1926a idempotency) + 2 existing tests updated. 19/19 GREEN, tsc 0 errors. Reports 2894-2927 all resolved. | HIGH | FIX | dev-mcp-server | 2026-05-17 |
| 1925a-lancedb-reinit | **DONE 2026-05-17 c145** — LanceDB `rag_entries.lance` corrupt (lance-file-4.0.0 rejected old magic bytes [76,65,78,67]). Fix: `db.drop_table('rag_entries')` from within rag-service container (20,631 rows dropped — embeddings regenerate on next news cycle). Rag-service restarted; `search_similar_context` now returns `{results:[],total:0}` instead of error. Reports 2925+2926 resolved. Resolves news-scout report "LanceDB vĩnh viễn lỗi". | HIGH | OPS | ops | 2026-05-17 |
| 1924a/b/c/d | **DONE 2026-05-17** — Wire live VN CPI into macro_indicators. `parseCpiFromText()` exported from macroIndicatorRefreshJob.ts (regex first-number-before-percent). `getMacroExternal()` added to clients.ts (never throws, returns null on error). Job now calls `/macro/external` after `/macro/snapshot`; parsed CPI upserted via COALESCE. `manufacturing_pmi` slug added to `VN_TE_SLUGS` (both `.ts` + `.py`). 1924b DB patch applied: cpi=5.46 live in Docker container. 5/5 TC GREEN, tsc 0 errors. | HIGH | FIX | dev-mcp-server | 2026-05-17 |
| 1923a | **DONE 2026-05-16 c143** — Investment clock case-mismatch fix. `investmentClockTools.ts`: query param `"Vietnam"` → `"vietnam"` (matches DB SSOT). `macroIndicatorRefreshJob.ts`: upsert country key `"Vietnam"` → `"vietnam"` + expanded ON CONFLICT SET to COALESCE `manufacturing_pmi`, `cpi`, `gdp_growth`, `inflation_rate` (null-safe; snapshot doesn't expose these, existing DB values preserved). 4/4 TC GREEN (TC1-TC4). tsc 0 errors. `get_investment_clock_phase` now returns RECOVERY (gdpGrowth=7.4 UP, CPI=2.84 LOW) instead of insufficient_data. | HIGH | FIX | dev-mcp-server | 2026-05-16 |
| 1909c-reparse-validation | **DONE 2026-05-16 c142 21:35 UTC** — DIG Q4-2025 reparse successful. Triggered `bctcReparseJob` with manual agent_feedback entry. Old values: confidence=62.5%, equity=10,028,528,477 tỷ (absurd). New values: confidence=68.75% ✓, equity=10,028,528.477 VND ✓. AC: confidence ≥ 0.6 PASS, equity < 50,000 tỷ PASS. Unblocks FA Layer 7. Commit: none (ops task). | HIGH | OPS | ops | 2026-05-16 |
| _(c141–c147 Done entries archived → `docs/archive/sprints-c141-c147.md`: SPRINT-1922 + 1922a/b/c/d/e/f/h/j + 1923a + 1923-mw-gateway + 1909c + 1924a/b/c/d + 1925a + 1926a + 1927a. Pre-c141: git history.)_ | — | — | — | — | 2026-05-16..17 |

---

## Deferred

| Sprint | Title | Reason | Next Step |
|--------|-------|--------|-----------|
| 1887 | METHODOLOGY-FORENSICS: Virtual Capital / related-party graph detector | Needs own architect brief — graph-store choice, related-party data source, traversal patterns, false-positive control all unspecified | When 1885+1886 ship, queue separate ARCH-1887 brief before ba spec |
| 1892a-ops AC-3 | OPS-NOTE: 1892a-ops AC-3 now UNBLOCKED by 1892b merge (2026-05-12). VPS POST to `/api/push-news` should reach MCP server after deploy. | Unblocked 2026-05-12 | ops re-verify next cycle (observational) |
| TNB-c39-#3 | MONITOR: unified-agent FPT pillar gap (2nd cycle of evidence at c39) | Per TNB protocol need 3rd cycle to auto-cure. | If c40 unified-agent cycle repeats FPT-without-pillars pattern → spawn auto-cure CHORE. If c40 PASSES → close as transient. |
