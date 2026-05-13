# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md` | **Archived Done tasks:** See `docs/TASKS_ARCHIVE.md` for complete history (1777–1896+)

---
## Backlog

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| 1881a | METHODOLOGY-INFRA: Source-tier `1\|2\|3` tag retrofit — add `source_tier` field to ~15 macro/news tool outputs (1=primary/official, 2=aggregator, 3=derived). SSOT: methodology Layer 9 (Source hierarchy). Owner: ba spec → dev-mcp-server + dev-macro-indicators. | HIGH | CHORE | ba | — | — |
| 1882a | METHODOLOGY-INFRA: VIRA scraper deploy on Vinahost VPS + `get_vira_snapshot()` MCP tool. SSOT: methodology Layer 2 (VN macro). QUEUED behind 1878-1881. Owner: ba spec → ops + dev-macro-indicators. | HIGH | FEATURE | ba | — | 1878a, 1879a, 1880a, 1881a |
| 1883a | METHODOLOGY-INFRA: PMI sub-components fetcher upgrade — break out new orders / employment / prices sub-indices from headline PMI. SSOT: methodology Layer 2.B. QUEUED. Owner: ba spec → dev-macro-indicators. | MEDIUM | FEATURE | ba | — | 1878a, 1879a, 1880a, 1881a |
| 1885a | METHODOLOGY-FORENSICS: Beneish M-Score + Piotroski F-Score calculators — 8-variable + 9-variable forensic scores. BLOCKED on ARCH-1884 (host decision). OCF column (1878a) now DONE. Owner: ba spec → host module per ARCH-1884. | HIGH | FEATURE | ba | — | ARCH-1884 |
| 1886a | METHODOLOGY-FORENSICS: BTN detectors phase 1 — Cookie Jar Reserve + Big Bath earnings management detectors. BLOCKED on ARCH-1884 + 1885a. Owner: ba spec → host module per ARCH-1884. | HIGH | FEATURE | ba | — | ARCH-1884, 1885a |
| 1888b | SSOT-CRITICAL: Replace hardcoded "13 agents" in `.claude/AGENT_MODELS_README.md` (L15, L28, L54) with pointer to `docs/data/project-stats.json#devAgentCount` (actual after 2026-05-12 audit: 17 dev + 9 microservice). 1 file, doc-only. (Renumbered from 1878b.) | HIGH | CHORE | developer | — | — |
| 1888c | SSOT-CRITICAL: Update `docs/data/tool-registry.json` — toolCount 125 is stale. Reconcile to current 132. (Renumbered from 1878c.) | HIGH | CHORE | developer | — | — |
| 1888d | SSOT-CRITICAL: Reconcile `cron-registry.json` (62 entries) vs `project-stats.json#cronJobCount` (59). Clarify scheduler-files vs cron-keys distinction. (Renumbered from 1878d.) | HIGH | CHORE | developer | — | — |
| 1888e | SSOT-MEDIUM: Fix `docs/references/agent-roster.md` "7 agents" vs "8 agents" self-contradiction. (Renumbered from 1878e.) | MEDIUM | CHORE | developer | — | — |
| 1888g | SSOT-MEDIUM: Extract task size rules from `flows/dev-team/main.md` L91-96 into `docs/{policies,protocols,standards,references}/task-size-rules.md`. (Renumbered from 1878g.) | MEDIUM | CHORE | developer | — | — |
| 1897b | CARRY-FORWARD-c63: F1 USER bundle — Docker file-sharing exclude .git/ (F2a partial accepted; F1 as permanent USER ask). Add to existing USER backlog with reference to brief `docs/architecture-briefs/2026-05-13-headlock-recurrence-post-F2a.md`. Blockers: none. Owner: user decision (config bundle). | MEDIUM | FOLLOW-UP | user | — | — |
| 1897c | CARRY-FORWARD-c63→ESCALATE-c64: SPIKE—worktree isolation FAILURE PATTERN DETECTED: Second contamination event this cycle (qa-responder 70a2933a + market-watcher 909145b4 committed to task branch during T-2 build). Cherry-pick recovery works but adds 15+ min overhead per cycle. **ESCALATE TO ARCHITECT:** Move 1897c to top backlog HIGH priority + request root-cause rethink (Phase 4 agent isolation semantics vs worktree tool expectations). Owner: architect (design), developer (implementation). | HIGH | SPIKE | architect | — | — |
| 1897d | CARRY-FORWARD-c64: HEAD.lock recurrence 16x within 24h — PREFLIGHT cure (805s removal) + ANOTHER mid-cherry-pick event required manual rm. F1 USER ask (1897b Docker file-sharing .git/ exclusion) priority RAISED to **URGENT**. Add to USER backlog. Reference brief `docs/architecture-briefs/2026-05-13-headlock-recurrence-post-F2a.md`. Owner: user decision (config bundle). | HIGH | URGENT-F1 | user | — | — |
| 1897e | CARRY-FORWARD-c65: HEAD.lock recurrence 19x within 24h — 17th cure 06:37Z PREFLIGHT (1888s/0B), 18th+19th mid-commit (~60s+~48s post-commit). F4 retry idiom worked. Recurrence frequency now >1/cycle steady-state, escalating from c64 (16x). F1 USER decision (1897b Docker .git/ exclude) → URGENT. Brief: `docs/architecture-briefs/2026-05-13-headlock-recurrence-post-F2a.md`. Owner: user decision. | HIGH | URGENT-F1 | user | — | — |
| 1897f | CARRY-FORWARD-c65: CONTAMINATION event #3 — dev-mcp-server T-4 task branch contaminated by market-watcher commit (de486331) + T-4 itself bundled non-T4 files (.claude/tools/package/market-watcher.md + notebook tail). Recovery: 3-way cherry-pick split (564fc91f mw + 80493433 T-4 atomic + 8a813a3f mw-tail). 3rd consecutive cycle (c63/c64/c65). **ESCALATE TO ARCHITECT:** 1897c worktree SPIKE remains HIGH — agent-spawn-on-task-branch semantics (NOT worktree-flag) is root cause. Request rethink. Owner: architect (design), developer (impl). | HIGH | SPIKE | architect | — | — |
| 1888i | SSOT-LOW: Remove duplicate `max_alerts_per_day: 10` from `agents/alert-commander.md` — point to alert-policy.md SSOT. (Renumbered from 1878i.) | LOW | CHORE | agent-father | — | — |
| 1888j | SSOT-LOW: Document 9 microservice agents in `docs/references/agent-roster.md`. (Renumbered from 1878j.) | LOW | CHORE | developer | — | — |
| 1888k | SSOT-LOW: Remove orphaned `AGENT_STARTUP.md` reference in `agents/system-auditor.md` L77. (Renumbered from 1878k.) | LOW | CHORE | agent-father | — | — |
| 1890a | METHODOLOGY-TOOLPKG: financial-analyst tool-package gaps (TNB c33→c39 carry, 6+ cycles). Re-evaluate 3 missing tools now that agent is active: (a) `get_macro_snapshot` — add to `.claude/tools/package/financial-analyst.md` (tool exists; was filtered). (b) `get_insider_signals` — currently requires per-stock outstandingShares; spec a wrapper that auto-fetches from `vnstock_overview`. (c) `get_bond_maturity_calendar` — missing entirely; decision: build (Layer 6 credit signal) vs deprecate the credit-rollover branch in financial-analyst flow. Owner: ba spec → dev-mcp-server (if build) or agent-md-editor (if deprecate). Size: S (single ba spec + 1-2 dev tasks max). | MEDIUM | CHORE | ba | — | — |
| JANITOR-020 | DRY: MACRO_CODES + section-builder logic duplicate in marketContextBuilder.ts vs marketContextTools.ts | MEDIUM | DRY | code-janitor | — | — |
| JANITOR-017 | DRY: BROWSER_UA string duplicated in 18 source files across 3 layers | LOW | DRY | code-janitor | — | — |
| JANITOR-014 | DRY: detectUnitMultiplier + extractNumber + LOOKAHEAD_LINES duplicated in 3 financial extractors | MEDIUM | DRY | code-janitor | — | — |
| JANITOR-013 | DRY: SignalTypeEnum re-lists SignalType union in agentSignalTools.ts (2-file change) | LOW | DRY | code-janitor | — | — |
| JANITOR-011 | DRY: Puppeteer launch config duplicated in tradingEconomicsChromium.ts (2 methods) | MEDIUM | DRY | code-janitor | — | test-coverage |
| TASK-BCTC-3 | Reverse-engineer hsx.vn SPA XHR API for no-browser HOSE BCTC scraper. Current Playwright path (post-TASK-BCTC-1) is heavy on 1GB VPS; need httpx/requests alternative for resource efficiency. AC: (1) Identify XHR endpoints via browser DevTools/mitmproxy. (2) Document recipe in `docs/vps-sources/hsx-bctc/triage.md`. (3) Implement no-browser discovery function for HOSE. (4) Live-test 3+ HOSE tickers (VNM, VEA, HPG) discovers Q1/2026 PDFs. (5) Playwright remains as fallback. Owner: dev-vps-crawls. | MEDIUM | FEATURE | dev-vps-crawls | — | — |

