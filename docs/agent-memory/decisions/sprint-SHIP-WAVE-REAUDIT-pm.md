<!-- PM Decision Journal — SHIP-WAVE-REAUDIT Sprint Decomposition -->

# PM Decisions: SHIP-WAVE-REAUDIT Task Decomposition

**Sprint:** SHIP-WAVE-REAUDIT  
**Date:** 2026-06-11T21:15Z  
**PM Session:** c300  
**Input:** Architect brief (docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md), BA spec  
**Output:** 8 atomic dev tasks + handoff files + orch-state.json update

---

## S1 — Why reputation trend fix is CRITICAL and sequenced first

**PO ruling:** "A-16 reputation trend=stable → ruled DEGRADED, in-scope for a fix task (NOT monitor-only). All 41 leaderboard items showing identical trend="stable" is exactly the 'code not give best result' the user flagged."

**Architecture finding:** `reputationComputeJob.ts` L190-197 attempts exact-date match for -7d prior record. Since actual probe dates are irregular (2026-05-18, 05-22, 05-31, 06-03, 06-06, 06-09), no row exists at exactly -7 calendar days. Query returns null, trend always "stable".

**PM sequencing decision:** (1) REAUDIT-001 must complete first because downstream stale-flag fixes (REAUDIT-002, etc.) depend on trustworthy reputation data. Stale flags signal "data is aged but GOOD" — they assume the served data is actually correct. (2) If reputation trend remains 100% stable after this sprint, stale flags become misleading (you see a stale marker, assume the data is merely aged; you don't see that the trend was never computed correctly). (3) CRITICAL priority enforces this: reputation trust is prerequisite for downstream quality assertions.

**What was NOT done:** Did not wait for "verify next cron cycle" before creating task. Task handoff notes that QA must wait 08:30 UTC cron run to verify live trend distribution, but dev work (code fix) is ready NOW and should be merged immediately so it lands in the next cron cycle.

---

## S2 — Why NFR-C-1 Option A (handler-level stale flags) vs. Option B (middleware)

**Architecture brief decision:** "Option A — each handler adds stale: boolean, staleByDays: number inline... Thresholds differ per endpoint type (2 trading days for market data, 90 days for financial filings). Option B (middleware) would need cross-cutting threshold config with no clean DDD layer home."

**PM decision:** Accept architect ruling. Rationale: (1) Staleness thresholds vary (2d for conviction-history, 3d for reputation, 55d for shareholders, 14d for financials). (2) A single middleware decorator needs per-endpoint config somewhere — domain, application, interface layer? None are natural fits. (3) Handler-level is explicit and testable: each handler knows its own SLA. (4) Implementation cost is low (3–4 lines per handler + 1 shared utility), no new architectural primitives.

**What was NOT debated:** Did not re-litigate Option A vs. B. Architect made the decision; PM executes.

---

## S3 — Why foreign-flow stale_fields is separate concept from NFR-C-1

**Finding:** `currentHoldingRatio`, `maxHoldingRatio`, `marketCapBn` are null on 100% of ~103 rows. These are structurally unavailable (source API doesn't populate them), not stale (absent today but present yesterday).

**PM distinction:** (1) NFR-C-1 stale flags = "data is aged, query is fresh" (signal: wait for newer data). (2) stale_fields = "column is not available at source, never populated" (signal: don't expect data here). (3) Different consumer semantics: stale says "refresh later"; stale_fields says "this metric doesn't exist here". (4) Created REAUDIT-003 as separate task from REAUDIT-002 to keep concerns isolated.

**WIP impact:** Both are HIGH priority but independent zones (mcp-server + different endpoints). REAUDIT-003 can parallel with REAUDIT-002 in the same mcp-server zone (no file contention, just different handlers).

---

## S4 — Why stockPerformance direction is pure interface derivation

**Finding:** `market_summaries.stock_performance_json` has `changePct` (signed float) but no directional field. Frontend computes color from `changePct` sign (correct) but cannot render arrow without field in contract.

**PM decision:** (1) `direction: up|down|flat` is derived from `changePct` sign at read time. (2) No business logic, no domain computation, no DB schema change. (3) Interface layer (handler) owns responsibility for shaping data for frontend. (4) Created REAUDIT-004 as separate task but MEDIUM priority (visual enhancement, not data-quality fix like REAUDIT-001/002/003). (5) Paired with FE-REAUDIT-3 (frontend consumes the field for arrow render).

**What was NOT done:** Did not add direction to DB schema; did not move computation to a domain layer; kept it interface-only.

---

## S5 — Why financials yoyDirection is LOW priority (improvement lane)

**Finding:** `revenueYoy` and `netProfitYoy` exist as signed floats. BA spec flagged as improvement-lane item (not BROKEN or DEGRADED, just "nice to have").

**PM decision:** (1) Lowest priority in sprint. (2) Sequenced LAST after stale flags + direction arrows. (3) Can be deferred to next sprint if mcp-server WIP fills up. (4) Frontend does NOT require this field (already colors by yoy sign). (5) Created REAUDIT-005 as separate task with LOW priority and deferral note.

**What was NOT done:** Did not fold this into REAUDIT-004 (different metrics, different handlers, cleaner as separate task despite low priority).

---

## S6 — Why frontend tasks are paired with mcp-server tasks via depends_on

**PM decision:** (1) FE-REAUDIT-1 depends_on REAUDIT-002 (cannot implement stale banners until mcp-server contract has stale/staleByDays fields). (2) FE-REAUDIT-2 depends_on REAUDIT-003 (cannot render stale_fields badge until handler provides array). (3) FE-REAUDIT-3 depends_on REAUDIT-004 (cannot render direction arrow until handler provides field). (4) This prevents frontend developers from starting before backend contract is finalized. (5) After backend task completes + rebuilds container, frontend task can start immediately on next slot.

**Parallel potential:** Since mcp-server has 5 tasks and frontend has 3, they CAN run in parallel zones after their mcp-server pairs complete. E.g., while REAUDIT-002 is IN_PROGRESS, FE-REAUDIT-1 is still TODO; once REAUDIT-002 → review/done + rebuild, FE-REAUDIT-1 unblocks.

---

## S7 — WIP limit enforcement

**Current state:** in_progress = 2 (FU-SCHEMA-DRIFT-P8-IMPL at mcp-server + FIX-VNSTOCK-FUNDAMENTALS at mcp-server). Both in mcp-server zone.

**PM action:** (1) Did NOT dispatch REAUDIT-001 immediately. (2) Queued as TODO in backlog with full handoff. (3) When FU-SCHEMA-DRIFT or FIX-VNSTOCK completes (moves to review/done), that slot clears. (4) Main terminal (parent agent) will spawn REAUDIT-001 → dev-mcp-server next cycle. (5) WIP=2 rule maintained throughout sprint.

**Sequencing strategy:** REAUDIT-001 claims one mcp-server slot. Then REAUDIT-002 + FE-REAUDIT-1 are parallel (different zones: mcp-server + frontend). This maintains WIP=2 total (1 mcp-server + 1 frontend). Then REAUDIT-003 + FE-REAUDIT-2 next pair, etc.

**Improvement lane deferral:** If mcp-server WIP remains saturated, REAUDIT-005 can be deferred to next sprint (explicitly marked LOW priority, deferrable).

---

## S8 — Downstream ops + QA steps not PM responsibility

**Architect reminder:** "Ops: rebuild mcp-server container after each mcp-server dev task completes. Rebuild frontend container after each frontend dev task completes. QA re-verifies live after each rebuild."

**PM action:** (1) Documented in each handoff file's "Verification" or "Dependent Tasks" section. (2) Did NOT create ops or QA tasks (those are spawned by main terminal dispatcher, not PM). (3) Did encode the expectation in PM notebook and handoff notes so downstream agents see the requirement.

**Reputation trend special case:** After REAUDIT-001 lands, QA must wait for next 08:30 UTC cron run to verify live trend distribution (no trending, not test-mode). Documented in TASK_REAUDIT_001.md § Critical Timing Note.

---

## S9 — Verification gates before commit

**PM atomicity checks:**

1. **File creation:** 8 handoff files created (TASK_REAUDIT_001.md ... TASK_REAUDIT_FE_003.md) ✓
2. **orch-state.json update:** 8 new rows added to task_board.backlog, all status=TODO, all depend_on fields populated, all sprint="SHIP-WAVE-REAUDIT" ✓
3. **Zone assignment:** 5 tasks → apps/mcp-server/, 3 tasks → apps/frontend/ ✓
4. **Sequence enforcement:** task_board entries have explicit depends_on chains (REAUDIT-001 first, then 002+FE-001 parallel, etc.) ✓
5. **Size estimates:** All tasks fit ~2h window (S/M sizes, no XL tasks blocking sprint) ✓
6. **Notebook entry:** PM session c300 appended with full decision rationale ✓
7. **Commit:** Single atomic commit (7cf1d9bf) with 10 files (orch-state.json, pm.md, 8 handoffs) ✓
8. **Conservation:** No signal_queue writes; no deletions outside scope; scope locked to docs/handoffs/ + docs/data/orch/ + notebook ✓

---

## Decision Summary

**What PM decided:**
1. REAUDIT-001 (reputation trend) CRITICAL + sequenced first (downstream trust)
2. NFR-C-1 Option A (handler-level stale flags) per architect brief
3. stale_fields (REAUDIT-003) separate from stale-flag concept
4. direction fields (REAUDIT-004) pure interface derivation, interface-layer only
5. yoyDirection (REAUDIT-005) LOW priority improvement lane, deferrable
6. Frontend tasks paired with mcp-server dependencies via depends_on
7. WIP=2 limit enforced; tasks queued as TODO, not dispatched until in_progress slots clear
8. No ops/QA tasks created (main terminal's responsibility)
9. Reputation verification waits next cron cycle (async, not blocking sprint)

**What PM did NOT decide:**
- Architecture (architect decided handler-level vs. middleware; PM accepted)
- Requirements (BA and PO specified GOOD/DEGRADED/BROKEN rubrics; PM decomposed)
- Code quality standards (dev and QA own those; PM just enforces zone separation)

---

## Links

- Architect brief: docs/handoffs/SHIP-WAVE-REAUDIT-architect-brief.md
- BA spec: docs/handoffs/SHIP-WAVE-REAUDIT-BA-spec.md
- Task board: docs/data/orch/orch-state.json (task_board.backlog, SHIP-WAVE-REAUDIT sprint entries)
- Handoff files: docs/handoffs/TASK_REAUDIT_*.md (8 files)
