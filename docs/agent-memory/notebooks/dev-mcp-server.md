# dev-mcp-server -- Notebook

## 2026-06-28 — P1.5-MCP sub-chain (TASK_1983/1984/1985)

**Sprint:** CROSS-SESSION-MULTI-TEAM-ORCH phase P1.5
**Session:** 14f8039a-51ce-44f8-a7d9-0ddbe73b994e

### TASK_1983 → REVIEW (commit 4db33600)
- Extended `gcExpiredLocks` with pre-GC orphan-signal emission.
- ALLOW-LIST (DoD-P15-4): sprint-task, cowork-slot, dashboard-row.
- Single SQLite transaction (atomic emit + DELETE).
- redispatch_count carry-forward in payload (DoD-P15-3).
- 41 tests pass (11 new AC-11 suite).

### TASK_1984 → REVIEW (commit 1b751a5f)
- Added `_reaperTick(dbOverride?)` + `startPeriodicReaper()` exports.
- server.ts: timer armed at startup, cleared in close().
- DoD-P15-5: try/catch in interval callback; error logs, timer continues.
- 8 tests pass (new task-lock-reaper-timer.test.ts).

### TASK_1985 → REVIEW (commit 1b751a5f)
- owner_agent filter already in store+tool (pre-existing, verified).
- Added created_at alias in tool output normalization.
- redispatch_count already in LockRow/SELECT/...lock spread (pre-existing).
- 18 tests pass (9 new AC-1985 suite in coordination-tools.test.ts).

**ops REBUILD required before live-verify. qa/TASK_1988 owns live regression.**

## 2026-06-28 · TASK_1994 stale-test fix (DV-P2-4) — REVIEW

Sprint CROSS-SESSION-MULTI-TEAM-ORCH P3. QA found DV-P2-4 in DWF-coordination-phase2.test.ts still asserting P2 contract (ttl_seconds:1800, "cowork-leader") after TASK_1994 changed leader-lock.md to P3 fire-time election (TTL=600s, "cron:cowork:"). ONE file changed: test name updated to "Step 0b.2 / AC-P3-FIRE-ELECTION"; regex updated /ttl_seconds:\s+1800/ → /ttl_seconds:\s+600/; step0bMatch lookahead extended with |$ to handle P3 single-section doc; "cowork-leader" → "cron:cowork:". tsc 0. DWF-phase2 file: 32 pass / 0 fail (was 31p/1f). Coordination suite 7 files: 172 pass / 0 fail. new-fail count = 0 vs 53 baseline.
Zone health: tsc 0, 32/0 DWF-phase2, 172/0 coordination suite | HEALTHY

## 2026-06-29 · TASK-FEAT-NEWS-DR-HOP1 — Decision résumé backend (REVIEW)

Sprint FEAT-NEWS-DECISION-RESUME Hop 1. FR-1+FR-2+FR-3.
FR-1 (domain): newsNormalizer.ts — DOMAIN_VN_LABEL (17 domains), truncateAt120(), buildDecisionResume() pure helper; AnalysisEntry.decision_resume? optional field; normalizeNews() computes + returns it.
FR-2 (infra): schema-news.ts ADD COLUMN decision_resume TEXT (idempotent try/catch after body_text block); analysis.ts INSERT 19→20 params (decision_resume as 20th positional param via entry.decision_resume ?? null).
FR-3 (interface): newsSentimentHandler.ts — RagAnalysisRow + NewsSentimentItem + SELECT + mapper; header comment fix (positive/negative → bullish/bearish).
Tests: FEAT-NEWS-DR-builder.test.ts 11 cases GREEN; TASK-17 extended AC-NEW-1+2 (30 pass / 0 fail). tsc: clean. PRAGMA: decision_resume column exists (verified via in-memory SQLite probe).
Rebuild: YES — ops rebuild required for ADD COLUMN migration to execute on live named-volume DB.
Commit: 3fb056de.
Zone health: bun test 30/0, tsc clean, 166 tools unchanged, scheduler unchanged | HEALTHY