---

## Todo

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| 1900a | OPS-CRITICAL (c71): MCP gateway DOWN at host.docker.internal:3000 — 3 cowork agents failed 10:48Z/11:01Z (qa-responder, alert-commander, unified-agent) + c71 dev-team blocked from log_agent_work/send_telegram. Triggered by ops macro-indicators rebuild 10:51Z (FRED activation). Gateway not recovered. ACTION: ops verify mcp-server container health (port 3000 mapping), restart if needed, confirm cowork cron cycles resume. | CRITICAL | OPS | ops | — | — |
| 1900b | FEATURE-MED CARRY (c71 obs): macro-external-allsettled-timeout dev-impl commit `12a7221e` on `task/macro-external-allsettled-timeout` (developer signal 11:02Z) — 85 pass/0 fail, 11 new tests, smoke confirms graceful degradation (ok=2/failed=4 from dev env outside VN, expected geo-block). qa needs to validate + merge. ALSO: qa-bug 11:05Z observes 4 geo-blocked scrapers (worldBank/yahoo/cnbc/tradingEconomics) consistently hit 8s timeout from Docker France host — not a code issue, environmental (VPS proxy required). Owner: qa (validate+merge), then ops (VPS proxy verification). | MEDIUM | FEATURE | qa | — | — |
| 1898a | FIX-HIGH (TNB c45): `get_market_snapshot` returning electricity data instead of stocks. Investigate routing/source mix-up. Owner: ba spec → dev-mcp-server. | HIGH | FIX | ba | — | — |
| 1898b | FIX-HIGH (TNB c45): RSS degradation accelerating — Sprint 1862c-D fix didn't hold. News sources returning empty arrays again. Owner: ba spec → dev-mcp-server / ops. | HIGH | FIX | ba | — | — |
| 1899a | FEATURE-MED: news-fetch service scaffold. **c69 update**: architect brief COMPLETE `docs/architecture-briefs/2026-05-13-news-fetch-service.md` (port corrected 5007→5008, RAM 2/2.5GB, sequential Playwright, Reuters RSS primary). Ready for developer scaffold (15 new files + 8 mods). Owner: developer. | MEDIUM | FEATURE | developer | architecture-briefs/2026-05-13-news-fetch-service.md | — |
| 1862c-E | OPS-HIGH: Increase SSE keepAliveTimeout 30s → 300s — eliminate heartbeat-at-timeout-boundary race on `/vn-market/sse` Cloudflare route. **STATUS SPLIT:** (a) 1862c-E-config (Done, keepAliveTimeout 30s→300s local config deployed, commit 16ff50e1) — (b) 1862c-E-dashboard (In Progress, user-action: Cloudflare dashboard ingress route not yet configured; blocking SSE endpoint `/vn-market/sse` returning 404). See 1862c-D notes. | HIGH | OPS | ops | TASK_1862c-E.md | — |
| 1862c-F | FIX-MEDIUM: SseSessionManager dead-session eviction + reconnect detection — detect stale/disconnected SSE sessions. `apps/mcp-server/src/interface/mcp/transport.ts`: structured 404 error response + optional session-TTL eviction. 2 files + 5 tests + Docker rebuild. Ship after 1862c-D/E confirmed stable (5 cycles clean). | MEDIUM | FIX | developer | TASK_1862c-F.md | container-rebuild |
---

