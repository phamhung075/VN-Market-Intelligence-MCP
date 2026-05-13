# TASKS — VN Market Intelligence MCP

> **Active:** Current sprint only. Historical: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md` | **Archived Done tasks:** See `docs/TASKS_ARCHIVE.md` for complete history (1777–1896+)

---
## Backlog

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| 1881a-impl | METHODOLOGY-INFRA IMPL: Source-tier `1\|2\|3` tag retrofit (spec REQ_1881a.md SHIPPED c83, 16 tools enumerated). Dev phase: (a) add `source_tier` field to ~15 macro/news tool outputs (1=primary/official, 2=aggregator, 3=derived). (b) SSOT: methodology Layer 9 (Source hierarchy). AC: 15 tools updated, integration tests pass. Owner: dev-mcp-server + dev-macro-indicators. Awaits PO spec review → architect handoff. | HIGH | CHORE | developer | — | 1881a-spec-SHIPPED-c83 |
| 1888l | SSOT-HIGH (agent-father escalation c-maintenance): agents-architect Error Boundary missing — `.claude/flows/agents-architect/main.md` has no error-boundary reference, no fail-loud ref, no EXIT/BLOCKED handling. Fix: (a) add error-boundary line at top of flow mirroring `flows/po/main.md` L6 pattern, (b) verify `.claude/agents/agents-architect.md` `always_load` lists `docs/protocols/fail-loud-protocol.md`, (c) add EXIT condition on unresolvable blocker in handlers.md Operating Cycle. AC: compliance audit passes; on_error matches po/architect pattern. Owner: agent-father. | HIGH | CHORE | agent-father | — | — |
| 1890a | METHODOLOGY-TOOLPKG: financial-analyst tool-package gaps (TNB c33→c39 carry, 6+ cycles). Re-evaluate 3 missing tools now that agent is active: (a) `get_macro_snapshot` — add to package (tool exists; was filtered). (b) `get_insider_signals` — wrap to auto-fetch outstandingShares from `vnstock_overview`. (c) `get_bond_maturity_calendar` — decide: build (Layer 6 credit signal) vs deprecate credit-rollover branch. Owner: ba spec → dev-mcp-server (build) or agent-md-editor (deprecate). Size: S. | MEDIUM | CHORE | ba | — | — |
| 1897b-carry | CARRY-FORWARD-c63→c65 (squashed 1897b/c/d/e/f at c73): F1 USER Docker .git/ exclude bundle (1897b) + worktree-isolation SPIKE (1897c/f — escalate to architect) + HEAD.lock 16-19x within 24h (1897d/e — URGENT-F1, F4 retry idiom works). Brief: `docs/architecture-briefs/2026-05-13-headlock-recurrence-post-F2a.md`. Pressure subsiding: 5/5 lock-free PREFLIGHTs since c69. Owner: user (F1) + architect (SPIKE rethink). | HIGH | URGENT-F1 | user+architect | — | — |
| JANITOR-020 | DRY: MACRO_CODES + section-builder logic duplicate in marketContextBuilder.ts vs marketContextTools.ts | MEDIUM | DRY | code-janitor | — | — |
| JANITOR-014 | DRY: detectUnitMultiplier + extractNumber + LOOKAHEAD_LINES duplicated in 3 financial extractors | MEDIUM | DRY | code-janitor | — | — |
| JANITOR-011 | DRY: Puppeteer launch config duplicated in tradingEconomicsChromium.ts (2 methods) | MEDIUM | DRY | code-janitor | — | test-coverage |
| TASK-BCTC-3 | Reverse-engineer hsx.vn SPA XHR API for no-browser HOSE BCTC scraper. AC: (1) Identify XHR endpoints. (2) Document recipe in `docs/vps-sources/hsx-bctc/triage.md`. (3) Implement no-browser discovery for HOSE. (4) Live-test 3+ HOSE tickers (VNM/VEA/HPG) discovers Q1/2026 PDFs. (5) Playwright remains fallback. Owner: dev-vps-crawls. | MEDIUM | FEATURE | dev-vps-crawls | — | — |

---

## Todo

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| 1900c-health-probe-refine | OPS-LOW (c73 discovery): `flows/ops/docker.md` § Post-Rebuild Health Verification probes ports 5007/5008 for pdf-extractor/rag-service but Python services map internal port differently — c73 probe got 7/9 200 + 2/9 000. Fix: enumerate per-service actual `/health` paths + ports (use `docker inspect <svc> --format '{{.NetworkSettings.Ports}}'`), update curl recipe in rule, OR use `docker inspect --format='{{.State.Health.Status}}'` as authoritative healthy check. | LOW | OPS | ops | — | — |
| 1899a-bloomberg-test-split | SCAFFOLD-S: Split `1899a-bloomberg.test.ts` (494L) into 4 files ≤200L each by logical group: DOM happy path / JSON fallback / PerimeterX+lifecycle / normalizeDate helper. Non-blocking follow-up from c77 QA non-blocking note. Zone: apps/news-fetch/__tests__/. | LOW | REFACTOR | dev-mainserver-crawls | — | — |
| 1862c-E | OPS-HIGH: Increase SSE keepAliveTimeout 30s → 300s — eliminate heartbeat-at-timeout-boundary race on `/vn-market/sse` Cloudflare route. **STATUS SPLIT:** (a) 1862c-E-config (Done, commit 16ff50e1) — (b) 1862c-E-dashboard (In Progress, user-action: Cloudflare dashboard ingress not configured; blocks `/vn-market/sse` 404). See 1862c-D notes. | HIGH | OPS | ops | TASK_1862c-E.md | — |
| 1862c-F | FIX-MEDIUM: SseSessionManager dead-session eviction + reconnect detection. `apps/mcp-server/src/interface/mcp/transport.ts`: structured 404 error + optional session-TTL eviction. 2 files + 5 tests + Docker rebuild. Ship after 1862c-D/E confirmed stable (5 cycles clean). | MEDIUM | FIX | developer | TASK_1862c-F.md | container-rebuild |
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
| 1881a-spec-SHIPPED-c83 | METHODOLOGY-INFRA SPEC **DONE 2026-05-13 c83**: BA spec REQ_1881a.md authored, 16 tools enumerated, 4 spec-time discoveries flagged for PO/architect (source-classification, tag-syntax, tool-packaging gaps, macro-refresh SLA). Next: PO review → architect handoff for BLK-1 plain-text schema decision → impl cycle (1881a-impl). Commits: feat `0189381c`, nb `e36242f1`. | HIGH | CHORE | ba | 2026-05-13 |
| 1888-CDG-SHIPPED-c83 | SSOT-CRITICAL BUNDLE **DONE 2026-05-13 c83**: 3-sub-task SSOT rectification: (a) tool-registry.json toolCount → 125 (1888c), (b) cron-registry vs project-stats cronJobCount reconcile (1888d), (c) task-size-rules extracted to `docs/standards/task-size-rules.md` (1888g, pointers in po/main.md L26 + dev-team/main.md). Deviation noted: PO ref was stale; developer corrected in-flight. Commits: fix `76829836`, nb `69521f26`. | HIGH | CHORE | developer | 2026-05-13 |
| 1903a-SHIPPED-c82 | FIX-HIGH **STALE-RESOLVED 2026-05-13 c82**: Both bugs (write_alert_verdict shape + get_macro_snapshot portfolio) self-healed during gateway-restore c77. Regression tests (`d5251193`) verify fix holds. No production code changes c82. Root-cause: c77 gateway rebuild isolated tool invocation paths. Zone: apps/mcp-server/. Commit: nb `d5251193`. | HIGH | FIX | developer | 2026-05-13 |
| 1888b-SHIPPED-c82 | SSOT-CRITICAL **DONE 2026-05-13 c82**: Replace hardcoded "13 agents" in `.claude/AGENT_MODELS_README.md` (L15, L28, L54) with pointer to `docs/data/project-stats.json#devAgentCount` (actual after 2026-05-12 audit: 17 dev + 9 microservice). 1 file, doc-only. Commits: fix `49f5d1eb`, nb `ff618e1d`. QA APPROVED. | HIGH | CHORE | developer | 2026-05-13 |
| 1899a-cron-SHIPPED-c81 | WIRING **DONE 2026-05-13 c81**: MCP scheduler job — job-body-already-existed wiring (3 files: barrel index.ts, cronConfig.ts entry, startScheduler.ts registration, mcp.config.json section). Zone: apps/mcp-server/. Commits: feat `89ad6c4a`, nb `50c74418`. QA APPROVED. Unblocks (was last wiring step). | MEDIUM | FEATURE | dev-mcp-server | 2026-05-13 |
| 1888e-SHIPPED-c81 | SSOT-MEDIUM **DONE 2026-05-13 c81**: Fix `docs/references/agent-roster.md` "7 agents" vs "8 agents" self-contradiction. Root: pointer update to `project-stats.json#analysisAgentCount = 9`. Zone: docs/. Commits: fix `a7bb2313`, nb `763fe826`. QA APPROVED. | MEDIUM | CHORE | developer | 2026-05-13 |
| 1899a-gateway-SHIPPED-c80 | WIRING **DONE 2026-05-13 c80**: Gateway + docker-compose — api-gateway routing config, docker-compose.yml news-fetch service block, ops-news-fetch-scaffold.md port correction. Zone: multi. Commits: feat `f91c5baa`, nb `837529ef`. QA APPROVED. Unblocks 1899a-cron (no more deps). | MEDIUM | FEATURE | developer | 2026-05-13 |
| 1899a-tests-SHIPPED-c80 | TESTS **DONE 2026-05-13 c80**: Unit + integration suite for news-fetch. 5 unit/integration files (165 pass / 6 skip), E2E newsHeadlinesRefreshJob + scheduler job (3/3 pass). **NOTE: Job body shipped here (136L, `newsHeadlinesRefreshJob.ts`); 1899a-cron wiring-only (3 steps remain).** Commits: feat `d2818207`, nb `64c3db67`, task-md `da5d1b0f`. QA APPROVED. | MEDIUM | FEATURE | developer | 2026-05-13 |
| 1899a-routes-SHIPPED-c79 | SCAFFOLD **DONE 2026-05-13 c79**: HTTP routes — handlers.ts (Hono router, /health + /news/reuters/headlines + /news/bloomberg/headlines). Zone: apps/news-fetch/. Commits: feat `644c8fe4`, nb `43609750`. 137/137 pass, tsc 0 errors. QA APPROVED. | MEDIUM | FEATURE | developer | 2026-05-13 |
| CLEAN-c79-SHIPPED-c79 | CLEANUP **DONE 2026-05-13 c79**: Stale artifacts + preflight-lsof policy. (A+B) `.claire/` typo worktree orphans + gitignore (`4bdc1316`); (C) preflight-lsof log retention policy + gitignore (`cb0fdb56`). Tree-verify PASS, c2-alert OK. | MEDIUM | CHORE | code-janitor + ops | 2026-05-13 |
| 1899a-reuters-fallback-SHIPPED-c78 | SCAFFOLD **DONE 2026-05-13 c78**: Reuters fallback — reuters-stealth.ts (Playwright DataDome stealth, FALLBACK only). Zone: apps/news-fetch/. Commits: feat `3e04dc5f`, qa `e0a5da53`. QA APPROVED. | MEDIUM | FEATURE | dev-mainserver-crawls | 2026-05-13 |
| _(6 more tasks archived: 1898b, 1900a, 1901b, 1900b, 1899a-{app,domain}, 1901a, 1899a-{factory,reuters-rss,core}, 1899a-bloomberg, 1903a, 1898a, 1902a)_ | — | — | — | — | — |

---

## Deferred

| Sprint | Title | Reason | Next Step |
|--------|-------|--------|-----------|
| 1887 | METHODOLOGY-FORENSICS: Virtual Capital / related-party graph detector | Needs own architect brief — graph-store choice, related-party data source, traversal patterns, false-positive control all unspecified | When 1885+1886 ship, queue separate ARCH-1887 brief before ba spec |
| 1892a-ops AC-3 | OPS-NOTE: 1892a-ops AC-3 now UNBLOCKED by 1892b merge (2026-05-12). VPS POST to `/api/push-news` should reach MCP server after deploy. | Unblocked 2026-05-12 | ops re-verify next cycle (observational) |
| TNB-c39-#3 | MONITOR: unified-agent FPT pillar gap (2nd cycle of evidence at c39) | Per TNB protocol need 3rd cycle to auto-cure. | If c40 unified-agent cycle repeats FPT-without-pillars pattern → spawn auto-cure CHORE. If c40 PASSES → close as transient. |
