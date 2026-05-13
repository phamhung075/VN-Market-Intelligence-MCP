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
| 1888h | RESOLVED 2026-05-12 audit: `project-stats.json#analysisAgentCount` reconciled to 9 (correct). Report-analyzer reclassified to cowork in `agent-roster.md` (matches `agent-chaining-protocol.md` and its own agent file). No further action. | DONE | CHORE | — | — | — |
| 1888i | SSOT-LOW: Remove duplicate `max_alerts_per_day: 10` from `agents/alert-commander.md` — point to alert-policy.md SSOT. (Renumbered from 1878i.) | LOW | CHORE | agent-father | — | — |
| 1888j | SSOT-LOW: Document 9 microservice agents in `docs/references/agent-roster.md`. (Renumbered from 1878j.) | LOW | CHORE | developer | — | — |
| 1888k | SSOT-LOW: Remove orphaned `AGENT_STARTUP.md` reference in `agents/system-auditor.md` L77. (Renumbered from 1878k.) | LOW | CHORE | agent-father | — | — |
| 1890a | METHODOLOGY-TOOLPKG: financial-analyst tool-package gaps (TNB c33→c39 carry, 6+ cycles). Re-evaluate 3 missing tools now that agent is active: (a) `get_macro_snapshot` — add to `.claude/tools/package/financial-analyst.md` (tool exists; was filtered). (b) `get_insider_signals` — currently requires per-stock outstandingShares; spec a wrapper that auto-fetches from `vnstock_overview`. (c) `get_bond_maturity_calendar` — missing entirely; decision: build (Layer 6 credit signal) vs deprecate the credit-rollover branch in financial-analyst flow. Owner: ba spec → dev-mcp-server (if build) or agent-md-editor (if deprecate). Size: S (single ba spec + 1-2 dev tasks max). | MEDIUM | CHORE | ba | — | — |
| JANITOR-020 | DRY: MACRO_CODES + section-builder logic duplicate in marketContextBuilder.ts vs marketContextTools.ts | MEDIUM | DRY | code-janitor | — | — |
| JANITOR-017 | DRY: BROWSER_UA string duplicated in 18 source files across 3 layers | LOW | DRY | code-janitor | — | — |
| JANITOR-014 | DRY: detectUnitMultiplier + extractNumber + LOOKAHEAD_LINES duplicated in 3 financial extractors | MEDIUM | DRY | code-janitor | — | — |
| JANITOR-013 | DRY: SignalTypeEnum re-lists SignalType union in agentSignalTools.ts (2-file change) | LOW | DRY | code-janitor | — | — |
| JANITOR-011 | DRY: Puppeteer launch config duplicated in tradingEconomicsChromium.ts (2 methods) | MEDIUM | DRY | code-janitor | — | test-coverage |

---

## Todo