## In Progress

| Task ID | Title | Priority | Type | Owner | Handoff | Started |
|---------|-------|----------|------|-------|---------|---------|

---

## Review

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|
---
## Done

| Task ID | Title | Priority | Type | Owner | Completed |
|---------|-------|----------|------|-------|-----------|
| 1897g-c68-SHIPPED | CHORE-S **DONE 2026-05-13 c68**: C2 commit verification protocol codified in `.claude/agents/dev-*.md` preamble across 9 agents (alert-engine, api-gateway, kinh-dich, macro-indicators, mcp-server, pdf-extractor, rag-service, stock-price, technical-analysis). Commit `f4e2bcb5` C2-ATOMIC (2nd clean ship in 2 cycles — agent-father self-caught accidentally-staged notebook + reset before commit). 98 insertions, 9 files. Prevents future contamination at the systemic level (was inline-only c67). | CRITICAL | CHORE | agent-father | 2026-05-13 |
| SPIKE_006-COMPLETE-c67 | TEST-S **DONE 2026-05-13 c67**: T-6 integration test `SPIKE006-scoring-unification.test.ts` (5/5 pass, 17 expects). Commit `572bd8c3` C2-ATOMIC (first clean ship in 5 cycles). **SPIKE_006 6-task chain COMPLETE** (T-1 c61 d6d3c5d9, T-2 c64 214957b0, T-4 c65 80493433, T-5 c66 284335cf, T-6 c67 572bd8c3). All AC-1..AC-5 + OOS-5 verified. id=2874 finalized resolution=fixed at c68. | HIGH | TEST | developer | 2026-05-13 |
| 1894a-RCA-c69 | OPS-RCA **DONE 2026-05-13 c69 (no code ship, high-value diagnosis)**: cloudflared = named-tunnel TOKEN mode → local config.yml IGNORED, ingress rules read from Cloudflare DASHBOARD. Explains 16-cycle blocker. localhost:4000 healthy (returns 401); https://zenmidi.com/api/* still 404 post-restart. **USER action precision-refined** in 1894a row (dashboard Public Hostnames, not config.yml). | CRITICAL | RCA | ops | 2026-05-13 |
| 1894a-CLOSED-c70 | OPS-UNBLOCK **DONE 2026-05-13 c70 (16-cycle blocker FINALLY CLOSED)**: User added `^/api/*` → `http://localhost:4000` ingress rule on Cloudflare dashboard between c69 and c70. ops verified 12:15Z (`docs/signals/processed/ops-cloudflare-config-verified-2026-05-13T12-15-00Z.json`): https://zenmidi.com/api/push-prices → 401 ✓, https://zenmidi.com/api/push-news → 401 ✓ (401 = auth required = route working; was 404 = no route for 16 cycles). VPS push services now have working push targets. Lesson: dashboard-managed tunnels require dashboard edits — config.yml mode is the wrong primitive when launchd-plist runs cloudflared in token mode. | CRITICAL | UNBLOCK | user→ops | 2026-05-13 |

---

## Deferred

| Sprint | Title | Reason | Next Step |
|--------|-------|--------|-----------|
| 1887 | METHODOLOGY-FORENSICS: Virtual Capital / related-party graph detector | Needs own architect brief — graph-store choice, related-party data source, traversal patterns, false-positive control all unspecified | When 1885+1886 ship, queue separate ARCH-1887 brief before ba spec |
| 1892a-ops AC-3 | OPS-NOTE: 1892a-ops AC-3 now UNBLOCKED by 1892b merge (2026-05-12). VPS POST to `/api/push-news` should reach MCP server after deploy. Recommend ops re-verify next cycle via 1892a-ops test suite (NOT a new task — observational note only). | Unblocked 2026-05-12 | ops re-verify next cycle (observational) |
| TNB-c39-#3 | MONITOR: unified-agent FPT pillar gap (2nd cycle of evidence at c39) | Per TNB protocol need 3rd cycle to auto-cure. c40 daily review (~02:01 UTC) is the verification window. No action this sprint. | If c40 unified-agent cycle repeats FPT-without-pillars pattern → spawn auto-cure CHORE (unified-agent flow Step adding mandatory pillar enumeration). If c40 PASSES → close as transient. |
