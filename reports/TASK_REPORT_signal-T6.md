# Task Report: signal-T6 — Remove DEPRECATED JSON file-scan fallback
date: 2026-05-12
outcome: APPROVED

## Summary
Doc-only delete. Removes the DEPRECATED Step 0a-fallback block (lines 117-133 on the pre-merge file) from `.claude/flows/dev-team/main.md` and rewrites the Step 0a-0 catch block: from "jump to fallback" to inline degraded path (log WARN, `pendingSignals=[]`, inbox retained, retry next cycle).

## Changed File
- `.claude/flows/dev-team/main.md` — 4 ins / 24 del = -20 net LOC

## AC Verification

| AC | Criterion | Result |
|----|-----------|--------|
| AC-1 | Lines 117-133 (`Step 0a-fallback` block + code fence) deleted | PASS |
| AC-2 | Catch block describes inline degraded path — no `jump to Step 0a-fallback` text | PASS |
| AC-3 | `grep -c fallback` = 0 | PASS |
| AC-4 | Code fences balanced: 14 markers = 7 pairs, no orphan fences | PASS |
| AC-5 | Net delete 20 LOC (≤30 budget) | PASS |

## Functional Integrity
- Step 0a-0 catch block: inline degrade (WARN + skip drain + inbox untouched + retry) — INTACT
- Step 0a-1 (Glob/iterate SQLite path): INTACT (line 43)
- Dual-record write (4a + 4b): INTACT (lines 70-101)
- DELETE-based prune (5a + 5b): INTACT (lines 103-113)
- Step 0b Pipeline Resume: INTACT (line 119)

## Commit Convention (C2 Gate)
- Commit `5ce8e73e`: `chore(signals)` — type=chore, area=signals (canonical vocab)
- `Task-Id: signal-T6` (non-standard key vs `Task:` — minor, non-blocking per T4 precedent)
- `AC: AC-1, AC-2, AC-3, AC-4, AC-5` — all 5 ACs listed
- `Closes: signal-T6` — present
- C2 accrual: CONTRIBUTING (target 0.85 by 2026-05-17)

## Test Results
- bun test: N/A (doc-only smart-skip)
- bun tsc --noEmit: N/A (doc-only smart-skip)
- DDD scan: N/A (no production code)
- Security scan: N/A (no production code)

## Merge
- Merge commit: `f6f57bc5`
- Branch `task/signal-T6-fallback-removal` deleted (local)
- Method: --no-ff

## Closing Note
Signal-dedup project COMPLETE — SQLite-backed dedup is now the sole path. T1-T6 closed.

T1: create-signals-db migration (schema + indexes)
T2: backfill-signals-db (57 existing processed signals backfilled)
T3: dev-team Step 0a SQLite SELECT rewrite (flow doc)
T4: SSOT doc updates (agent-chaining-protocol + tree-map)
T5: QA integration tests (6/6 AC PASS — dedup SELECT, INSERT OR IGNORE, prune, null-DB, stale)
T6: Remove DEPRECATED JSON file-scan fallback (this task)
