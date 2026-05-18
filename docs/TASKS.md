# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md` | **Archived Done tasks:** See `docs/TASKS_ARCHIVE.md` for complete history (1777–1896+)

---
## Backlog

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| MAINT-1949a | **CHORE: system-map.json cron description sync** — Sync stale informational descriptions in `docs/data/system-map.json` to match actual cron expressions in `cronConfig.ts` (SSOT). Two entries: (1) `foreignFlowAlertJob` shows "09:30 UTC M-F" (was old schedule); update to "08:13 UTC M-F" matching `13 8 * * 1-5` from Sprint 1949 commit `44aa791a`. (2) `macroIndicatorRefreshJob` shows "0 6 * * *" (old 06:00 UTC); update to "19:13 UTC daily" matching `13 19 * * *` from same commit. Files: `docs/data/system-map.json` (update `.crons[].description` for both entries). AC: system-map.json cron descriptions match cronConfig.ts expressions; verify no JSON syntax errors; no behavioral change (informational only). Size=XS. Zone=`docs/data/`. Owner: agent-father. Non-blocking; defer to next cycle or combine with other system-map.json updates. | LOW | CHORE | agent-father | — | — |
| 1948a | **BLOCKED: Sprint 1948 Phase 1** — `improve_check_log` schema + `improveCheckStore.ts` (domain/infra DB layer). DB migration to `schema-system.ts` + Drizzle types + 6 store functions (insert, getPending, update, getRecentCheck, etc). Unit tests: insert, getPending, update, getRecentCheck, schema guard. Size=S. Zone=apps/mcp-server/. **PRE-CONDITION:** Blocked until post-1945-verdict-resolution-scored-pct gate clears 2026-05-20T07:22Z. If gate misses, resolution pipeline fix takes priority. | HIGH | TASK | dev-mcp-server | docs/handoffs/TASK_1948a.md | 2026-05-20T07:22Z (post-1945-verdict-resolution-scored-pct gate) |
| 1948b | **BLOCKED: Sprint 1948 Phase 1** — `degradationRules.ts` domain service (pure, zero imports). `DegradedSignalType` + `DegradationHypothesis` interfaces, `DEGRADATION_CAUSE_MAP` rule-table, `classifyDegradation()` + `lookupHypothesis()` functions. Detection logic: 7d vs 30d `accuracy_rate` delta ≥10pp OR baseline <40% with ≥10 samples per signal_type. Unit tests: degraded / not-degraded / insufficient-sample / null-rates / persistently-low / neutral. Size=S. Zone=apps/mcp-server/. **PRE-CONDITION:** Blocked until post-1945-verdict-resolution-scored-pct gate clears 2026-05-20T07:22Z. Depends on 1948a. | HIGH | TASK | dev-mcp-server | docs/handoffs/TASK_1948b.md | 1948a + 2026-05-20T07:22Z gate |
| 1948c | **BLOCKED: Sprint 1948 Phase 1** — `selfImproveOrchestratorJob.ts` scheduler entry + wiring + integration tests. Shadow-mode only: no signal-bus write, WORK Telegram output only. Detection loop: 7d/30d accuracy-rate delta, coverage-gap query, hypothesis lookup, `improve_check_log` snapshot write. Phase 1 AC: ≥1 degraded signal type detected → exactly 1 WORK Telegram; zero degradation → clean exit; all detect/hypothesis/log cycles tested (6+ tests). Wiring: add `CRONS.selfImproveOrchestrator` to cronConfig.ts, wire in startScheduler.ts, add env vars to .env.example. Size=M. Zone=apps/mcp-server/. **PRE-CONDITION:** Blocked until gate clears. Depends on 1948a + 1948b. | HIGH | TASK | dev-mcp-server | docs/handoffs/TASK_1948c.md | 1948a + 1948b + 2026-05-20T07:22Z gate |
| 1948e-C | **SPIKE-1948e-fix child 3/3 (OPTIONAL, deferred)** — Add PC1 to primary watchlist (identical scope to 1946a PLX). Files: `docs/data/system-map.json` `.project.watchlist[]`, `apps/mcp-server/mcp.config.json` `.market.watchlist[]`, `apps/mcp-server/src/infrastructure/db/seedWatchlist.ts` `WATCHLIST_SEED`, `domain/market.ts` `WATCHLIST_STOCKS`. Tests: seed presence, query returns PC1, idempotency. AC: PC1 in all 3 SSoT sources, tests TC1-TC4 GREEN, regression suite ≥50 tests pass. NOT required for legal_risk signal path (Fix A+B sufficient). Improves news-scout urgency classification. Size=S. Zone=`apps/mcp-server/` + `docs/data/`. Gate: None. PM judgment: schedule separate after 1948e-A+B merge, or defer to cycle 2. | LOW | FIX | dev-mcp-server | docs/handoffs/TASK_1948e-C.md | — |
| OBSERVE-1948d | **BLOCKED: Sprint 1948 Phase 1 observation gate** — 7-day shadow-mode verification (2026-05-25T09:00Z post-deploy). AC: ≥1 degraded signal type detected (improve_check_log.dispatch_status='shadow'), ≥1 WORK Telegram sent with detection details, zero false-positive auto-dispatches (Phase 1 is shadow-only), no DB errors, cron_job_runs shows 7 consecutive successful runs. Size=OBSERVE. **PRE-CONDITION:** Blocked until 1948c deploys (2026-05-20T09:00Z assumed, after gate clears and tasks complete). | MEDIUM | OBSERVE | ops | — | 1948c deployment + 2026-05-25T09:00Z |
| alert-precision-488-unknowns | **MONITORING**: Post-DB-rebuild agent_signals=46 (fresh DB). HOLD until ≥550. From TNB c58 Finding #8 + bug 2874. | MEDIUM | TRACKING | — | — | — |
| fa-shape-guard-watch | **MONITORING**: Next observation = first post-restart FA live session. Auto-cure trigger: REGIME-mismatch or news-fallback → spawn 1921a-fa-shape-guard-propagate. If NEUTRAL macro_snapshot → close. | MEDIUM | TRACKING | — | — | — |
| 1907a-digest-predict-silence | **CRITICAL** (c168 update): `vn-market` MCP server (`http://localhost:3000/sse`) added to `claude_desktop_config.json` mcpServers. **USER-ACTION: restart Claude Desktop** to load new MCP config. After restart, scheduled cowork tasks will have vn-market MCP access. Verify by checking digest-predict runs again. | CRITICAL | OPS | user | — | — |
| 1897b-carry | F1 USER: Docker .git/ exclude bundle + VirtioFS structural fix. PREFLIGHT cure permanent policy (1906a c89). F1 USER action (Docker .git/ exclusion) is the only structural cure. Brief: `docs/architecture-briefs/2026-05-13-headlock-recurrence-post-F2a.md`. | HIGH | URGENT-F1 | user | — | — |

