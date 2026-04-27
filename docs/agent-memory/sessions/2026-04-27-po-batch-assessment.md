# PO Session: Batch Assessment — Sprint 1346 Open Reports (2026-04-27)

**Agent:** PO (Product Owner)
**Time:** 2026-04-27 14:15 UTC+2
**Action:** Assess open reports + discover new bug; create task batch for dev pipeline

---

## Input

User reported 4 open issues from read_telegram_reports (status="new"):
- **1314 (MEDIUM):** DSC CEO bearish warning — impact_chain returned 4 instead of market-wide
- **1315 (MEDIUM):** VPBankS/OKX crypto partnership — banking cascade incomplete (only 4 banks, missing competitive logic)
- **1319 (MEDIUM @po):** stock-classification.json tradeExposure covers only 5/31 watchlist tickers — 26 tickers lack geographic revenue mapping

**New bug discovered during assessment:**
- **Test DB pollution:** Tests writing 100+ fixture rows into production `telegram_reports` table. No test teardown. Breaks report integrity for real workflows.

---

## Assessment

### Issue Severity Matrix

| ID | Title | Type | Root | Impact | Pipeline |
|----|-------|------|------|--------|----------|
| **1319** | Stock classification gap | DATA | 26 tickers missing tradeExposure | Cascade routing ignores 86% of macro signals | FIX (1h data update) |
| **NEW** | Test DB pollution | CODE | Tests → production DB without isolation | Reports table corrupted; PO/PM/QA workflows broken | FIX (1–2h infrastructure) |
| **1314** | DSC impact chain too narrow | ARCHITECTURE | Brokerage warnings not market-wide | Morning briefing loses macro sentiment | SPRINT-S (BA spec → architect → dev) |
| **1315** | Banking cascade incomplete | ARCHITECTURE | Missing competitive/substitution logic | Analysis misses fintech threats | SPRINT-S (arch → dev) |

### Task Breakdown

#### 1347a: Test DB Isolation (CRITICAL FIX)

**Why now:** Infrastructure blocker. Can't trust test results if production DB polluted. Affects all future sprints.

**Why before cascade fix:** Quick win (1–2h). Unblocks 1346a integration test verification.

**Technical:** Wrap `telegramReportStore` CRUD in mocks or `:memory:` DB. Audit all test files touching `telegram_reports`. After full test run: verify 0 new rows in production `telegram_reports` table.

**Acceptance:** 7371+ tests pass, no production DB writes from tests.

---

#### 1347b: Stock Classification Data Gap (HIGH FIX)

**Why now:** Cascade routing depends on `tradeExposure` mapping. Current 5-ticker coverage leaves 26/30 watchlist tickers invisible to macro signals.

**Why independent:** Pure data update, no code change. Can ship immediately after validation.

**Technical:** Update `docs/data/stock-classification.json`:
1. Add 30 tickers to `watchlist` array (company, sector, exchange from MEMORY.md watchlist)
2. Populate `tradeExposure` for all 30 (geographic revenue %, estimated from industry peers)
3. Expand `reverseMap` for new sectors (real estate, utilities, oil/gas)
4. Update `sectorPeers` (3–5 peers per sector)

**Acceptance:** All 30 tickers present, 100% geographic coverage, no test regressions.

---

#### 1346e: Cascade Architecture Gap (MEDIUM BACKLOG → SPRINT-S)

**Why backlog:** Requires architecture rethink before dev. Two related gaps:
- **1314:** DSC (brokerage sentiment) returns narrow impact (4) vs. market-wide (8). When should single-stock news cascade market-wide? (≥3 peers? 50%+ sector?)
- **1315:** Banking cascade misses competitive shifts (VPBankS crypto → threat to traditional banking). Need new `COMPETITIVE_THREAT` signal type.

**Why SPRINT-S:** Non-trivial scope (M estimate: 4–6h). Requires BA spec first (define "market-wide" policy), then architect redesign, then dev implementation.

**Pipeline:** BA (spec 1346e) → Architect (cascadeEngine.ts redesign) → Developer (routing impl + tests) → QA (verify DSC/VPBankS news propagation).

**Technical Notes:**
- `cascadeEngine.ts` is god node (handles all macro-to-micro routing)
- May need DDD refactor to separate "routing policy" from "impact scoring"
- Related reports: 1314, 1315

---

## Decision Log

**Why detect test DB pollution now?**
- 1346a (test stub removal) requires integration test verification
- Found that fixture rows accumulating in production `telegram_reports`
- Blocks trust in test results → must fix before 1346a ships

**Why not immediately repair cascade?**
- Policy question: "When is brokerage sentiment market-wide?" → needs BA+architect alignment
- 1347a/1347b are quick wins (infrastructure + data)
- 1346e can run in parallel with 1347b, ready when BA spec done

**Why stock classification is FIX not BACKLOG?**
- Data gap directly breaks cascade routing (1319 is open report)
- Pure data update, zero code risk
- Unblocks better cascade improvements later

**Sizing:** 1347a (1–2h), 1347b (1h), 1346e (BA spec <1h + architect <2h + dev 2–3h = M sprint). Parallel: 1347a + 1347b, then 1346e when BA ready.

---

## Files Updated

- **TASKS.md** — Added 1347a (CRITICAL), 1347b (HIGH), updated 1346e type to SPRINT-S
- **project-stats.json** — Updated currentSprintNotes with batch summary
- **docs/TASK_BATCH_ASSESSMENT_20260427.md** — Full technical assessment (created)

---

## Next Agent

**Primary:** Developer (Task 1347a: test DB isolation)
**Parallel:** Developer (Task 1347b: stock classification data)
**Then:** BA (Task 1346e spec: cascade scope policy)

Instruction: Execute 1347a + 1347b in parallel. After both complete and tests pass, signal ready for 1346e BA spec.

---

**Status:** Batch assessment complete. Ready to spawn developer + BA.