| Task ID | Title | Priority | Type | Owner | Handoff | Blocked by |
|---------|-------|----------|------|-------|---------|------------|
| SPIKE_006-c61-T1 | FIX-S: Raise `hitThresholdPct` 0.1→1.0 in `alertOutcomeScorer.ts` (price-signal class) + update `1847d-alert-outcome-scorer.test.ts` (0.5%→UNKNOWN, 1.1%→HIT cases). Domain-only change; no interface touched. | HIGH | FIX | developer | TASK_SPIKE_006_c61_T1.md | — |
| SPIKE_006-c61-T3 | FIX-S: Remove intraday fallback gating in `alertAccuracy.ts` (L206-217). Compute `calendarDaysElapsed = Math.floor((now - triggeredAt) / 86_400_000)` before calling domain scorer in Path 2. Update `183-alert-accuracy.test.ts` (AC-2: same-calendar-day alert must not score intraday). | HIGH | FIX | developer | TASK_SPIKE_006_c61_T3.md | SPIKE_006-c61-T1 |
| SPIKE_006-c61-T2 | FIX-S: Delete `scoreAlert()` function from `alertAccuracy.ts`. Wire Path 2 (NULL-outcome rows) to call `alertOutcomeScorer.classifyAlertType()` + `scoreAlertOutcome()` instead. Update `183-alert-accuracy.test.ts` (AC-1: NULL-outcome alert must match direct scorer call). | HIGH | FIX | developer | TASK_SPIKE_006_c61_T2.md | SPIKE_006-c61-T1, SPIKE_006-c61-T3 |
| SPIKE_006-c61-T4 | FIX-S: Add `insufficientSample: boolean` field to `AccuracyReport` type in `alertAccuracy.ts`. Gate display in `formatAccuracyReport` — when `scoreable (hits + misses) < 20`, return `insufficientSample=true` and prepend Vietnamese warning text, skip accuracy % line. Update `183-alert-accuracy.test.ts` (AC-4: n=9 must trigger guard). | HIGH | FIX | developer | TASK_SPIKE_006_c61_T4.md | SPIKE_006-c61-T2, SPIKE_006-c61-T3 |
| SPIKE_006-c61-T5 | FIX-S: Add `writeAlertOutcome` call in `verdictResolutionJob.ts` — write `confirmed`→`'HIT'` and `false_positive`→`'MISS'` to `alerts.outcome` column. Also fix OOS-5 flat-band bug: `resolveDirection` L71 remove unconditional `abs(pct)<1.0→confirmed` early-return. Update `1863b-verdict-resolution-job.test.ts` (AC-5: verdict→DB write-back; E-3: missing alert ID no-throw; OOS-5: direction-aware confirm). | HIGH | FIX | developer | TASK_SPIKE_006_c61_T5.md | SPIKE_006-c61-T4 |
| SPIKE_006-c61-T6 | TEST-S: New integration test file `SPIKE006-scoring-unification.test.ts` — end-to-end `formatAccuracyReport` with mock domain scorer. Verify `scoreAlert` no longer exported from module. All 6 test files green; baseline 8804 tests preserved. | HIGH | TEST | developer | TASK_SPIKE_006_c61_T6.md | SPIKE_006-c61-T5 |
| 1862c-E | OPS-HIGH: Increase SSE keepAliveTimeout 30s → 300s — eliminate heartbeat-at-timeout-boundary race on `/vn-market/sse` Cloudflare route. **STATUS SPLIT:** (a) 1862c-E-config (Done, keepAliveTimeout 30s→300s local config deployed, commit 16ff50e1) — (b) 1862c-E-dashboard (In Progress, user-action: Cloudflare dashboard ingress route not yet configured; blocking SSE endpoint `/vn-market/sse` returning 404). See 1862c-D notes. | HIGH | OPS | ops | TASK_1862c-E.md | — |
| 1862c-F | FIX-MEDIUM: SseSessionManager dead-session eviction + reconnect detection — detect stale/disconnected SSE sessions. `apps/mcp-server/src/interface/mcp/transport.ts`: structured 404 error response + optional session-TTL eviction. 2 files + 5 tests + Docker rebuild. Ship after 1862c-D/E confirmed stable (5 cycles clean). | MEDIUM | FIX | developer | TASK_1862c-F.md | container-rebuild |
---

## In Progress

| Task ID | Title | Priority | Type | Owner | Handoff | Started |
|---------|-------|----------|------|-------|---------|---------|
| 1894a-cloudflare-tunnel-routing | OPS-HIGH / UNBLOCK: Cloudflare tunnel `/api/*` routing fix (BLOCKER for user pollNews resolution). **Issue:** `POST https://zenmidi.com/api/push-news` returns HTTP 404 despite internal `POST http://localhost:4000/api/push-news` returning HTTP 200 OK (1892b code fix deployed + working). **Root cause:** Cloudflare tunnel public-edge DNS / ingress rules NOT forwarding `/api/*` external requests to api-gateway:4000. **Impact:** user's recurring pollNews BUG alert ("All news sources returned 0 items") continues until Cloudflare layer fixed (code fix alone insufficient). **Ops action:** (1) Inspect `~/.cloudflared/config.yml` ingress rules + DNS records. (2) Verify `/api/` path routing to `api-gateway:4000`. (3) Test curl from external network `https://zenmidi.com/api/push-news`. (4) If config rewrite needed → produce architect brief for Phase 5 Cloudflare redesign. (5) Reference: `.claude/flows/ops/cloudflare-mcp.md` (ops diagnostic flow). **(awaits user dashboard action — 4th cycle ask c55)** | HIGH | UNBLOCK | user | — | 2026-05-12 |

---

## Review

| Task ID | Title | Priority | Type | Owner | Handoff |
|---------|-------|----------|------|-------|---------|
---
## Done

