# PM Session: Sprint 1345 Task Decomposition

**Date:** 2026-04-27
**Session:** PM (Project Manager)
**Input:** ARCH-1345.md (Architect design) completed
**Output:** TASKS.md updated, 5 handoff files created

---

## Task Decomposition Results

Architect design (ARCH-1345) decomposed into 5 atomic tasks with explicit dependency tiers:

### Tier 1 — Parallel Execution (all independent)

| Task | Owner | Files | Test Count | Blocker |
|------|-------|-------|----------|---------|
| 1345a | Developer | VPS svc files + vpsProxyWatchdogJob + pollNews + newsapi | +8 | None (NewsAPI key blocker RESOLVED: VPS push endpoint sufficient) |
| 1345b | Developer | pdf-extractor domain + MCP BCTC schema | +15 | None |
| 1345c | Developer | predictionMarketJob + mcp.config.json | +7 | None |
| 1345d | Developer | intelligenceCycleJob step E + market broadcast | +7 | None |

**Why parallel is safe:**
- 1345a: VPS + pollNews + newsapi (no TS overlap with others)
- 1345b: Python pdf-extractor + MCP BCTC schema (no overlap)
- 1345c: predictionMarketJob + config (unique files)
- 1345d: intelligenceCycleJob step E only (no overlap)

**Config merge risk:** 1345a and 1345c both touch `mcp.config.json` (newsSources block vs staleThresholdHours field). Different keys → git auto-merge safe. PM to sequence merges with manual JSON diff review.

### Tier 2 — Sequential (after Tier 1 merged)

| Task | Owner | Files | Test Count |
|------|-------|-------|----------|
| 1345e | QA | integration tests only | +5 |

**Dependencies:** Waits for 1345a, 1345b, 1345c, 1345d merged to main.

---

## Blocker Resolution

**BLOCKER-1345a-1:** NewsAPI key availability

**Status:** RESOLVED per architect note:

> "NewsAPI key blocker is NOT applicable. Reuters/TE use VPS push endpoints, not client-side fetching. Root cause per architect: missing systemd service files (fetch-reuters.sh and fetch-tradingeconomics.sh have no .service files on VPS). 1345a is an UNBLOCK task for ops, not a developer NewsAPI task."

**Classification:** NOT a blocker — was misidentified as developer task. Root cause is infrastructure wiring (VPS service files missing). newsapi.ts is scaffolded as stub (returns [] when key empty) so fallback chain code is complete regardless of key availability.

---

## Task Structure Summary

### 1345a — Reuters + TE Fallback Sources (HIGH priority)

**Type:** UNBLOCK → Ops infrastructure

**Acceptance Criteria:**
- VPS systemd service files created + deployed (vn-reuters-fetch.service, vn-tradingeconomics-fetch.service)
- `maybe-deploy-vps.sh` runs successfully
- VPS: `systemctl status` confirms both services active
- `vpsProxyWatchdogJob.ts` adds Reuters/TE staleness readers (query rag_analyses WHERE source='reuters'|'tradingeconomics')
- `vpsProxyWatchdogJob.ts` stale threshold = 90 min (hourly fetch + margin)
- `pollNews.ts` fallback chain: if reuters=0 AND newsapi.enabled, call newsapi fetcher
- `newsapi.ts` created (stub returns [] if key empty)
- `mcp.config.json` adds newsSources block
- 8 unit tests passing
- `bun test` ≥ 7371 + 8

**Risk (HIGH):** VPS deploy gate must run or systemd units ignored. Mitigation: PM verifies deploy log + systemctl status immediately post-merge.

---

### 1345b — BCTC Financial Validation (HIGH priority)

**Type:** SPRINT-S

**Acceptance Criteria:**
- Python: `validate_financial_figures()` pure function added to domain/services.py
- Function implements 6 validation rules (3 hard, 3 soft)
- `ExtractedContent` adds `confidence_financial: float = 1.0` field
- `process_pdf()` calls validator after step 6, stores result in model
- MCP server: BCTC schema adds nullable columns (ocr_confidence REAL, confidence_financial REAL)
- Value-investor use case: skip conviction signal when composite_confidence <= 0.3
- Value-investor: send Telegram bug alert for low-confidence extraction
- 12 unit tests (Python) + 3 integration tests (TS) passing
- Post-deploy audit script `reports/BCTC_CONFIDENCE_AUDIT_1345b.md` generated (one-time manual run)
- `bun test` ≥ 7371 + 15

**Risk (MEDIUM):** If pdf-extractor and MCP deployed at different times, window where DTO sends confidence_financial but column missing. Mitigation: MCP server checks column existence at startup, or migrate schema before restarting.

---

### 1345c — Polymarket Staleness Guard (MEDIUM priority)