---

## Todo
| post-1945-verdict-resolution-scored-pct | **Sprint 1945 AC-1 OBSERVE** — gate 2026-05-20T07:22Z (48h post-1945a deploy). AC: `alert_accuracy.scored_pct` rises ≥60% AND `unknowns_30d` drops by ≥100 (was 36%/520 pre-1945a). If miss → 1947b-verdict-resolution-followup (HIGH FIX, dev-mcp-server). | HIGH | OBSERVE | ops | — | 2026-05-20T07:22Z |
| post-1945-bug-storm-silence | **Sprint 1945 AC-2 OBSERVE** — gate 2026-05-20T07:22Z (48h). AC: zero new `[bug] verdictResolutionJob` Telegram messages for 48h post-1945a deploy. Any new msg → 1947c-verdict-resolution-bug-followup. | MEDIUM | OBSERVE | ops | — | 2026-05-20T07:22Z |
| 1941b-signal-outcomes-seed-window | **Sprint 1941 TIER 2** — 7-day OBSERVE on `signal_outcomes` seeding. AC by 2026-05-25: ≥30 resolved rows (outcome_24h ∈ correct/incorrect/neutral) across ≥3 distinct `signal_type` values. Failure mode → bug task to dev-mcp-server (seed path broken in postSignal wrapper). No code change unless escalation triggers. | MEDIUM | OBSERVE | ops | — | 2026-05-25 |
| 1922g-pharma-events-source-verify | **OBSERVE** — `pharma_events` empty. `davPharmacyJob` cron `0 6 1 * *`. Next tick = 2026-06-01 06:00 UTC. AC: check status + row count after tick. | LOW | OBSERVE | ops | — | 2026-06-01 |
| 1922i-alert-engine-records | **WONTFIX c160 (SPIKE-1933a resolved)** — alert_engine_records always 0: evaluateAlert() dead code deleted (1933b). Architecture: market.db.alerts → Alert Commander = canonical intelligence path. Go alert-engine (/evaluate) reserved for future stop-loss use case. | MEDIUM | WONTFIX | — | — | — |
| post-1942-fa-verify | **MONITOR** — Verify FA next live cycle (~23:00 UTC tonight) reports ≥20/30 BCTC analyses (was 3/38 pre-1942). If still 3/38 → deploy-gap bug task to dev-mcp-server (Docker rebuild). Auto-close on observation. | MEDIUM | OBSERVE | ops | — | 2026-05-19 |