| Task ID | Title | Priority | Type | Owner | Completed |
|---------|-------|----------|------|-------|-----------|
| CLEAN-c58-leftovers-c59 | CLEAN-SMALL **DONE 2026-05-13 c59**: 4 atomic commits + notebook (`cae33188`/`064ec4e2`/`25cfa43a`/`d1070ec1`). Bundled: 2 staged notebooks (news-scout+report-analyzer), tool-usage-stats module refresh, c59 PREFLIGHT evidence log. alert-commander notebook already committed by concurrent cron (`bb779dd4`). Working tree clean post-cycle. Phase 5 GREEN all tiers (c2-alert WARN-only on tool-usage-stats scope). | MEDIUM | CLEAN | agent-father | 2026-05-13 |
| F2a-VERIFY-BLOCKED-c59 | FIX-S **BLOCKED 2026-05-13 c59**: Developer verify-first audit found BOTH `./reports/` and `./docs/data/` have active host-writers. Named-volume migration would silently drop host writes (QA + cowork agents write 713 reports/, all JSON in docs/data/ written from host with `:ro` container mount). No `docker-compose.yml` edit shipped. Audit doc committed (`e3e4ae25`) into headlock RCA brief § 9. **Architect c60 ask:** re-scope F2a — Option A safe partial (per-file mounts for 4 JSON files in docs/data) eliminates dir-level VirtioFS scan surface without breaking host writes; `./reports/` requires workflow redesign (architect must decide container vs host ownership of report writes). F4 (Tier 3) ships defense-in-depth regardless. | HIGH | FIX | developer | 2026-05-13 |
| F4-RETRY-WRAPPER-c59 | FIX-S **DONE 2026-05-13 c59**: Defense-in-depth git-commit retry wrapper shipped (architect-approved primary backstop while F2 re-scoped). 2 commits: `fb3093ae` protocol doc + `1018e826` notebook. Added `git_commit_retry()` bash idiom (3× retry / 2s sleep / lock-only guard on index.lock|HEAD.lock) to `docs/protocols/head-lock-self-cure.md` § F4 (119L→150L at cap). Flow comment in `.claude/flows/dev-team/main.md` PREFLIGHT block. New "Commit — retry on lock collision" section in `.claude/skills/notebook-write/SKILL.md` pointing authors to the idiom. No production code — protocol-level convention. Phase 5 GREEN both commits. | MEDIUM | FIX | agent-father | 2026-05-13 |
| HEADLOCK-ROOT-CAUSE-CONFIRMED-c58 | OPS-INFO **DONE 2026-05-13 c58**: 7th HEAD.lock recurrence captured at PREFLIGHT 23:36:30Z (age=2067s, size=0). lsof re-confirmed SAME PID 51247 = `com.apple.Virtualization.VirtualMachine.xpc` (Docker Desktop VM) → H4 mechanism stable across cycles. Evidence: `docs/agent-memory/sessions/preflight-lsof-20260512T233630Z.log` (committed `9d9aa017`). PREFLIGHT diagnostic instrumentation from c57 working as designed. Also surfaced: `index.lock` exhibits same pathology during c58 Tier 1 commit C (stale, removed inline). Pattern now affects BOTH HEAD.lock AND index.lock. | INFO | OPS | dev-team | 2026-05-13 |
| CLEAN-c57-leftovers+worktree-orphan-c58 | CLEAN-SMALL **DONE 2026-05-13 c58**: 5 atomic commits + notebook (`b09f0841→c6d7ad8f` + `5cd864f4`). Bundled: 3 staged notebooks (alert-commander+financial-analyst+news-scout from concurrent crons), c58 H4 PREFLIGHT evidence log (`9d9aa017` — cited by Tier 3 brief), 2 drained signals (h4-confirmed + tnb-2026-05-12T22-50-00Z → processed/), orphan worktree dir `.claude/worktrees/agent-a0f89162/` rm -rf (29 avril, not in `worktree list`, no lock), TASKS.md 84L→80L (4 oldest Done rows archived: 1896a/1896c/1896c-impl/1876a-A6). Phase 5 GREEN all 5 commits. One inline `index.lock` race survived (removed, retry PASS). | MEDIUM | CLEAN | agent-father | 2026-05-13 |

---

## Deferred

| Sprint | Title | Reason | Next Step |
|--------|-------|--------|-----------|
| 1887 | METHODOLOGY-FORENSICS: Virtual Capital / related-party graph detector | Needs own architect brief — graph-store choice, related-party data source, traversal patterns, false-positive control all unspecified | When 1885+1886 ship, queue separate ARCH-1887 brief before ba spec |
| 1892a-ops AC-3 | OPS-NOTE: 1892a-ops AC-3 now UNBLOCKED by 1892b merge (2026-05-12). VPS POST to `/api/push-news` should reach MCP server after deploy. Recommend ops re-verify next cycle via 1892a-ops test suite (NOT a new task — observational note only). | Unblocked 2026-05-12 | ops re-verify next cycle (observational) |
| TNB-c39-#3 | MONITOR: unified-agent FPT pillar gap (2nd cycle of evidence at c39) | Per TNB protocol need 3rd cycle to auto-cure. c40 daily review (~02:01 UTC) is the verification window. No action this sprint. | If c40 unified-agent cycle repeats FPT-without-pillars pattern → spawn auto-cure CHORE (unified-agent flow Step adding mandatory pillar enumeration). If c40 PASSES → close as transient. |
| TNB-c39-#5 | CLOSED 2026-05-13 c60: SPIKE_006 RCA superseded this MONITOR. Verdict H-A methodology-bug CONFIRMED (NOT pipeline catching up). c61 BA spec proposal: scoring unification + intraday-fallback gating + threshold floor 0.1%→1.0% + n<20 guard. See `docs/architecture-briefs/2026-05-13-alert-quality-22pct-spike-006-rca.md`. | RESOLVED | (closed) |