**Type:** FIX

**Acceptance Criteria:**
- `checkStaleness(db, thresholdHours)` helper added to predictionMarketJob.ts
- Helper queries MAX(fetched_at) FROM prediction_markets
- Module-level `_lastStalenessAlertAt = 0` added (24h alert dedup cooldown)
- After `storeSnapshot()`, before `detectPredictionSignals()`: call staleness check
- If stale AND (now - _lastStalenessAlertAt > 24h): send Telegram bug alert, skip signals
- `mcp.config.json` adds `staleThresholdHours: 24` under predictionMarkets
- `config.ts` adds type field
- `PredictionMarketPollOptions` adds `staleThresholdHours?: number` (test injection)
- 7 unit tests passing
- `bun test` ≥ 7371 + 7

**Risk (LOW):** Module-level cooldown does not persist across container restart. On restart: one additional staleness alert may fire. Acceptable.

---

### 1345d — VN-Index Cascade Broadcast Fix (MEDIUM priority)

**Type:** FIX

**Acceptance Criteria:**
- `intelligenceCycleJob.ts` step E adds pre-pass to detect market-wide cascade batch
- Filter: alerts where signal.message?.includes("market-wide cascade")
- If filtered batch >= 2 stocks AND distinct actionCode >= 2: compose summary, call `sendTelegramMarket()`
- Market summary ONE per cycle (not per stock)
- Existing per-stock loop unchanged (routes to BUG via `notifyTelegramAlert`)
- `CycleDeps` interface adds optional `sendMarketFn?: (text: string) => Promise<boolean>` (test injection)
- 7 unit tests passing
- `bun test` ≥ 7371 + 7

**Risk (LOW):** String match "market-wide cascade" must be stable. Unit test locks the string value. If cascadeEngine.ts changes the string, test fails loudly.

---

### 1345e — Integration Test + Dashboard Validation (MEDIUM priority)

**Type:** QA Gate (waits for Tier 1 merged)

**Acceptance Criteria:**
- 5 integration tests in `1345e-integration-pipeline.test.ts`
- Test 1: `bun test` count >= 7408 (7371 + 37 new)
- Test 2: `get_source_health()` returns Reuters CB state
- Test 3: `prediction_markets.fetched_at` <= 60 min old
- Test 4: VNM BCTC row has confidence_financial < 1.0
- Test 5: Cascade event dispatches market summary to MARKET channel
- Manual VPS validation: systemctl status both services
- Manual audit: `reports/BCTC_CONFIDENCE_AUDIT_1345b.md` reviewed
- Live DB: Reuters data flowing (count > 0 in last 2h)

---

## Files Created

### Handoff Documents (5 files)

1. **docs/handoffs/TASK_1345a.md** — Reuters + TE fallback sources (VPS + watchdog + fallback chain)
2. **docs/handoffs/TASK_1345b.md** — BCTC financial validation (confidence scoring + skip logic)
3. **docs/handoffs/TASK_1345c.md** — Polymarket staleness guard (checkStaleness helper + 24h cooldown)
4. **docs/handoffs/TASK_1345d.md** — VN-Index cascade broadcast (market-wide summary to MARKET channel)
5. **docs/handoffs/TASK_1345e.md** — Integration test + dashboard validation (5 integration tests)

### TASKS.md Updated

- Moved 1345a–1345e from backlog to active sprint (todo status)
- Updated priority levels per architect recommendation
- Added handoff paths and branch names
- Added dependency tier information (Tier 1 parallel, Tier 2 sequential)
- Resolved blocker flag in BA-1345

---

## WIP Limit Enforcement

**Current WIP:** 0 In Progress (all tasks in Todo)
**Limit:** 2 In Progress max
**Next:** PM monitors as developer tasks move to In Progress. If WIP exceeds 2, escalate blocker immediately.

---

## Post-Task Actions (PM responsibility)

After each task merge:
- [ ] Verify test count matches expected (7371 + 8+15+7+7 = 7408 final)
- [ ] For 1345a: Run `maybe-deploy-vps.sh`, verify systemctl status both services
- [ ] For 1345b: Run audit script, review `BCTC_CONFIDENCE_AUDIT_1345b.md`
- [ ] For 1345c: Query `prediction_markets.fetched_at`, verify <= 60 min old
- [ ] For 1345d: Simulate cascade event, verify MARKET channel receives message
- [ ] For 1345e: All 5 integration tests passing, zero regressions

---

## Session Complete

- Input: ARCH-1345.md (architect design complete)
- Output: 5 atomic handoff tasks, TASKS.md updated, blocker RESOLVED
- Status: Ready for developer assignment
- Next: Developers claim 1345a–1345d (WIP limit = 2 max), QA awaits Tier 1 merge