---

## In Progress

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
_(empty)_ | — | — | — | — | — | — |

---

---

## Review

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
_(empty)_ | — | — | — | — | — | — |

---
## Done

| Task ID | Title | Priority | Type | Owner | Completed |
| SPRINT-1949 | **CLOSED 2026-05-18** — Cowork station reorder: 9 prep-cooks → chef + gatherers. T1–T11 all DONE. unified-agent promoted to CHEF (chef.md 8-step TNB recipe, 3 guaranteed dishes/day + conditional intraday). market-watcher demoted to gatherer (no MARKET write). alert-commander narrowed to event-only (no cycle headers). digest-predict scoped to Sunday weekly. financial-analyst + report-analyzer add business-context fields. tran-ngoc-bau audits chef narrative (cron 20:13 UTC). Cron rewired: foreignFlowAlert→08:13, macroRefresh→19:13. Docs updated: cron-jobs.md, alert-policy.md, workflow-map.md. Commits: `d4d5d0cf`, `9848bf49`, `44aa791a`. **GATE OBSERVE**: chef must publish ≥1 MARKET dish (next morning slot 05:23 UTC). | HIGH | SPRINT | agent-father | 2026-05-18 |
| 1948e-B | **DONE 2026-05-18** — Added Legal Risk Signal Dispatch block to `.claude/flows/news-scout/stage-signals.md` before `urgent_news` block. Trigger: `detectLegalRisk()` non-empty OR prosecution keywords + stock code match. Dedup: 360-min window on (stock_code, signal_type="legal_risk"). Confidence: prosecution/asset_freeze=0.95, tax/license=0.85, investigation=0.70. ttl_minutes=360. No verdictResolutionJob contact (AC-8). Test: 5/5 GREEN (TC1 detect PC1 khởi tố, TC2 roundtrip post+query, TC2b dedup suppression, TC3 confidence mapping, TC4 AC-8 regression). tsc 0 errors. Branch: `task/1948e-b-legal-risk-dispatch`. Commit: `ddff5105`. | MEDIUM | FIX | dev-mcp-server | 2026-05-18 |
| 1948e-A | **DONE 2026-05-18** — Added `"legal_risk"` to `SignalTypeSchema` enum in `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` L39-49. One-line additive change; zero DB migration. `SignalTypeSchema.safeParse("legal_risk")` now returns `{ success: true }`. Test: 3/3 GREEN (TC1 schema accepts legal_risk, TC3 all 9 existing types pass, TC4 unknown_type still rejected). tsc 0 errors. Regression: +1 pass / 0 new failures. Branch: `task/1948e-a-legal-risk-schema-enum`. Unblocks: 1948e-B. | MEDIUM | FIX | dev-mcp-server | 2026-05-18 |
| SPIKE-1948e | **DONE 2026-05-18 ARCHITECT** — PC1 legal_risk pipeline review. Three-point cascade gap confirmed: (1) `SignalTypeSchema` in `agentSignalStore.ts:39-49` missing `"legal_risk"` — Zod rejects any `post_agent_signal(signal_type: "legal_risk")` call before DB write; (2) `stage-signals.md` has no `legal_risk` dispatch path — news-scout only routes to `urgent_news` or `chain_catalyst`; (3) PC1 absent from primary watchlist — treated as low-priority sector ripple by news-scout. `legalRiskDetector.ts` patterns correct (covers `khởi tố`). `get_legal_risk_signals` read-side correct (1940a already queries `agent_signals`). Recommended fix: Size S — Fix A enum addition + Fix B flow dispatch block. Child task filed: 1948e-fix. Spike: `docs/spikes/SPIKE_1948e-pc1-legal-risk-pipeline.md`. Brief: `docs/architecture-briefs/2026-05-18-legal-risk-signal-pipeline.md`. | MEDIUM | SPIKE | architect | 2026-05-18 |
| 1945d-reparse-pipeline-gap | **DONE 2026-05-18 QA-APPROVED** — Fixed two BCTC extraction pipeline gaps. GAP-A: bctcReparseJob now runs unconditionally; GAP-B: push-bctc-pdf bypasses geo-blocked VPS download via pdfTextOverride. 12 tests GREEN. Root cause for 6/7 banks = VPS-side gap (SSC URLs not fetched). EIB+DHG extract on next bctcReparseJob cycle. | HIGH | FIX | dev-mcp-server | 2026-05-18 |
| _(Older Done entries (SPRINT-1947/1946/1942, SPIKE-1947/1946/1945/1943, 1942a/b/c, 1943a, 1944a-vps/mcp/b/c, 1945a/b, 1941c/d, 1941a, calendar-source-replacement, 1940a, 1939a/b, 1937a, 1938a, 1862c-E/F, 1936b, 1936, macro-calendar-timeout-cap, 1934, 1933b, 1928a+, 1927a, 1926a, 1925a, 1924a/b/c/d, 1923a, 1909c, kinh-dich-name-fix, 1946a, ARCH-1944/1942/1945b, BA-1942d) archived → `docs/TASKS_ARCHIVE.md`; pre-c141 history in git)_ | — | — | — | — | 2026-05-16..18 |

---

## Deferred

| Sprint | Title | Reason | Next Step |
|--------|-------|--------|-----------|
| 1887 | METHODOLOGY-FORENSICS: Virtual Capital / related-party graph detector | Needs own architect brief — graph-store choice, related-party data source, traversal patterns, false-positive control all unspecified | When 1885+1886 ship, queue separate ARCH-1887 brief before ba spec |
| 1892a-ops AC-3 | OPS-NOTE: 1892a-ops AC-3 now UNBLOCKED by 1892b merge (2026-05-12). VPS POST to `/api/push-news` should reach MCP server after deploy. | Unblocked 2026-05-12 | ops re-verify next cycle (observational) |
| TNB-c39-#3 | MONITOR: unified-agent FPT pillar gap (2nd cycle of evidence at c39) | Per TNB protocol need 3rd cycle to auto-cure. | If c40 unified-agent cycle repeats FPT-without-pillars pattern → spawn auto-cure CHORE. If c40 PASSES → close as transient. |
