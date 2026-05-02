# PO Notebook

## Last updated: 2026-05-02 (session 4)

## Current sprint: 1833

### State at triage

- Baseline: 8608 pass / 0 fail, totalTasksDone=486, Sprint=1833
- Sprint 1832 DONE: semble semantic code search integrated — semble-search agent + skill, lazy_load wired into 6 agents, dev-standards updated
- Branch: main only, clean (scheduled_tasks.lock modification only — auto-generated, not actionable)
- TASKS.md: Backlog has 2 new tasks (1833a + 1833b)

### Telegram / session audit (2026-05-02)

| Source | Finding | Action |
|--------|---------|--------|
| docs/agent-memory/sessions/2026-05-02-janitor.md | JANITOR-020: marketContextTools.ts duplicates MACRO_CODES + section-builder logic from marketContextBuilder.ts (two-file change) | Added as 1833a |
| docs/agent-memory/sessions/2026-05-02-ops.md | StartLimitIntervalSec fix deployed — resolved | No action (3dbc92a1 merged) |
| docs/agent-memory/sessions/2026-05-02-ops.md | deploy-vinahost.sh market-hours guard — verify script already has guard at lines 18-32 | No action needed |
| git status + notebook diff | semble-search agent added in Sprint 1832 — notebook missing | Added as 1833b |
| git status + notebook diff | devAgentCount=13+9=22 in project-stats.json; actual agent files=23 (semble-search added) | Added as 1833b |
| 1822d-b handoff | VPS Playwright scripts removed (discover-bctc-urls-browser.py deleted, vps-proxy-server.js clean) | Already DONE — no task needed |

### Already-fixed items (cross-referenced git log)

| Item | Commit | Sprint |
|------|--------|--------|
| VPS StartLimitIntervalSec in [Service] section | 3dbc92a1 | ops session |
| deploy-vinahost.sh stale Playwright references | 3dbc92a1 | ops session |
| 1822d-b VPS bctc-discover handler removal | verified via grep | — |
| pollNews zero-check false all-dark alerts (BUG 2727+2728) | cf7add23 / cf94bdc2 | 1832b |

### Sprint 1833 plan (updated session 2 — ops health check findings)

Channel audit: ops VPS health check surfaced 4 new issues. No Telegram read available (MCP tool not in scope), but ops session report used as equivalent source.

| Issue | Task | Priority | Agent | Root cause label |
|-------|------|----------|-------|-----------------|
| BCTC push silent 5 days | 1833c | P1-CRITICAL | ops | new-bug (VPS push endpoint or service config) |
| Foreign flow 31h gap | 1833d | P2-HIGH | ops | new-bug (data loss assessment) |
| vnstock_officers NOT NULL | 1833e | P3-MEDIUM | developer | new-bug (recurring, null guard missing) |
| vn-news-fetch stale heartbeat | 1833f | P4-LOW | ops | new-bug (heartbeat timestamp stale) |

Cross-check vs fix history: none of these 4 appear in Done tasks or recent git log — all are genuine new bugs, not regressions or deploy gaps.

Carry-over:
1. SPRINT-S 1833a — DRY: marketContextTools.ts delegate to marketContextBuilder.ts (JANITOR-020)
2. FIX 1833b — scaffold semble-search notebook + sync devAgentCount in project-stats.json (23 total)

### Sprint 1833 scope expansion (session 3 — ops full recheck)

Ops full server status recheck surfaced 8 additional issues. Cross-checked against existing 1833 backlog:

| Issue | Existing task | Net-new task | Reason |
|-------|--------------|--------------|--------|
| ISSUE-2: BCTC 0 pushes | 1833c | — | Already tracked |
| ISSUE-5: vnstock_officers NOT NULL | 1833e | — | Already tracked |
| ISSUE-1: foreign flow SLA non-market-hours | 1833d (gap) | 1833h | Different fix: SLA monitor logic |
| ISSUE-3: vn-news-fetch OOM crash | 1833f (heartbeat) | 1833g | Different fix: disable VPS Playwright |
| ISSUE-4: vnstock rate-limit ACB+VCI | — | 1833i | Net-new |
| ISSUE-6: ohlcv aggregator missing run | — | 1833j | Net-new |
| ISSUE-7: TE Chromium 114 failures | — | 1833k | Net-new |
| ISSUE-8: Yahoo Finance 404 | — | 1833l | Net-new |

6 net-new tasks added: 1833g, 1833h, 1833i, 1833j, 1833k, 1833l.
Sprint 1833 now has 12 tasks total. SPRINT_GOAL.md updated accordingly.

### Sprint 1833 scope revision (session 4 — ops pipeline deep-dive)

Ops deep-dive diagnostic resolved ambiguity on 5 tasks. Net result: 2 closed as false alarms, 3 root causes updated with deeper precision.

| Task | Action | Root cause update |
|------|--------|-------------------|
| 1833c | Root cause updated | Not VPS crash. bctcQueueEnricherJob runs but produces 0 URLs. URL discovery silent on empty result. Dev fix: add WARNING log + verify congbao scraping. Owner changed ops→developer. |
| 1833d | CLOSED — false alarm | Vietnam Labor Day 2026-05-01. VPS correctly idle. 31h gap expected. SLA monitor blindness tracked separately as 1833h. |
| 1833g | Root cause confirmed + scope expanded | Playwright crash loop on te-chromium-news confirmed ("Target closed", 20-40s cycle). Two sub-fixes added: circuit breaker (max restart/hour) + disable dead sources (Reuters RSS + TE legacy, 58+ failures, never succeeded). RSS layer healthy (90 pushes/24h, 0 errors). |
| 1833i | Scope expanded | Not just ACB/VCI. ACV + VDC also affected. Root cause: job-level concurrency across all tickers+endpoints exceeds API rate cap; per-ticker backoff insufficient. Global rate limiter needed. officers NOT NULL surfacing added as sub-fix. |
| 1833j | CLOSED — false alarm | Saturday 2026-05-02, market closed, aggregator correctly skipped. 7 rows/31 tickers consistent with calendar. TA resumes Monday 2026-05-05. |

TASKS.md and SPRINT_GOAL.md updated accordingly.

### Test baseline tracking

| Sprint | Pass | Fail | Date |
|--------|------|------|------|
| 1832 close | 8608 | 0 | 2026-05-02 |
| 1833 target | 8608+ | 0 | — |
