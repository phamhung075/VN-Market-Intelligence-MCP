# PO Notebook

## Last updated: 2026-05-09 (Sprint 1860 kickoff)

## Current sprint: 1860

### State at session start

- Baseline: 8804 pass / 1 intentional fail (1331a RED guard), totalTasksDone=515, toolCount=128
- Sprint 1858 DONE: 1858a pollNews cooldown + 1858c safeLogVpsPush wrapper
- pipeline-state.json: idle at session start -> updated to in_progress for Sprint 1860
- MCP infra: DOWN per project-stats.json (ECONNREFUSED since 2026-05-06)

### Channel audit (2026-05-09 session)

- MARKET: not audited (MCP infra DOWN)
- WORK: Sprint 1858 completed cleanly
- BUG: flooded with stale processed reports still visible in Telegram. Root cause: 3 bugs identified (see session log)
Result: BUG channel unusable — Sprint 1860 targets this

### Sprint 1860 decision

BUG channel hygiene. 3 root causes making the channel unusable:

1. **Telegram deletion silent failure** — process_telegram_report marks row processed even when delete fails. FIX 1860a.
2. **Monitoring reports accumulate forever** — no expiry, C-6 guard blocks cleanup. SPRINT-S 1860c + 1860d.
3. **No dedup at submission** — agents file identical reports every cycle. FIX 1860b.

5 tasks total: 2 FIX (high priority, recurring bugs) + 3 SPRINT-S (medium).

Dependency chain: 1860a+1860b (parallel, no deps) -> 1860c -> 1860d (depends c) + 1860e (depends a)

### Test baseline tracking

| Sprint | Pass | Fail | Date |
|--------|------|------|------|
| 1846 close | 8804 | 1 (intentional) | 2026-05-03 |
| 1858 close | 8804 | 1 (intentional) | 2026-05-08 |
| 1860 target | 8804+N | <=1 (1331a only) | — |

### Patterns observed

- BUG channel pollution is a systemic issue: silent failures + no dedup + no expiry = exponential noise growth. All 3 must be fixed together or the channel remains unusable.
- submit_feedback is called from error boundaries in 5+ agent flows (unified-agent market/prediction/weekly/daily-review, digest-predict). Each fires every cycle on persistent issues. Dedup at DB level is the only scalable fix.
- Monitoring resolution was added in Sprint 1849 but without a cleanup path — design oversight. The C-6 guard correctly prevents infinite triage loops but also prevents any garbage collection.
- MCP infra has been DOWN since 2026-05-06. This is a separate issue (ops intervention required per project-stats.json). Not blocking Sprint 1860 which is code-level fixes.
